"""The store device's plumbing: where events are kept, sent and served. Plain code, no AI.

- EventStore: every event goes into a SQLite file on this computer first, so nothing is lost
  when the internet drops. Events keep the time they happened, not the time they were sent.
- WebhookSender: posts each event to your endpoint, signed with HMAC-SHA256, retrying later
  when the endpoint can't be reached.
- DeviceServer: a small HTTP server for the screens and the dashboard:
    GET  /stream      live "what is in a hand right now" messages for screens (Server-Sent Events)
    POST /ack         a screen saying it painted a product, to measure reaction time
    GET  /events.csv  every event so far, for the dashboard
    GET  /health      is the camera working, how many events wait to be sent, how fast screens react
No camera images ever pass through any of this.
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import queue
import sqlite3
import statistics
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from interactions import Event

VERSION = "0.2.0"
CSV_COLUMNS = ["id", "ts", "type", "sku", "zone", "camera", "hold_s", "other_sku"]


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).isoformat(timespec="seconds")


def event_dict(e: Event) -> dict:
    return {"id": e.id, "ts": iso(e.ts), "type": e.type, "sku": e.sku, "zone": e.zone,
            "camera": e.camera, "hold_s": e.hold_s, "other_sku": e.other_sku}


def write_csv(rows: list[dict], f) -> None:
    writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: "" if row[k] is None else row[k] for k in CSV_COLUMNS})


class EventStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, ts TEXT, type TEXT, sku TEXT, zone TEXT,"
            " camera TEXT, hold_s REAL, other_sku TEXT, sent INTEGER DEFAULT 0)"
        )
        self.db.commit()

    def add(self, events: list[Event]) -> None:
        with self.lock:
            self.db.executemany(
                "INSERT OR IGNORE INTO events (id, ts, type, sku, zone, camera, hold_s, other_sku)"
                " VALUES (:id, :ts, :type, :sku, :zone, :camera, :hold_s, :other_sku)",
                [event_dict(e) for e in events],
            )
            self.db.commit()

    def rows(self, where: str = "", limit: int | None = None) -> list[dict]:
        sql = f"SELECT {', '.join(CSV_COLUMNS)} FROM events {where} ORDER BY ts, rowid"
        if limit:
            sql += f" LIMIT {int(limit)}"
        with self.lock:
            return [dict(zip(CSV_COLUMNS, r)) for r in self.db.execute(sql).fetchall()]

    def unsent(self, limit: int = 50) -> list[dict]:
        return self.rows("WHERE sent = 0", limit)

    def mark_sent(self, event_id: str) -> None:
        with self.lock:
            self.db.execute("UPDATE events SET sent = 1 WHERE id = ?", (event_id,))
            self.db.commit()

    def counts(self) -> dict:
        with self.lock:
            total, waiting = self.db.execute("SELECT COUNT(*), COALESCE(SUM(sent = 0), 0) FROM events").fetchone()
        return {"total": total, "unsent": waiting}

    def to_csv(self) -> str:
        buf = io.StringIO()
        write_csv(self.rows(), buf)
        return buf.getvalue()


def sign(body: bytes, secret: str) -> str:
    """What goes in the X-Almost-Signature header. Your endpoint recomputes it to check the sender."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class WebhookSender(threading.Thread):
    def __init__(self, store: EventStore, url: str, secret: str):
        super().__init__(daemon=True)
        self.store, self.url, self.secret = store, url, secret
        self.last_error: str | None = None

    def run(self) -> None:
        while True:
            for row in self.store.unsent():
                body = json.dumps(row).encode()
                req = urllib.request.Request(self.url, data=body, method="POST", headers={
                    "Content-Type": "application/json",
                    "X-Almost-Event": row["type"],
                    "X-Almost-Signature": sign(body, self.secret),
                })
                try:
                    with urllib.request.urlopen(req, timeout=5) as res:
                        if res.status >= 300:
                            raise urllib.error.HTTPError(self.url, res.status, "not accepted", res.headers, None)
                    self.store.mark_sent(row["id"])
                    self.last_error = None
                except (urllib.error.URLError, OSError) as err:
                    self.last_error = str(err)
                    break  # offline or refused: keep the rest in order and try again shortly
            time.sleep(2)


