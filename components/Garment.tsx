// A simple drawing of a product in its colour, for screens and tables, so the demo needs no
// product photography. Swap in real product images when you have them.

const SHAPES: Record<string, string> = {
  tee: "M62 42 L86 30 Q100 46 114 30 L138 42 L168 72 L148 92 L138 82 L138 172 L62 172 L62 82 L52 92 L32 72 Z",
  shirt: "M64 40 L88 28 L100 44 L112 28 L136 40 L172 112 L154 120 L138 88 L138 176 L62 176 L62 88 L46 120 L28 112 Z",
  jacket: "M62 40 L88 28 L100 40 L112 28 L138 40 L170 120 L152 128 L140 96 L140 150 L60 150 L60 96 L48 128 L30 120 Z",
  kurta: "M72 32 L90 26 Q100 40 110 26 L128 32 L160 66 L144 80 L134 68 L142 186 L58 186 L66 68 L56 80 L40 66 Z",
  dress: "M80 30 L92 26 Q100 38 108 26 L120 30 L142 62 L128 70 L124 64 L126 78 L166 186 L34 186 L74 78 L76 64 L72 70 L58 62 Z",
  jeans: "M62 24 L138 24 L150 186 L110 186 L100 86 L90 186 L50 186 Z",
  bag: "M48 78 L152 78 L160 176 L40 176 Z",
  belt: "M20 88 L180 88 L180 112 L20 112 Z",
  scarf: "M100 22 L178 100 L100 178 L22 100 Z",
};

// Small details drawn on top: seams, buttons, handles, a buckle.
function Details({ kind }: { kind: string }) {
  const line = { stroke: "rgb(0 0 0 / 0.28)", strokeWidth: 2, fill: "none" };
  switch (kind) {
    case "shirt":
      return <><path d="M100 44 L100 176" {...line} />{[64, 92, 120, 148].map((y) => <circle key={y} cx="106" cy={y} r="2.5" fill="rgb(0 0 0 / 0.3)" />)}</>;
    case "jacket":
      return <><path d="M100 40 L100 150" {...line} /><rect x="68" y="104" width="22" height="18" rx="2" {...line} /><rect x="110" y="104" width="22" height="18" rx="2" {...line} /></>;
    case "kurta":
      return <path d="M100 38 L100 70" {...line} />;
    case "dress":
      return <><path d="M76 78 Q100 86 124 78" {...line} /><path d="M70 120 Q100 128 130 120 M60 150 Q100 160 140 150" stroke="rgb(255 215 120 / 0.55)" strokeWidth={3} fill="none" /></>;
    case "jeans":
      return <><path d="M62 38 L138 38" {...line} /><path d="M100 38 L100 86" {...line} /><path d="M72 50 Q80 64 92 52" {...line} /></>;
    case "bag":
      return <path d="M72 78 Q72 36 100 36 Q128 36 128 78" stroke="rgb(0 0 0 / 0.35)" strokeWidth={7} fill="none" />;
    case "belt":
      return <rect x="138" y="82" width="26" height="36" rx="3" stroke="#c9a14a" strokeWidth={5} fill="none" />;
    case "scarf":
      return <><path d="M100 50 L150 100 L100 150 L50 100 Z" {...line} /><circle cx="100" cy="100" r="14" {...line} /></>;
    default:
      return <path d="M86 30 Q100 46 114 30" {...line} />;
  }
}

export default function Garment({ kind, hex, className }: { kind: string; hex: string; className?: string }) {
  const id = `shade-${kind}-${hex.slice(1)}`;
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <path d={SHAPES[kind] ?? SHAPES.tee} fill={hex} />
      <path d={SHAPES[kind] ?? SHAPES.tee} fill={`url(#${id})`} />
      <Details kind={kind} />
    </svg>
  );
}
