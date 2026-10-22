"""Almost's pickup detector: a webcam beside a rack sees which product a shopper picks up,
how long they hold it, and whether it goes back. Runs on a laptop or small PC in the store.

  python detector/pickups.py enroll NEW-201      take reference photos of a product (SPACE = photo)
  python detector/pickups.py enroll _none        photos of empty hands and the bare shelf
  python detector/pickups.py zones               click the shelf areas the camera watches
  python detector/pickups.py run --show          start detecting (screens connect to port 8765)
  python detector/pickups.py simulate            no camera: fake shoppers, to demo screens and the dashboard
  python detector/pickups.py simulate --day 2026-10-21 --csv samples/good/events.csv
                                                 write a whole simulated day as a CSV
  python detector/pickups.py export              write every event so far to output/events.csv

People and their hands are found by a YOLO pose model and followed by ByteTrack, and the
product in a hand is matched against your photos (recognise.py): both AI. Deciding what
counts as a pickup, put-back or comparison is plain code (interactions.py).

Privacy: frames are analysed in memory and thrown away. Nothing from the camera is written
to disk or sent anywhere, except the product photos you take on purpose with `enroll`.
No face recognition; tracking numbers last seconds and belong to this camera only.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path

from interactions import Event, HandSighting, InteractionTracker
from store_device import Broadcaster, DeviceServer, EventStore, WebhookSender, event_dict, write_csv

HERE = Path(__file__).resolve().parent
CATALOG = HERE.parent / "data" / "products.json"
RACK_MAP = HERE.parent / "data" / "rack-map.json"
PHOTOS_DIR = HERE / "products"
ZONES = HERE / "pickup_zones.json"
OUT = Path("output")
KEYPOINT_CONF = 0.35  # ignore wrists and elbows the pose model isn't sure about
LEFT, RIGHT = (9, 7), (10, 8)  # COCO keypoints: (wrist, elbow)


def load_catalog() -> dict[str, dict]:
    products = json.loads(CATALOG.read_text(encoding="utf-8"))["products"]
    return {p["sku"]: p for p in products}


def parse_camera(value: str):
    return int(value) if value.isdigit() else value  # "0" = first webcam; otherwise an RTSP URL or a file


def open_camera(value: str):
    import cv2

    cap = cv2.VideoCapture(parse_camera(value))
    if not cap.isOpened():
        sys.exit(f"Couldn't open camera {value!r}. Try --camera 1, or an rtsp:// address.")
    return cap


def print_event(e: Event, catalog: dict[str, dict]) -> None:
    name = catalog.get(e.sku, {}).get("name", e.sku)
    extra = f" for {e.hold_s:.1f} s" if e.hold_s is not None else ""
    if e.type == "compare":
        extra = f" against {catalog.get(e.other_sku or '', {}).get('name', e.other_sku)}"
    print(f"{datetime.fromtimestamp(e.ts):%H:%M:%S}  {e.type:<8} {name} ({e.sku}) at {e.zone}{extra}", flush=True)


def start_device(args, health: dict):
    store = EventStore(args.db)
    broadcaster = Broadcaster()
    webhook = None
    if args.webhook:
        secret = os.environ.get("ALMOST_WEBHOOK_SECRET", "")
        if not secret:
            sys.exit("Set ALMOST_WEBHOOK_SECRET first, so your endpoint can check each event came from this device.")
        webhook = WebhookSender(store, args.webhook, secret)
        webhook.start()
    DeviceServer(store, broadcaster, health, args.host, args.port, webhook)
    print(f"Store device on http://{'localhost' if args.host == '127.0.0.1' else args.host}:{args.port} "
          f"(screens: /screen page of the web app; dashboard: Live mode)")
    return store, broadcaster


# ---------------------------------------------------------------- enroll


def enroll(args) -> None:
    import cv2

    catalog = load_catalog()
    if args.sku != "_none" and args.sku not in catalog:
        sys.exit(f"{args.sku} is not in data/products.json. Known SKUs: {', '.join(catalog)}")
    folder = PHOTOS_DIR / args.sku
    folder.mkdir(parents=True, exist_ok=True)
    cap = open_camera(args.camera)
    what = "empty hands, hands near the shelf, the bare shelf" if args.sku == "_none" else catalog[args.sku]["name"]
    print(f"Hold {what} inside the box. SPACE = take a photo, A = auto (one every 0.4 s), Q = done.\n"
          "Aim for 20+ photos: front, back, folded, in one hand, near and far.")
    auto, last = False, 0.0
    count = len(list(folder.glob("*.jpg")))
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        side = int(min(h, w) * 0.6)
        x1, y1 = (w - side) // 2, (h - side) // 2
        view = frame.copy()
        cv2.rectangle(view, (x1, y1), (x1 + side, y1 + side), (32, 176, 255), 2)
        cv2.putText(view, f"{args.sku}: {count} photos{'  AUTO' if auto else ''}", (12, 32),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (32, 176, 255), 2)
        cv2.imshow("Almost enroll", view)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break
        if key == ord("a"):
            auto = not auto
        if key == ord(" ") or (auto and time.time() - last > 0.4):
            last = time.time()
            cv2.imwrite(str(folder / f"{int(last * 1000)}.jpg"), frame[y1:y1 + side, x1:x1 + side])
            count += 1
    cap.release()
    cv2.destroyAllWindows()
    print(f"{count} photos in {folder}")


# ---------------------------------------------------------------- zones


def draw_zones(args) -> None:
    import cv2

    racks = args.racks or [r["id"] for r in json.loads(RACK_MAP.read_text(encoding="utf-8"))["racks"]]
    cap = open_camera(args.camera)
    for _ in range(10):  # let the webcam settle its exposure
        ok, frame = cap.read()
    cap.release()
    if not ok:
        sys.exit("Couldn't read a frame from the camera.")
    zones: dict[str, list[list[int]]] = {}
    points: list[list[int]] = []

    def on_click(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN:
            points.append([x, y])

    cv2.namedWindow("Almost zones")
    cv2.setMouseCallback("Almost zones", on_click)
    print("Click the corners of each rack's shelf area. ENTER = next rack, U = undo, S = skip, Q = stop.")
    i = 0
    while i < len(racks):
        view = frame.copy()
        for rack_id, pts in zones.items():
            cv2.polylines(view, [np_points(pts)], True, (180, 211, 52), 2)
            cv2.putText(view, rack_id, tuple(pts[0]), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (180, 211, 52), 2)
        if points:
            cv2.polylines(view, [np_points(points)], len(points) > 2, (32, 176, 255), 2)
        cv2.putText(view, f"Drawing {racks[i]}", (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (32, 176, 255), 2)
        cv2.imshow("Almost zones", view)
        key = cv2.waitKey(20) & 0xFF
        if key == 13 and len(points) >= 3:
            zones[racks[i]] = points.copy()
            points.clear()
            i += 1
        elif key == ord("u") and points:
            points.pop()
        elif key == ord("s"):
            points.clear()
            i += 1
        elif key in (ord("q"), 27):
            break
    cv2.destroyAllWindows()
    if not zones:
        sys.exit("No zones drawn; nothing saved.")
    h, w = frame.shape[:2]
    args.zones.write_text(json.dumps({"frame": [w, h], "zones": zones}, indent=2))
    print(f"Saved {len(zones)} zones to {args.zones}")


def np_points(pts):
    import numpy as np

    return np.array(pts, dtype=np.int32)


def load_zones(path: Path, frame_w: int, frame_h: int) -> dict:
    """Shelf zones scaled to the camera's real frame size."""
    import numpy as np

    if not path.exists():
        sys.exit(f"No shelf zones yet. Draw them with: python detector/pickups.py zones\n"
                 f"(or use --presentation to count anything held up to the camera)")
    raw = json.loads(path.read_text())
    w0, h0 = raw.get("frame", [frame_w, frame_h])
    scale = np.array([frame_w / w0, frame_h / h0])
    return {rack: (np.array(pts, dtype=np.float32) * scale).astype(np.int32) for rack, pts in raw["zones"].items()}