class Broadcaster:
    """Sends live messages to every connected screen."""

    def __init__(self):
        self.lock = threading.Lock()
        self.clients: list[queue.Queue] = []
        self.current: dict = {"type": "held", "zones": {}}  # sent to a screen as soon as it connects
        self.fires: dict[str, float] = {}  # fire id -> when the device decided, to time the screen
        self.latencies_ms: list[float] = []

    def publish_held(self, zones: dict[str, list[str]]) -> None:
        fire = f"f{time.monotonic_ns()}"
        msg = {"type": "held", "zones": zones, "fire": fire}
        with self.lock:
            self.current = msg
            self.fires[fire] = time.monotonic()
            if len(self.fires) > 200:
                self.fires.pop(next(iter(self.fires)))
            clients = list(self.clients)
        for q in clients:
            q.put(msg)

    def ack(self, fire: str) -> float | None:
        with self.lock:
            decided = self.fires.pop(fire, None)
            if decided is None:
                return None
            ms = (time.monotonic() - decided) * 1000
            self.latencies_ms = (self.latencies_ms + [ms])[-500:]
            return ms

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        with self.lock:
            self.clients.append(q)
            q.put(self.current)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)


class DeviceServer:
    def __init__(self, store: EventStore, broadcaster: Broadcaster, health: dict, host: str, port: int,
                 webhook: WebhookSender | None = None):
        self.store, self.broadcaster, self.health, self.webhook = store, broadcaster, health, webhook
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # keep the terminal for events
                pass

            def cors(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                # Lets a page served from the internet reach this device on the local network (Chrome).
                self.send_header("Access-Control-Allow-Private-Network", "true")

            def do_OPTIONS(self):
                self.send_response(204)
                self.cors()
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.end_headers()

            def send(self, status: int, body: str, content_type: str):
                data = body.encode()
                self.send_response(status)
                self.cors()
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                path = self.path.split("?")[0]
                if path == "/events.csv":
                    self.send(200, server.store.to_csv(), "text/csv; charset=utf-8")
                elif path == "/health":
                    self.send(200, json.dumps(server.health_report()), "application/json")
                elif path == "/stream":
                    self.stream()
                else:
                    self.send(404, json.dumps({"error": "not found"}), "application/json")

            def do_POST(self):
                if self.path.split("?")[0] != "/ack":
                    self.send(404, json.dumps({"error": "not found"}), "application/json")
                    return
                try:
                    length = min(int(self.headers.get("Content-Length", 0)), 1000)
                    fire = json.loads(self.rfile.read(length) or b"{}").get("fire", "")
                except (ValueError, json.JSONDecodeError):
                    fire = ""
                ms = server.broadcaster.ack(str(fire))
                self.send(200, json.dumps({"ms": ms}), "application/json")

            def stream(self):
                self.send_response(200)
                self.cors()
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                q = server.broadcaster.subscribe()
                server.health["screens"] = len(server.broadcaster.clients)
                try:
                    while True:
                        try:
                            msg = q.get(timeout=15)
                            self.wfile.write(f"data: {json.dumps(msg)}\n\n".encode())
                        except queue.Empty:
                            self.wfile.write(b": still here\n\n")  # keeps the connection open
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                    pass
                finally:
                    server.broadcaster.unsubscribe(q)
                    server.health["screens"] = len(server.broadcaster.clients)

        self.httpd = ThreadingHTTPServer((host, port), Handler)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def health_report(self) -> dict:
        lat = self.broadcaster.latencies_ms
        report = {
            "version": VERSION,
            **self.health,
            "events": self.store.counts(),
            "screen_reaction_ms": {
                "median": round(statistics.median(lat)) if lat else None,
                "slowest": round(max(lat)) if lat else None,
                "fires": len(lat),
            },
        }
        if self.webhook:
            report["webhook"] = {"url": self.webhook.url, "last_error": self.webhook.last_error}
        return report
