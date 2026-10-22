// Hero illustration: a CCTV frame as Almost sees it, with rack zones, tracked shoppers
// and a "stopped" tag on the hot rack. Drawn in SVG, so there's no photo to license.

const RACKS = [
  { id: "R3", x: 70, y: 120, w: 150, h: 70 },
  { id: "R2", x: 250, y: 215, w: 140, h: 60 },
  { id: "R5", x: 300, y: 105, w: 140, h: 60 },
];

// Tracked shoppers: x, y of the box's top-left, and whether they're stopped at the hot rack.
const SHOPPERS = [
  { id: 3, x: 120, y: 205, hot: false },
  { id: 7, x: 335, y: 168, hot: false },
  { id: 11, x: 498, y: 205, hot: true },
  { id: 12, x: 548, y: 222, hot: true },
  { id: 14, x: 238, y: 290, hot: false },
];

export default function CameraView() {
  return (
    <div className="card relative overflow-hidden p-0">
      <svg viewBox="0 0 640 400" className="block w-full" role="img" aria-label="CCTV frame: tracked shoppers crowd the window display rack, R4, which is tagged as stopped for 14 seconds">
        <defs>
          <linearGradient id="cam-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1d22" />
            <stop offset="100%" stopColor="#0b0d10" />
          </linearGradient>
          <radialGradient id="cam-heat" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffb020" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="640" height="400" fill="url(#cam-bg)" />

        {/* Floor lines in perspective */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={`v${i}`} x1={320} y1={40} x2={-120 + i * 147} y2={400} stroke="white" strokeOpacity="0.05" />
        ))}
        {[110, 170, 240, 320].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={640} y2={y} stroke="white" strokeOpacity="0.04" />
        ))}

        {/* Ordinary racks: faint zones with hanging garments */}
        {RACKS.map((r) => (
          <g key={r.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="6" fill="white" fillOpacity="0.03" stroke="white" strokeOpacity="0.25" strokeDasharray="4 5" />
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={r.x + 12 + i * ((r.w - 24) / 6)} y={r.y + 10} width={(r.w - 24) / 6 - 4} height={r.h - 22} rx="3" fill="#2a2f36" />
            ))}
            <text x={r.x + 6} y={r.y - 7} fill="#8b95a1" fontSize="11" fontWeight="700" letterSpacing="1.5">{r.id}</text>
          </g>
        ))}

        {/* The hot rack: window display, glowing amber zone */}
        <ellipse cx="545" cy="270" rx="130" ry="90" fill="url(#cam-heat)" />
        <rect x="470" y="140" width="150" height="190" rx="8" fill="#ffb020" fillOpacity="0.06" stroke="#ffb020" strokeWidth="2" strokeDasharray="6 5" />
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={482 + i * 27} y="152" width="22" height="70" rx="3" fill="#3a3026" />
        ))}
        <text x="476" y="132" fill="#ffb020" fontSize="11" fontWeight="800" letterSpacing="1.5">R4 · WINDOW</text>

        {/* Tracked shoppers */}
        {SHOPPERS.map((s) => {
          const color = s.hot ? "#ffb020" : "#e8ecf1";
          return (
            <g key={s.id}>
              <circle cx={s.x + 17} cy={s.y + 12} r="9" fill="#5b636e" />
              <rect x={s.x + 7} y={s.y + 22} width="20" height="48" rx="7" fill="#5b636e" />
              <rect x={s.x} y={s.y} width="34" height="76" rx="4" fill="none" stroke={color} strokeOpacity={s.hot ? 1 : 0.55} strokeWidth="1.5" />
              <rect x={s.x} y={s.y - 15} width="34" height="14" rx="3" fill={color} fillOpacity={s.hot ? 1 : 0.15} />
              <text x={s.x + 17} y={s.y - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill={s.hot ? "#1a1203" : "#e8ecf1"}>
                ID {String(s.id).padStart(2, "0")}
              </text>
            </g>
          );
        })}

        {/* "Stopped" tag on the hot rack */}
        <circle cx="515" cy="300" r="7" fill="#ffb020" />
        <circle cx="515" cy="300" r="7" fill="none" stroke="#ffb020" strokeWidth="2" className="pulse-ring" />
        <line x1="515" y1="300" x2="455" y2="352" stroke="#ffb020" strokeWidth="1.5" />
        <rect x="250" y="340" width="210" height="44" rx="10" fill="#0b0d10" stroke="#ffb020" strokeOpacity="0.6" />
        <text x="264" y="358" fill="#e8ecf1" fontSize="12" fontWeight="800" letterSpacing="0.5">R4 · WINDOW DISPLAY RACK</text>
        <text x="264" y="375" fill="#ffb020" fontSize="11" fontWeight="700" letterSpacing="1">● STOPPED 14 s · 2 SHOPPERS</text>

        {/* Camera overlay text */}
        <circle cx="22" cy="22" r="5" fill="#ff4d4d" className="rec-dot" />
        <text x="34" y="26" fill="#e8ecf1" fontSize="11" fontWeight="700" letterSpacing="1.5">REC · CAM 01 · 12:41:07</text>
        <text x="620" y="26" textAnchor="end" fill="#8b95a1" fontSize="11" fontWeight="700" letterSpacing="1.5">FLOOR 1</text>
      </svg>
    </div>
  );
}
