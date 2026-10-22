"use client";

// Lift and learn: a screen beside a rack that shows the product a shopper is holding.
// It listens to the store device's live stream; when nothing is held it plays the rack's
// products as a playlist. No touchscreen, app or QR code: the camera sees the product.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, productBySku, products, rackName, racks, type Product } from "@/lib/products";
import Garment from "./Garment";
import SubHeader from "./SubHeader";

const DEFAULT_DEVICE = "http://localhost:8765";
const BACK_TO_PLAYLIST_MS = 3000; // after a product goes back, keep it on screen this long
const PLAYLIST_MS = 6000; // each idle slide

export default function Screen() {
  const params = useSearchParams();
  const zone = params.get("zone");
  const device = (params.get("device") || DEFAULT_DEVICE).replace(/\/+$/, "");
  return zone ? <Player zone={zone} device={device} /> : <Setup />;
}

function Setup() {
  const [device, setDevice] = useState(DEFAULT_DEVICE);
  const link = (zone: string) => `/screen?zone=${encodeURIComponent(zone)}${device === DEFAULT_DEVICE ? "" : `&device=${encodeURIComponent(device)}`}`;
  return (
    <main className="flex-1">
      <SubHeader active="/screen" />
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="eyebrow">Smart screens</p>
        <h1 className="display mt-4 text-4xl sm:text-6xl">
          Pick it up.
          <br />
          <span className="text-amber">It&apos;s on the screen.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Open one of these on any screen beside a rack: a TV with a browser, a tablet or a laptop. When a shopper picks a
          product up, the screen switches to it; when they put it back, the playlist returns. Screens are optional: the
          pickups are counted either way.
        </p>
        <label className="mt-10 block max-w-xl">
          <span className="text-sm font-semibold">Store device</span>
          <input
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            className="mt-2 w-full rounded-full border border-line bg-panel px-4 py-2.5 font-mono text-sm outline-none focus:border-amber/60"
          />
          <span className="mt-2 block text-sm text-muted">
            For a screen on another device, start the detector with <code className="font-mono text-fg">--host 0.0.0.0</code> and
            use this computer&apos;s network address.
          </span>
        </label>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((r) => (
            <Link key={r.id} href={link(r.id)} className="card flex items-center justify-between gap-4 p-5 transition hover:border-amber/50">
              <span>
                <span className="font-mono text-sm text-amber">{r.id}</span>
                <span className="display mt-1 block text-xl">{r.name}</span>
              </span>
              <span aria-hidden className="text-muted">→</span>
            </Link>
          ))}
          <Link href={link("all")} className="card flex items-center justify-between gap-4 border-dashed p-5 transition hover:border-amber/50">
            <span>
              <span className="font-mono text-sm text-amber">ALL</span>
              <span className="display mt-1 block text-xl">Every zone</span>
              <span className="text-sm text-muted">For presentation mode, showrooms and demos</span>
            </span>
            <span aria-hidden className="text-muted">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

function Player({ zone, device }: { zone: string; device: string }) {
  const [shown, setShown] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [slide, setSlide] = useState(0);
  const pendingFire = useRef<string | null>(null);

  const playlist = useMemo(() => (zone === "all" ? products : products.filter((p) => p.rack === zone)), [zone]);

  // Live stream from the store device. EventSource reconnects by itself after a drop.
  // A held product shows at once; the playlist returns a few seconds after it's put back.
  useEffect(() => {
    let held = "";
    let backToPlaylist: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource(`${device}/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { type: string; zones: Record<string, string[]>; fire?: string };
      if (msg.type !== "held") return;
      // "all": show one zone's products, so two shoppers at different racks don't look like a comparison.
      const skus =
        zone === "all"
          ? (Object.values(msg.zones).sort((a, b) => b.length - a.length)[0] ?? [])
          : (msg.zones[zone] ?? []);
      const known = skus.filter((s) => productBySku.has(s.toUpperCase())).slice(0, 2);
      if (known.join() === held) return;
      held = known.join();
      clearTimeout(backToPlaylist);
      if (known.length) {
        pendingFire.current = msg.fire ?? null;
        setShown(known);
      } else {
        backToPlaylist = setTimeout(() => setShown([]), BACK_TO_PLAYLIST_MS);
      }
    };
    return () => {
      clearTimeout(backToPlaylist);
      source.close();
    };
  }, [device, zone]);

  // Tell the device the product is painted, so it can measure decision-to-screen time.
  useEffect(() => {
    const fire = pendingFire.current;
    if (!shown.length || !fire) return;
    pendingFire.current = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        fetch(`${device}/ack`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fire }) }).catch(() => {});
      }),
    );
  }, [shown, device]);

  useEffect(() => {
    if (shown.length || playlist.length < 2) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % playlist.length), PLAYLIST_MS);
    return () => clearInterval(id);
  }, [shown, playlist.length]);

  const shownProducts = shown.map((s) => productBySku.get(s.toUpperCase())!).filter(Boolean);

  return (
    <main
      className="relative flex min-h-screen flex-1 cursor-none flex-col overflow-hidden bg-bg"
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
    >
      {shownProducts.length === 2 ? (
        <Pair key={shown.join()} a={shownProducts[0]} b={shownProducts[1]} />
      ) : shownProducts.length === 1 ? (
        <Hero key={shown[0]} product={shownProducts[0]} label="In your hand" />
      ) : playlist.length ? (
        <Hero key={`idle-${slide}`} product={playlist[slide % playlist.length]} label={zone === "all" ? "Pick one up to see more" : `${rackName(zone)} · pick one up to see more`} idle />
      ) : (
        <p className="m-auto text-muted">No products on rack {zone} in data/products.json.</p>
      )}
      <div className="absolute right-5 bottom-4 flex items-center gap-2 text-xs text-muted/70" title={connected ? `Connected to ${device}` : `Can't reach ${device}; playing the playlist`}>
        <span className={`size-2 rounded-full ${connected ? "bg-mint" : "bg-red-400"}`} />
        {connected ? "Live" : "Offline · playlist"}
      </div>
    </main>
  );
}

function Hero({ product, label, idle }: { product: Product; label: string; idle?: boolean }) {
  return (
    <div className="screen-in grid flex-1 items-center gap-10 px-[6vw] py-[6vh] md:grid-cols-[1fr_1.1fr]">
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-[12%] rounded-full blur-3xl" style={{ background: product.hex, opacity: 0.28 }} />
        <Garment kind={product.kind} hex={product.hex} className="relative h-[52vh] max-h-[640px] w-full" />
      </div>
      <div>
        <p className={`text-[clamp(0.8rem,1.4vw,1.1rem)] font-bold tracking-[0.22em] uppercase ${idle ? "text-muted" : "text-amber"}`}>{label}</p>
        <h1 className="display mt-4 text-[clamp(2.6rem,7vw,6.5rem)]">{product.name}</h1>
        <p className="mt-5 flex items-center gap-3 text-[clamp(1.1rem,2vw,1.6rem)] text-muted">
          <span className="size-5 rounded-full border border-white/25" style={{ background: product.hex }} /> {product.colour}
          <span className="text-fg">· {formatPrice(product.price)}</span>
        </p>
        <p className="mt-6 max-w-xl text-[clamp(1.1rem,2.2vw,1.9rem)] leading-snug">{product.tagline}</p>
        <ul className="mt-8 space-y-3 text-[clamp(1rem,1.6vw,1.3rem)] text-muted">
          {product.details.map((d) => (
            <li key={d} className="flex items-center gap-3">
              <span className="size-2 shrink-0 rounded-full bg-amber" /> {d}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Pair({ a, b }: { a: Product; b: Product }) {
  return (
    <div className="screen-in flex flex-1 flex-col px-[5vw] py-[5vh]">
      <p className="text-[clamp(0.8rem,1.4vw,1.1rem)] font-bold tracking-[0.22em] text-amber uppercase">Comparing two?</p>
      <div className="mt-6 grid flex-1 gap-6 md:grid-cols-2">
        {[a, b].map((p) => (
          <div key={p.sku} className="card flex flex-col items-center p-[3vw] text-center">
            <Garment kind={p.kind} hex={p.hex} className="h-[34vh] w-full" />
            <h2 className="display mt-6 text-[clamp(1.8rem,4vw,3.6rem)]">{p.name}</h2>
            <p className="mt-3 text-[clamp(1rem,1.8vw,1.4rem)] text-muted">
              {p.colour} · <span className="text-fg">{formatPrice(p.price)}</span>
            </p>
            <p className="mt-4 max-w-md text-[clamp(1rem,1.7vw,1.35rem)]">{p.tagline}</p>
            <p className="mt-3 text-[clamp(0.9rem,1.4vw,1.1rem)] text-muted">{p.details.join(" · ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
