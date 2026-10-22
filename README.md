# Almost

See which racks and products shoppers are drawn to but don't buy, using cameras in the store.

- **Rack stops**: upload a day's stop counts and POS sales → racks ranked by "% of stops vs % of sales" → an AI brief (Gemini) with likely reasons and a suggested fix.
- **Product pickups**: a webcam beside a rack records which product is picked up, held, compared and put back → a product funnel joined with POS sales, and an optional screen that shows the product in the shopper's hand.

## Run the web app

1. Copy `.env.example` to `.env.local` and paste your OpenRouter API key after `OPENROUTER_API_KEY=` (get one at https://openrouter.ai/keys; Gemini is reached through OpenRouter). `.env.local` is ignored by git.
2. `npm install`
3. `npm run dev`, then open http://localhost:3000
4. Try it with the files in `samples/good/`. Every file in `samples/bad/` should give a clear error.

## Count stops from footage (on the laptop)

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r detector/requirements.txt
python detector/count_stops.py clip.mp4 --first-frame   # saves output/first_frame.jpg
# draw each rack's corners into detector/zones.json, then:
python detector/count_stops.py clip.mp4 --start 11:00
```

Upload `output/stops.csv` and up to 4 images from `output/frames/`.

## Product pickups (webcam beside a rack)

Rack stops say *which rack* drew attention. Pickups say *which product*: a webcam close to the rack sees the product and colour in a shopper's hand, how long it's held, what it's compared with and whether it goes back on the shelf.

- **Detector** (`detector/pickups.py`): runs on the store laptop. A YOLO pose model finds hands; each hand crop is matched against your product photos (`detector/recognise.py`). The rules for pickup / put-back / taken / compare are plain code (`detector/interactions.py`, tested in `detector/test_interactions.py`). Events go into `output/events.db` first, so nothing is lost offline.
- **Dashboard** (`/dashboard`): the product funnel (on shelf → picked up → held → compared → put back → purchased), every product's numbers, compared pairs, never-touched products, hour by hour, CSV export, and a Gemini brief for products picked up a lot but rarely bought. Live from the store device, or from an uploaded `events.csv`.
- **Lift-and-learn screen** (`/screen`): optional. A browser beside the rack shows the product in the shopper's hand, side by side when two are held, and its playlist otherwise.

No camera? `python detector/pickups.py simulate` runs fake shoppers through the same logic, so the screen and live dashboard work for a demo. `samples/good/events.csv` is a simulated day that joins with `samples/good/pos.csv` (the dashboard's "Try the sample day" uses the copies in `public/samples/`). Regenerate it with:

```bash
python detector/pickups.py simulate --day 2026-10-21 --csv samples/good/events.csv
```

### Set up a camera

```bash
.venv\Scripts\activate
pip install -r detector/requirements.txt
python detector/pickups.py enroll NEW-201     # 20+ photos per product: SPACE = photo, A = auto, Q = done
python detector/pickups.py enroll _none       # empty hands, hands near the shelf, the bare shelf
python detector/pickups.py zones              # click each rack's shelf area, ENTER for the next rack
python detector/pickups.py run --show         # --presentation for showrooms: no zones, anything held up counts
python -m unittest discover detector          # the pickup rules' tests
```

Then open `/dashboard` → **Live from the store device**, and `/screen?zone=R2` on the screen beside rack R2. For a screen on another device, add `--host 0.0.0.0` and use the laptop's network address.

What counts as what (tune in `detector/interactions.py`):
- **pickup**: a product seen in a hand in 3 of 5 frames, after that hand was in a shelf zone, then carried out of the zone or held for 1 s.
- **put_back**: the product leaves the hand within 1 s of the hand being back in a shelf zone. **taken**: it leaves the hand anywhere else, or the shopper leaves the view with it.
- **compare**: the same shopper (tracker number) picks up two different products within 30 s.
- A product is flagged when it gets ≥ 10% of pickups and less than half that share of sales.

Store device endpoints on port 8765: `/stream` (live, for screens), `/events.csv`, `/health` (camera, fps, events waiting to send, screen reaction time), `POST /ack` (screens report each paint).

**Webhooks**: `ALMOST_WEBHOOK_SECRET=… python detector/pickups.py run --webhook https://your-endpoint` posts each event as JSON with an `X-Almost-Signature: sha256=<hex>` header (HMAC-SHA256 of the body). Check it on your side:

```python
expected = "sha256=" + hmac.new(SECRET, request_body, hashlib.sha256).hexdigest()
ok = hmac.compare_digest(expected, request.headers["X-Almost-Signature"])
```

Unsent events wait on the laptop and go out in order, with their real times, when the endpoint is back.

**Privacy**: frames are analysed in memory and discarded; nothing from the camera is saved or sent except the product photos you take with `enroll` (git-ignored). No face recognition; tracker numbers last seconds and belong to one camera. Shoppers should still be told camera analytics is in use.

**Limits, honestly**: recognition works best on a small set of products that look clearly different, photographed in the store's own light. Look-alike colours need more photos. Garment sizes can't be read. A ceiling CCTV camera is usually too far away to see what's in a hand.

## Set up for your store

- `data/rack-map.json`: which SKUs sit on which rack (the current one is a sample).
- `data/products.json`: each product's name, colour, rack and screen content. Used by the detector, dashboard and screens.
- `lib/parse.ts` → `POS_COLUMNS`: the SKU and quantity column names in your POS export.
- `lib/limits.ts`: file size limits and the flag rule (≥ 10% of stops and sales share under half the stop share).

## Deploy

Live at https://almost-wine.vercel.app. The Vercel project is linked to this GitHub repo, so every push to `main` deploys automatically.

`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are set under Vercel → Project → Settings → Environment Variables. After changing them, redeploy for them to take effect.