# ---------------------------------------------------------------- run


def run(args) -> None:
    import cv2
    from ultralytics import YOLO

    from recognise import ProductRecogniser, hand_crop

    catalog = load_catalog()
    recogniser = ProductRecogniser(args.photos, set(catalog), min_score=args.min_score)
    pose = YOLO(args.pose_model)
    cap = open_camera(args.camera)
    ok, frame = cap.read()
    if not ok:
        sys.exit("The camera opened but sent no picture.")
    zones = {} if args.presentation else load_zones(args.zones, frame.shape[1], frame.shape[0])

    health = {"camera": args.camera_name, "camera_ok": True, "fps": 0.0, "screens": 0,
              "mode": "presentation" if args.presentation else "shelf", "started": datetime.now().isoformat(timespec="seconds")}
    store, broadcaster = start_device(args, health)
    tracker = InteractionTracker(args.camera_name, presentation=args.presentation)
    last_held: dict = {}
    frames, fps_since = 0, time.time()
    print("Watching. Ctrl+C to stop." + ("" if args.show else " (add --show to see what the camera sees)"))

    def zone_of(point) -> str | None:
        for rack_id, poly in zones.items():
            if cv2.pointPolygonTest(poly, (float(point[0]), float(point[1])), False) >= 0:
                return rack_id
        return None

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if Path(args.camera).is_file():
                    break  # a recorded clip has ended
                health["camera_ok"] = False
                print("Camera lost; reconnecting…", flush=True)
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(parse_camera(args.camera))
                continue
            health["camera_ok"] = True
            t = time.time()

            result = pose.track(frame, persist=True, tracker="bytetrack.yaml", conf=0.4, imgsz=args.imgsz, verbose=False)[0]
            crops, hands = [], []
            if result.boxes is not None and result.boxes.id is not None and result.keypoints is not None:
                kxy = result.keypoints.xy.cpu().numpy()
                kconf = result.keypoints.conf.cpu().numpy() if result.keypoints.conf is not None else None
                boxes = result.boxes.xyxy.cpu().numpy()
                for i, person in enumerate(result.boxes.id.int().tolist()):
                    person_h = float(boxes[i][3] - boxes[i][1])
                    for side, (w_i, e_i) in (("L", LEFT), ("R", RIGHT)):
                        if kconf is not None and kconf[i][w_i] < KEYPOINT_CONF:
                            continue
                        elbow = kxy[i][e_i] if kconf is None or kconf[i][e_i] >= KEYPOINT_CONF else None
                        crop = hand_crop(frame, kxy[i][w_i], elbow, person_h)
                        if crop is not None:
                            crops.append(crop[0])
                            hands.append((person, side, zone_of(kxy[i][w_i]), crop[1]))
            labels = recogniser.classify(crops)
            sightings = [HandSighting(p, s, sku, z) for (p, s, z, _), (sku, _) in zip(hands, labels)]

            events = tracker.update(t, sightings)
            if events:
                store.add(events)
                for e in events:
                    print_event(e, catalog)
            held = tracker.held_by_zone()
            if held != last_held:
                broadcaster.publish_held(held)
                last_held = held

            frames += 1
            if t - fps_since >= 2:
                health["fps"] = round(frames / (t - fps_since), 1)
                frames, fps_since = 0, t
            if args.show:
                for rack_id, poly in zones.items():
                    cv2.polylines(frame, [poly], True, (180, 211, 52), 2)
                    cv2.putText(frame, rack_id, tuple(int(v) for v in poly[0]), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (180, 211, 52), 2)
                for (person, side, zone, (x1, y1, x2, y2)), (sku, score) in zip(hands, labels):
                    colour = (32, 176, 255) if sku else (120, 120, 120)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
                    label = f"#{person}{side} {sku or '-'} {score:.2f}" + (f" @{zone}" if zone else "")
                    cv2.putText(frame, label, (x1, max(16, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)
                cv2.putText(frame, f"{health['fps']} fps", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                cv2.imshow("Almost pickups (not recorded)", frame)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break
    except KeyboardInterrupt:
        pass
    finally:
        final = tracker.close(time.time())
        store.add(final)
        cap.release()
        if args.show:
            cv2.destroyAllWindows()
        print(f"\nStopped. {store.counts()['total']} events in {args.db}")


# ---------------------------------------------------------------- simulate

# How often each product gets picked up, and how often it goes back. Sample numbers chosen so
# the window display (R4) draws lots of hands but, with samples/good/pos.csv, few sales.
SIM_INTEREST = {"WIN-401": 10, "WIN-402": 6, "NEW-201": 6, "NEW-202": 5, "NEW-203": 4, "DNM-101": 6,
                "DNM-102": 5, "DNM-103": 4, "KRT-301": 6, "KRT-302": 4, "KRT-303": 3, "ACC-501": 2, "ACC-502": 1,
                "ACC-503": 0}
SIM_PUT_BACK = {"WIN-401": 0.85, "WIN-402": 0.8, "NEW-201": 0.75, "NEW-202": 0.75, "NEW-203": 0.8,
                "KRT-301": 0.35, "KRT-302": 0.45, "DNM-101": 0.4, "DNM-102": 0.45}
SIM_HOLD = {"dress": (12, 60), "jacket": (8, 40), "kurta": (8, 40), "jeans": (6, 35)}  # seconds, min to max


class Shopper:
    """Scripted hand sightings for one simulated shopper at one rack."""

    def __init__(self, person: int, start: float, catalog: dict[str, dict], rng: random.Random):
        self.person, self.rng = person, rng
        weights = [SIM_INTEREST.get(sku, 1) for sku in catalog]
        first = rng.choices(list(catalog), weights=weights)[0]
        rack = catalog[first]["rack"]
        same_rack = [s for s in catalog if catalog[s]["rack"] == rack and s != first and SIM_INTEREST.get(s, 1) > 0]
        skus = [first] + rng.sample(same_rack, k=min(len(same_rack), rng.choice([0, 0, 1, 1, 2])))
        self.segments: list[tuple[float, str | None, str | None]] = []  # (until, sku in hand, zone of hand)
        t = start + rng.uniform(0, 2)
        for sku in skus:
            lo, hi = SIM_HOLD.get(catalog[sku]["kind"], (3, 25))
            hold = rng.uniform(lo, hi)
            for duration, in_hand, zone in ((0.8, None, rack), (0.4, sku, rack), (hold, sku, None)):
                t += duration
                self.segments.append((t, in_hand, zone))
            if rng.random() >= SIM_PUT_BACK.get(sku, 0.6):
                break  # keeps it and walks off towards the till
            for duration, in_hand, zone in ((0.4, sku, rack), (0.8, None, rack), (rng.uniform(0.5, 3), None, None)):
                t += duration
                self.segments.append((t, in_hand, zone))
        self.end = t

    def sighting(self, t: float) -> HandSighting | None:
        for until, sku, zone in self.segments:
            if t <= until:
                if sku and self.rng.random() < 0.06:
                    sku = None  # the recogniser misses a frame now and then
                return HandSighting(self.person, "R", sku, zone)
        return None


def simulate(args) -> None:
    catalog = load_catalog()
    rng = random.Random(args.seed)
    fps = 5 if args.day else 10
    if args.day:
        start = datetime.strptime(f"{args.day} {args.start}", "%Y-%m-%d %H:%M").timestamp()
        end = start + args.hours * 3600
        gap = args.gap or 40.0
    else:
        start, end, gap = time.time(), float("inf"), args.gap or 7.0
        health = {"camera": "simulator", "camera_ok": True, "fps": float(fps), "screens": 0, "mode": "simulated",
                  "started": datetime.now().isoformat(timespec="seconds")}
        store, broadcaster = start_device(args, health)
        print("Simulating shoppers. Ctrl+C to stop.")

    tracker = InteractionTracker("simulator")
    shoppers: list[Shopper] = []
    collected: list[Event] = []
    next_arrival, person, t = start, 0, start
    last_held: dict = {}
    try:
        while t < end:
            if t >= next_arrival:
                person += 1
                shoppers.append(Shopper(person, t, catalog, rng))
                next_arrival = t + rng.expovariate(1 / gap)
            sightings = [s for s in (sh.sighting(t) for sh in shoppers) if s]
            shoppers = [sh for sh in shoppers if sh.end > t]
            events = tracker.update(t, sightings)
            if args.day:
                collected += events
            else:
                if events:
                    store.add(events)
                    for e in events:
                        print_event(e, catalog)
                held = tracker.held_by_zone()
                if held != last_held:
                    broadcaster.publish_held(held)
                    last_held = held
                time.sleep(max(0.0, t + 1 / fps - time.time()))
            t += 1 / fps
    except KeyboardInterrupt:
        pass
    if args.day:
        collected += tracker.close(t)
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", newline="", encoding="utf-8") as f:
            write_csv([event_dict(e) for e in sorted(collected, key=lambda e: e.ts)], f)
        counts = {k: sum(e.type == k for e in collected) for k in ("pickup", "put_back", "taken", "compare")}
        print(f"Wrote {len(collected)} events to {args.csv}: {counts}")


# ---------------------------------------------------------------- export


def export(args) -> None:
    store = EventStore(args.db)
    args.csv.parent.mkdir(parents=True, exist_ok=True)
    args.csv.write_text(store.to_csv(), encoding="utf-8")
    print(f"Wrote {store.counts()['total']} events to {args.csv}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    def device_options(p):
        p.add_argument("--db", type=Path, default=OUT / "events.db", help="where events are kept on this computer")
        p.add_argument("--host", default="127.0.0.1", help="0.0.0.0 lets screens on other devices connect")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--webhook", help="also POST each event here, signed with ALMOST_WEBHOOK_SECRET")

    p = sub.add_parser("enroll", help="take reference photos of a product")
    p.add_argument("sku", help="a SKU from data/products.json, or _none for 'no product' photos")
    p.add_argument("--camera", default="0")
    p.set_defaults(func=enroll)

    p = sub.add_parser("zones", help="click the shelf areas the camera watches")
    p.add_argument("--camera", default="0")
    p.add_argument("--racks", nargs="*", help="rack IDs to draw, in order (default: every rack in the rack map)")
    p.add_argument("--zones", type=Path, default=ZONES)
    p.set_defaults(func=draw_zones)

    p = sub.add_parser("run", help="detect pickups from a live camera")
    p.add_argument("--camera", default="0", help='webcam number, or an rtsp:// address')
    p.add_argument("--camera-name", default="cam1", help="name stored with each event")
    p.add_argument("--zones", type=Path, default=ZONES)
    p.add_argument("--presentation", action="store_true", help="no shelf zones: anything held up to the camera counts")
    p.add_argument("--show", action="store_true", help="show the camera with what it recognises (nothing is saved)")
    p.add_argument("--pose-model", default="yolo11n-pose.pt", help="YOLO pose model (downloaded on first run)")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--min-score", type=float, default=0.62, help="how sure the recogniser must be (0 to 1)")
    p.add_argument("--photos", type=Path, default=PHOTOS_DIR, help="reference photos, one folder per SKU")
    device_options(p)
    p.set_defaults(func=run)

    p = sub.add_parser("simulate", help="fake shoppers, no camera")
    p.add_argument("--day", help="write a whole day to --csv instead of running live, e.g. 2026-10-21")
    p.add_argument("--start", default="11:00", help="with --day: opening time")
    p.add_argument("--hours", type=float, default=4.0, help="with --day: how many hours")
    p.add_argument("--csv", type=Path, default=OUT / "events.csv")
    p.add_argument("--gap", type=float, help="average seconds between shoppers")
    p.add_argument("--seed", type=int, default=7)
    device_options(p)
    p.set_defaults(func=simulate)

    p = sub.add_parser("export", help="write every event so far to a CSV")
    p.add_argument("--db", type=Path, default=OUT / "events.db")
    p.add_argument("--csv", type=Path, default=OUT / "events.csv")
    p.set_defaults(func=export)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
