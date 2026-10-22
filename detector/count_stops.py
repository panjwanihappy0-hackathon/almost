"""Count shopper stops per rack in a recorded CCTV clip. Runs on your laptop, not on Vercel.

A "stop" = one shopper staying inside a rack's zone for at least MIN_SECONDS in a row.
People are found by YOLO and followed from frame to frame by ByteTrack (both AI);
the stop rule itself is plain code below.

Outputs (in --out, default "output/"):
  stops.csv           rack_id, hour, stops   -> upload as the "Stops file"
  frames/rack_<id>.jpg  the busiest moment at each rack -> upload as snapshot frames

Usage:
  1. Save the first frame so you can read rack positions (open it in Paint; the
     pixel position under your mouse shows in the bottom-left corner):
       python detector/count_stops.py clip.mp4 --first-frame
  2. Write each rack's corner points into detector/zones.json.
  3. Count stops (--start is the clock time when the clip begins):
       python detector/count_stops.py clip.mp4 --start 11:00
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import cv2
import numpy as np

MIN_SECONDS = 3.0  # how long someone must stay in a rack zone to count as a stop
GRACE_SECONDS = 1.0  # short gaps (tracker flicker) don't end a visit
FRAME_WIDTH = 960  # snapshot frames are resized to this width to stay small


def load_zones(path: Path) -> dict[str, np.ndarray]:
    raw = json.loads(path.read_text())
    zones = {rack_id: np.array(points, dtype=np.int32) for rack_id, points in raw.items()}
    for rack_id, pts in zones.items():
        if pts.ndim != 2 or pts.shape[0] < 3 or pts.shape[1] != 2:
            sys.exit(f'zones.json: rack "{rack_id}" needs at least 3 [x, y] points.')
    return zones


def save_first_frame(video: Path, out: Path) -> None:
    cap = cv2.VideoCapture(str(video))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        sys.exit(f"Couldn't read a frame from {video}.")
    out.mkdir(parents=True, exist_ok=True)
    path = out / "first_frame.jpg"
    cv2.imwrite(str(path), frame)
    h, w = frame.shape[:2]
    print(f"Saved {path} ({w}x{h}). Use these pixel coordinates in zones.json.")


def save_snapshot(frame: np.ndarray, zone: np.ndarray, path: Path) -> None:
    marked = frame.copy()
    cv2.polylines(marked, [zone], isClosed=True, color=(0, 165, 255), thickness=3)
    h, w = marked.shape[:2]
    if w > FRAME_WIDTH:
        marked = cv2.resize(marked, (FRAME_WIDTH, int(h * FRAME_WIDTH / w)))
    cv2.imwrite(str(path), marked, [cv2.IMWRITE_JPEG_QUALITY, 80])


def count_stops(video: Path, zones: dict[str, np.ndarray], start: datetime, stride: int,
                out: Path, model_name: str) -> None:
    from ultralytics import YOLO  # imported here so --first-frame works without it

    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    print(f"{video.name}: {total_frames / fps / 60:.0f} min at {fps:.0f} fps, checking every {stride} frames")

    # Per (shopper, rack): when the current visit started, when they were last seen, and
    # whether this visit has already been counted.
    visits: dict[tuple[int, str], dict] = {}
    stops: dict[tuple[str, str], int] = {}  # (rack_id, "HH:00") -> count
    busiest: dict[str, int] = {}  # rack_id -> most people seen in the zone at once

    model = YOLO(model_name)
    frames_dir = out / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    results = model.track(source=str(video), stream=True, persist=True, classes=[0],
                          tracker="bytetrack.yaml", vid_stride=stride, conf=0.3, verbose=False)
    for i, result in enumerate(results):
        t = i * stride / fps  # seconds since the clip started
        if i % 500 == 0 and total_frames:
            print(f"  {100 * i * stride / total_frames:.0f}%", flush=True)
        if result.boxes is None or result.boxes.id is None:
            continue

        people_in_zone = {rack_id: 0 for rack_id in zones}
        for (x1, y1, x2, y2), track_id in zip(result.boxes.xyxy.tolist(), result.boxes.id.int().tolist()):
            feet = (float((x1 + x2) / 2), float(y2))  # where the person stands
            for rack_id, zone in zones.items():
                if cv2.pointPolygonTest(zone, feet, False) < 0:
                    continue
                people_in_zone[rack_id] += 1
                key = (track_id, rack_id)
                visit = visits.get(key)
                if visit is None or t - visit["last_seen"] > GRACE_SECONDS:
                    visit = {"start": t, "last_seen": t, "counted": False}
                    visits[key] = visit
                visit["last_seen"] = t
                if not visit["counted"] and t - visit["start"] >= MIN_SECONDS:
                    visit["counted"] = True
                    hour = (start + timedelta(seconds=visit["start"])).strftime("%H:00")
                    stops[(rack_id, hour)] = stops.get((rack_id, hour), 0) + 1

        # Keep the busiest moment at each rack as evidence for the brief.
        for rack_id, n in people_in_zone.items():
            if n > busiest.get(rack_id, 0):
                busiest[rack_id] = n
                save_snapshot(result.orig_img, zones[rack_id], frames_dir / f"rack_{rack_id}.jpg")

    csv_path = out / "stops.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["rack_id", "hour", "stops"])
        for (rack_id, hour), n in sorted(stops.items()):
            writer.writerow([rack_id, hour, n])

    print(f"\nWrote {csv_path}")
    for rack_id in zones:
        total = sum(n for (r, _), n in stops.items() if r == rack_id)
        print(f"  {rack_id}: {total} stops")
    print(f"Snapshot frames in {frames_dir} (upload up to 4, for the racks you care about most)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path, help="recorded CCTV clip, e.g. clip.mp4")
    parser.add_argument("--zones", type=Path, default=Path(__file__).with_name("zones.json"))
    parser.add_argument("--out", type=Path, default=Path("output"))
    parser.add_argument("--start", default="00:00", help='clock time the clip starts, e.g. "11:00"')
    parser.add_argument("--stride", type=int, default=5, help="check every Nth frame (higher = faster)")
    parser.add_argument("--model", default="yolo11n.pt", help="YOLO model (downloaded on first run)")
    parser.add_argument("--first-frame", action="store_true", help="only save the first frame, then stop")
    args = parser.parse_args()

    if not args.video.exists():
        sys.exit(f"Video not found: {args.video}")
    if args.first_frame:
        save_first_frame(args.video, args.out)
        return
    try:
        start = datetime.strptime(args.start, "%H:%M")
    except ValueError:
        sys.exit('--start must look like "11:00".')
    count_stops(args.video, load_zones(args.zones), start, max(1, args.stride), args.out, args.model)


if __name__ == "__main__":
    main()
