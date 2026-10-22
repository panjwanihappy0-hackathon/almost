"""Says which product, if any, is in a hand. This is the AI part of the pickup detector.

Each product has a folder of reference photos in detector/products/<SKU>/ (taken with
`pickups.py enroll`). A crop around each hand is turned into a feature vector by a small
YOLO classification model, and compared with every reference photo. A colour histogram is
compared too, so two colours of the same style can be told apart.

detector/products/_none/ holds photos of empty hands, hands near the shelf and the shelf
itself. They teach the recogniser what "no product" looks like, which cuts false pickups a lot.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

NONE = "_none"
CROP_SIZE = 224  # the classifier's input size
SHAPE_WEIGHT = 0.65  # how much the feature vector counts...
COLOUR_WEIGHT = 0.35  # ...against the colour histogram
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp"}


def colour_hist(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [18, 8], [0, 180, 0, 256])
    return cv2.normalize(hist, hist).flatten()


class ProductRecogniser:
    def __init__(self, photos_dir: Path, known_skus: set[str], model_name: str = "yolo11n-cls.pt",
                 min_score: float = 0.62, margin: float = 0.03):
        from ultralytics import YOLO

        self.model = YOLO(model_name)
        self.min_score, self.margin = min_score, margin
        self.labels: list[str] = []
        feats, hists = [], []
        unknown = []
        for folder in sorted(p for p in photos_dir.iterdir() if p.is_dir()) if photos_dir.exists() else []:
            if folder.name != NONE and folder.name not in known_skus:
                unknown.append(folder.name)
                continue
            images = [cv2.imread(str(p)) for p in sorted(folder.iterdir()) if p.suffix.lower() in IMAGE_TYPES]
            images = [img for img in images if img is not None]
            if not images:
                continue
            feats.append(self.features(images))
            hists += [colour_hist(img) for img in images]
            self.labels += [folder.name] * len(images)
        if unknown:
            print(f"Skipping photo folders for SKUs not in data/products.json: {', '.join(unknown)}")
        products = sorted(set(self.labels) - {NONE})
        if not products:
            raise SystemExit(
                f"No product photos in {photos_dir}. Add some first:\n  python detector/pickups.py enroll <SKU>"
            )
        self.ref_feats = np.concatenate(feats)
        self.ref_hists = np.stack(hists)
        self.label_arr = np.array(self.labels)
        n_none = self.labels.count(NONE)
        print(f"Recogniser ready: {len(products)} products, {len(self.labels) - n_none} product photos, "
              f"{n_none} 'no product' photos")
        if n_none == 0:
            print("  Tip: add 'no product' photos (python detector/pickups.py enroll _none) to cut false pickups.")

    def features(self, images: list[np.ndarray]) -> np.ndarray:
        """One L2-normalised feature vector per image."""
        resized = [cv2.resize(img, (CROP_SIZE, CROP_SIZE)) for img in images]
        vectors = self.model.embed(resized, imgsz=CROP_SIZE, verbose=False)
        out = np.stack([v.detach().cpu().numpy().ravel() for v in vectors]).astype(np.float32)
        return out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-8)

    def classify(self, crops: list[np.ndarray]) -> list[tuple[str | None, float]]:
        """For each crop: (SKU, score) for a confident match, or (None, score) when no product is in it."""
        if not crops:
            return []
        shape = self.features(crops) @ self.ref_feats.T  # cosine similarity, crops x references
        results = []
        for i, crop in enumerate(crops):
            hist = colour_hist(crop)
            colour = np.array([1 - cv2.compareHist(hist, ref, cv2.HISTCMP_BHATTACHARYYA) for ref in self.ref_hists])
            score = SHAPE_WEIGHT * shape[i] + COLOUR_WEIGHT * colour
            best: dict[str, float] = {}
            for label, s in zip(self.label_arr, score):
                if s > best.get(label, -1.0):
                    best[label] = float(s)
            ranked = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
            label, top = ranked[0]
            runner_up = ranked[1][1] if len(ranked) > 1 else -1.0
            if label == NONE or top < self.min_score or top - runner_up < self.margin:
                results.append((None, top))
            else:
                results.append((str(label), top))
        return results


def hand_crop(frame: np.ndarray, wrist: np.ndarray, elbow: np.ndarray | None,
              person_h: float) -> tuple[np.ndarray, tuple[int, int, int, int]] | None:
    """A square around where the hand (and anything in it) is: a little past the wrist, away from the elbow."""
    if elbow is not None and np.all(elbow > 0):
        forearm = wrist - elbow
        centre = wrist + 0.4 * forearm
        side = max(np.linalg.norm(forearm) * 1.6, person_h * 0.18)
    else:
        centre, side = wrist, person_h * 0.22
    side = float(np.clip(side, 64, 480))
    h, w = frame.shape[:2]
    x1, y1 = int(max(0, centre[0] - side / 2)), int(max(0, centre[1] - side / 2))
    x2, y2 = int(min(w, centre[0] + side / 2)), int(min(h, centre[1] + side / 2))
    if x2 - x1 < 32 or y2 - y1 < 32:
        return None
    return frame[y1:y2, x1:x2], (x1, y1, x2, y2)
