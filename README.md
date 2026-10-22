# Almost

See which racks shoppers stop at but don't buy from, using the CCTV a store already has.

Upload a day's stop counts and POS sales → get racks ranked by "% of stops vs % of sales" → read an AI brief (Gemini) with likely reasons and a suggested fix.

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

## Set up for your store

- `data/rack-map.json`: which SKUs sit on which rack (the current one is a sample).
- `lib/parse.ts` → `POS_COLUMNS`: the SKU and quantity column names in your POS export.
- `lib/limits.ts`: file size limits and the flag rule (≥ 10% of stops and sales share under half the stop share).

## Deploy

Live at https://almost-gamma.vercel.app. The Vercel project is linked to this GitHub repo, so every push to `main` deploys automatically.

`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are set under Vercel → Project → Settings → Environment Variables. After changing them, redeploy for them to take effect.
