// The Camp backdrops, as pixel art (SVG, 260 × 86 units; phones see the middle 130, wider screens
// more). Skies and grass use the seasonal colour tokens, so every look tints them; the pet and the
// festive touches are drawn on top (Hud.tsx, SeasonDeco.tsx). Motion lives in scenes.css.
import { useId, type ReactElement } from "react";
import "../scenes.css";

type Px = [number, number, number, number, string];
const rects = (list: Px[], className?: string) => list.map(([x, y, w, h, fill], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={fill} className={className} />);
/** Blocks that take their colour (or window pattern) from the group around them. */
const blocks = (list: [number, number, number, number][]) => list.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} />);

/** Bands of sky from the look's colours (day) or its night colours. */
function Sky({ night, top, bottom }: { night: boolean; top?: string; bottom?: string }) {
  const t = top ?? (night ? "var(--night-top)" : "var(--sky-top)");
  const b = bottom ?? (night ? "var(--night-bottom)" : "var(--sky-bottom)");
  return (
    <>
      <rect width="260" height="86" fill={t} />
      <rect y="24" width="260" height="20" fill={b} opacity="0.35" />
      <rect y="38" width="260" height="14" fill={b} opacity="0.65" />
      <rect y="50" width="260" height="36" fill={b} />
    </>
  );
}

const STARS: [number, number][] = [
  [8, 6], [24, 18], [40, 8], [58, 26], [70, 12], [88, 4], [101, 20], [118, 9], [134, 24], [147, 6], [160, 16], [176, 28], [196, 8], [212, 20], [228, 6], [244, 16], [252, 30], [30, 32],
];
const Stars = ({ n = STARS.length }: { n?: number }) => (
  <g fill="#ffffff">
    {STARS.slice(0, n).map(([x, y], i) => (
      <rect key={i} x={x} y={y} width="1" height="1" className="sa-twinkle" style={{ animationDelay: `${-(i % 5) * 0.7}s` }} />
    ))}
  </g>
);

function SunMoon({ night, hideSun }: { night: boolean; hideSun?: boolean }) {
  if (night)
    return (
      <g>
        <rect x="176" y="6" width="10" height="10" fill="#f4f0d8" />
        <rect x="180" y="7" width="5" height="5" fill="#d8d2b0" />
      </g>
    );
  if (hideSun) return null;
  return (
    <g>
      <rect x="177" y="8" width="9" height="9" fill="var(--lemon)" />
      <rect x="176" y="9" width="11" height="7" fill="var(--lemon)" />
      <rect x="178" y="10" width="3" height="2" fill="#fff3b0" />
    </g>
  );
}

function Clouds({ night }: { night: boolean }) {
  const c = night ? "#6d5fa8" : "#ffffff";
  return (
    <g fill={c} opacity={night ? 0.45 : 0.95}>
      {[
        [0, 9, 70],
        [40, 15, 95],
        [120, 11, 80],
      ].map(([x, y, s], i) => (
        <g key={i} className="sa-drift" style={{ animationDuration: `${s}s`, animationDelay: `${-x}s` }}>
          <rect x="0" y={y} width="14" height="3" />
          <rect x="3" y={y - 2} width="7" height="2" />
        </g>
      ))}
    </g>
  );
}

/** A little pixel tree (round canopy). */
const Tree = ({ x, y, night, big }: { x: number; y: number; night: boolean; big?: boolean }) => {
  const g = night ? "#24503a" : "#4fae5a";
  const d = night ? "#1a3d2c" : "#3a8f48";
  const w = big ? 14 : 10;
  return (
    <g>
      {rects([
        [x + w / 2 - 1, y + 7, 2, 64 - y - 7, night ? "#3d2a22" : "#8a5a3c"],
        [x, y + 2, w, 6, g],
        [x + 2, y, w - 4, 2, g],
        [x + 2, y + 6, w - 4, 2, d],
      ])}
    </g>
  );
};

/** Grass, its edge and some tufts. */
function Ground({ night, fill, edge }: { night: boolean; fill?: string; edge?: string }) {
  return (
    <>
      <rect y="64" width="260" height="22" fill={fill ?? (night ? "var(--night-ground)" : "var(--ground)")} />
      <rect y="64" width="260" height="2" fill={edge ?? (night ? "var(--night-ground-d)" : "var(--ground-d)")} />
    </>
  );
}

const Orchid = ({ x, y }: { x: number; y: number }) => (
  <g>
    {rects([
      [x + 1, y + 2, 1, 4, "#3f9a52"],
      [x, y, 2, 2, "#c45bd6"],
      [x + 2, y - 1, 2, 2, "#f6a3d2"],
      [x - 2, y + 1, 2, 2, "#f6a3d2"],
    ])}
  </g>
);

// ---------------------------------------------------------------------------
// Meadow → the camp: Singapore skyline far behind, the pet's campsite up close
// ---------------------------------------------------------------------------
function Camp({ night, name, hideSun, pid }: { night: boolean; name: string; hideSun?: boolean; pid: string }) {
  const far = night ? "#2b2a55" : "#7f97c4";
  const farOp = night ? 1 : 0.42;
  return (
    <>
      <Sky night={night} />
      {night && <Stars />}
      <SunMoon night={night} hideSun={hideSun} />
      <Clouds night={night} />
      <defs>
        <pattern id={`${pid}win`} width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill={night ? "#2f2a58" : "#f3e6cf"} />
          <rect x="1" y="1" width="1" height="1" fill={night ? "#ffd166" : "#9fb3c8"} />
        </pattern>
        <pattern id={`${pid}tower`} width="2" height="3" patternUnits="userSpaceOnUse">
          <rect width="2" height="3" fill="#2b2a55" />
          <rect y="1" width="1" height="1" fill="#ffe7a0" />
        </pattern>
      </defs>
      {/* far: the city skyline, Marina Bay Sands, the Flyer, Supertrees */}
      <g fill={night ? `url(#${pid}tower)` : far} opacity={farOp}>
        {blocks([
          [14, 40, 7, 22],
          [23, 34, 6, 28],
          [31, 44, 8, 18],
          [212, 38, 6, 24],
          [220, 44, 9, 18],
          [231, 36, 6, 26],
          [86, 40, 4, 22],
          [93, 40, 4, 22],
          [100, 40, 4, 22],
        ])}
      </g>
      <rect x="83" y="37" width="24" height="3" fill={far} opacity={farOp} />
      {night && <rect x="83" y="37" width="24" height="1" fill="#7c5cff" />}
      <circle cx="118" cy="44" r="8.5" fill="none" stroke={night ? "#6ad0ff" : far} strokeOpacity={farOp} strokeWidth="1.2" shapeRendering="geometricPrecision" />
      <rect x="117.5" y="44" width="1" height="18" fill={far} opacity={farOp} />
      <g opacity={night ? 1 : farOp}>
        {rects([
          [139, 47, 2, 15, far],
          [149, 43, 2, 19, far],
          [158, 49, 2, 13, far],
        ])}
        {rects(
          [
            [135, 44, 10, 2, night ? "#c45bd6" : far],
            [145, 40, 10, 2, night ? "#4fd1a5" : far],
            [155, 46, 8, 2, night ? "#c45bd6" : far],
          ],
          night ? "sa-glow" : undefined,
        )}
      </g>
      {/* the bay */}
      <rect y="60" width="260" height="4" fill={night ? "#20306a" : "#5ab8ff"} />
      <g className="sa-wave">
        {rects(
          night
            ? [
                [87, 61, 2, 1, "#ffd166"],
                [101, 62, 2, 1, "#ffd166"],
                [146, 61, 2, 1, "#c45bd6"],
                [215, 62, 2, 1, "#ffd166"],
              ]
            : [
                [44, 61, 7, 1, "#d9f0ff"],
                [128, 62, 5, 1, "#d9f0ff"],
                [196, 61, 6, 1, "#d9f0ff"],
              ],
        )}
      </g>
      {/* HDB flats */}
      <rect x="44" y="40" width="16" height="24" fill={`url(#${pid}win)`} />
      <rect x="44" y="40" width="16" height="2" fill={night ? "#5a2f45" : "#e8846b"} />
      <rect x="196" y="44" width="15" height="20" fill={`url(#${pid}win)`} />
      <rect x="196" y="44" width="15" height="2" fill={night ? "#24494a" : "#5fb3a1"} />
      <Tree x={2} y={50} night={night} big />
      <Tree x={240} y={51} night={night} big />
      <Tree x={106} y={52} night={night} />
      <Ground night={night} />
      {/* the path to camp */}
      {rects([
        [121, 66, 18, 3, night ? "#4a5a52" : "#efe1c0"],
        [119, 70, 22, 3, night ? "#4a5a52" : "#efe1c0"],
        [117, 74, 26, 4, night ? "#4a5a52" : "#efe1c0"],
        [115, 79, 30, 7, night ? "#4a5a52" : "#efe1c0"],
      ])}
      {/* the tent (in the look's accent colour) */}
      <polygon points="69,66 85,37 101,66" fill="#2d2142" shapeRendering="geometricPrecision" />
      <polygon points="71,65 85,40 99,65" fill="var(--pink)" shapeRendering="geometricPrecision" />
      <polygon points="78,65 85,52 92,65" fill="#ffffff" opacity="0.45" shapeRendering="geometricPrecision" />
      <polygon points="82,65 85,57 88,65" fill={night ? "#ffd166" : "#5a2a3a"} shapeRendering="geometricPrecision" />
      {night && <polygon points="71,65 85,40 99,65" fill="#0b0818" opacity="0.35" shapeRendering="geometricPrecision" />}
      {night && <rect x="79" y="66" width="12" height="3" fill="#ffd166" opacity="0.25" />}
      <rect x="84" y="35" width="2" height="3" fill="#8a5a3c" />
      <rect x="86" y="35" width="4" height="2" fill="var(--violet)" />
      {/* lamp post */}
      {night && <rect x="96" y="56" width="18" height="12" fill="#ffe7a0" opacity="0.16" />}
      {rects([
        [104, 50, 1, 14, night ? "#151230" : "#3b3554"],
        [102, 48, 5, 2, night ? "#151230" : "#3b3554"],
        [103, 50, 3, 1, night ? "#ffe7a0" : "#fff3b0"],
      ])}
      {/* campfire and log seat */}
      {night && (
        <>
          <rect x="152" y="57" width="30" height="20" fill="#ff9f43" opacity="0.14" />
          <rect x="156" y="61" width="22" height="14" fill="#ff9f43" opacity="0.18" />
        </>
      )}
      {rects([
        [160, 72, 3, 2, night ? "#6a6e80" : "#9aa0b0"],
        [168, 72, 3, 2, night ? "#6a6e80" : "#9aa0b0"],
        [163, 74, 5, 2, night ? "#6a6e80" : "#9aa0b0"],
        [161, 70, 10, 2, night ? "#6d4630" : "#8a5a3c"],
        [164, 68, 4, 2, "#6d4630"],
      ])}
      {night ? (
        <g className="sa-fire">
          {rects([
            [163, 64, 6, 6, "#ff7a3a"],
            [164, 61, 4, 3, "#ff9f43"],
            [165, 58, 2, 3, "#ffd166"],
            [164, 66, 4, 3, "#ffd166"],
          ])}
        </g>
      ) : (
        <g fill="#e6e6ee">
          {[0, 1, 2].map((i) => (
            <rect key={i} x={165 + (i % 2)} y={64} width="2" height="2" className="sa-smoke" style={{ animationDelay: `${-i * 1.2}s` }} />
          ))}
        </g>
      )}
      {night && (
        <g fill="#ffd166">
          {[
            [161, 56],
            [169, 54],
            [166, 51],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="1" height="1" className="sa-spark" style={{ animationDelay: `${-i * 0.5}s` }} />
          ))}
        </g>
      )}
      {rects([
        [145, 74, 12, 4, night ? "#6d4630" : "#a8743f"],
        [145, 74, 12, 1, night ? "#8a5a3c" : "#c98e57"],
        [145, 74, 2, 4, night ? "#a8743f" : "#d9b48a"],
      ])}
      {/* signpost with the pet's name */}
      {rects([
        [175, 54, 2, 12, night ? "#4a3226" : "#8a5a3c"],
        [166, 47, 20, 8, "#2d2142"],
        [167, 48, 18, 6, night ? "#7a5638" : "#c98e57"],
      ])}
      <text x="176" y="52.6" textAnchor="middle" fontSize="3.2" fontFamily="'Press Start 2P', monospace" fill="#2d2142">
        {name.slice(0, 7).toUpperCase()}
      </text>
      {night && <rect x="183" y="43" width="3" height="4" fill="#ffd166" className="sa-glow" />}
      {/* a Singapore otter by the pond */}
      <rect x="178" y="73" width="16" height="7" fill={night ? "#20306a" : "#5ab8ff"} />
      <rect x="179" y="72" width="14" height="1" fill={night ? "#20306a" : "#5ab8ff"} />
      <rect x="180" y="75" width="4" height="1" fill={night ? "#3a4a8a" : "#d9f0ff"} />
      <g className="sa-bob">
        {rects([
          [185, 69, 6, 4, "#8a6a4f"],
          [185, 68, 1, 1, "#8a6a4f"],
          [190, 68, 1, 1, "#8a6a4f"],
          [186, 70, 1, 1, "#2d2142"],
          [189, 70, 1, 1, "#2d2142"],
          [187, 71, 2, 1, "#d9b48a"],
        ])}
      </g>
      <Orchid x={62} y={72} />
      <Orchid x={110} y={76} />
      <Orchid x={226} y={74} />
      {rects([
        [92, 72, 3, 2, "#e5484d"],
        [93, 74, 1, 2, "#fff8f0"],
        [92, 72, 1, 1, "#ffffff"],
        [174, 80, 2, 2, "#ffd84d"],
        [56, 80, 2, 2, "#ff8fc1"],
      ])}
      {night && (
        <g fill="#fff3a0">
          {[
            [60, 66],
            [96, 60],
            [138, 70],
            [180, 62],
            [222, 68],
            [30, 72],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="1" height="1" className="sa-twinkle" style={{ animationDelay: `${-i * 0.6}s` }} />
          ))}
        </g>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Beach → Sentosa: cable car, ships on the horizon, palms, a sandcastle and a crab
// ---------------------------------------------------------------------------
function Palm({ x, night, flip }: { x: number; night: boolean; flip?: boolean }) {
  const d = flip ? -1 : 1;
  const leaf = night ? "#1f6a52" : "#3fbf8a";
  const leafD = night ? "#17503e" : "#2aa87e";
  return (
    <g>
      {rects([
        [x, 40, 3, 6, night ? "#7a5530" : "#a8743f"],
        [x - d, 46, 3, 6, night ? "#7a5530" : "#a8743f"],
        [x - 2 * d, 52, 3, 6, night ? "#7a5530" : "#a8743f"],
        [x - 2 * d, 58, 3, 6, night ? "#7a5530" : "#a8743f"],
        [x - 9, 38, 10, 2, leaf],
        [x + 2, 38, 10, 2, leaf],
        [x - 11, 40, 4, 2, leafD],
        [x + 10, 40, 4, 2, leafD],
        [x - 3, 35, 9, 3, leaf],
        [x, 41, 2, 2, "#6d4630"],
      ])}
    </g>
  );
}

function Beach({ night, hideSun }: { night: boolean; hideSun?: boolean }) {
  return (
    <>
      <Sky night={night} />
      {night && <Stars />}
      <SunMoon night={night} hideSun={hideSun} />
      <Clouds night={night} />
      {/* Sentosa cable car */}
      <line x1="40" y1="12" x2="260" y2="27" stroke="#8a7a6a" strokeWidth="0.5" shapeRendering="geometricPrecision" />
      <g className="sa-cable">
        {rects([
          [119, 17, 1, 2, "#8a7a6a"],
          [117, 19, 5, 4, "#e5484d"],
          [118, 20, 3, 1, night ? "#ffd166" : "#d3ecff"],
        ])}
      </g>
      {/* islands and ships */}
      {rects([
        [30, 47, 70, 5, night ? "#24443a" : "#8fcf9f"],
        [44, 44, 40, 3, night ? "#24443a" : "#8fcf9f"],
        [150, 48, 90, 4, night ? "#1f3d34" : "#7fc394"],
        [172, 45, 44, 3, night ? "#1f3d34" : "#7fc394"],
        [182, 49, 10, 2, "#6a6e80"],
        [185, 47, 4, 2, night ? "#ffd166" : "#f4f0e8"],
        [92, 50, 7, 1, "#6a6e80"],
        [94, 49, 2, 1, night ? "#ffd166" : "#f4f0e8"],
      ])}
      {/* sea */}
      <rect y="51" width="260" height="15" fill={night ? "#20306a" : "#5ab8ff"} />
      <rect y="58" width="260" height="8" fill={night ? "#1a2858" : "#4aa8ef"} />
      <g className="sa-wave">
        {rects(
          (
            [
              [70, 53, 6, 1],
              [110, 56, 8, 1],
              [150, 54, 5, 1],
              [200, 57, 7, 1],
              [30, 55, 6, 1],
              [235, 53, 5, 1],
              [128, 60, 6, 1],
            ] as [number, number, number, number][]
          ).map(([x, y, w, h]) => [x, y, w, h, night ? "#8fb7ff" : "#d9f0ff"] as Px),
        )}
      </g>
      {night && rects([[180, 53, 2, 1, "#f4f0d8"], [179, 56, 3, 1, "#f4f0d8"], [180, 59, 2, 1, "#f4f0d8"]])}
      <Ground night={night} fill={night ? "#8a7a5a" : "#f6d58e"} edge={night ? "#6d5f45" : "#e9bf6b"} />
      <Palm x={74} night={night} />
      <Palm x={196} night={night} flip />
      {/* umbrella and towel */}
      {rects([
        [160, 50, 1, 16, "#8a7a6a"],
        [152, 47, 17, 3, night ? "#a03a40" : "#e5484d"],
        [155, 47, 3, 3, "#ffffff"],
        [161, 47, 3, 3, "#ffffff"],
        [155, 45, 11, 2, night ? "#a03a40" : "#e5484d"],
        [150, 72, 14, 4, night ? "#2f5f8f" : "#5ab8ff"],
        [150, 73, 14, 1, "#ffffff"],
      ])}
      {/* sandcastle */}
      {rects([
        [96, 68, 12, 6, night ? "#a8915f" : "#e9bf6b"],
        [96, 64, 3, 4, night ? "#a8915f" : "#e9bf6b"],
        [105, 64, 3, 4, night ? "#a8915f" : "#e9bf6b"],
        [101, 60, 1, 8, "#8a7a6a"],
        [102, 60, 3, 2, "#e5484d"],
        [101, 70, 2, 4, night ? "#6d5f45" : "#c9a050"],
      ])}
      <g className="sa-crab">
        {rects([
          [140, 78, 5, 3, "#ff6b6b"],
          [138, 77, 2, 2, "#ff6b6b"],
          [145, 77, 2, 2, "#ff6b6b"],
          [141, 77, 1, 1, "#2d2142"],
          [143, 77, 1, 1, "#2d2142"],
        ])}
      </g>
      {rects([
        [120, 80, 2, 2, "#ffb08a"],
        [182, 77, 3, 1, "#ffd84d"],
        [183, 76, 1, 3, "#ffd84d"],
        [62, 79, 2, 1, "#fff8f0"],
      ])}
    </>
  );
}

// ---------------------------------------------------------------------------
// City Lights → Marina Bay at night: skyline, Marina Bay Sands' light show, the Esplanade, the Merlion
// ---------------------------------------------------------------------------
function City({ pid }: { pid: string }) {
  return (
    <>
      <rect width="260" height="86" fill="#2a2160" />
      <rect y="28" width="260" height="18" fill="#4a3a7a" />
      <rect y="44" width="260" height="10" fill="#7a4a8a" />
      <rect y="52" width="260" height="8" fill="#f08fa0" />
      <Stars n={12} />
      <SunMoon night />
      <defs>
        <pattern id={`${pid}city`} width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#2b2a55" />
          <rect x="1" y="1" width="1" height="1" fill="#ffe7a0" />
        </pattern>
      </defs>
      <g className="sa-laser" stroke="#a78bff" strokeWidth="0.6" opacity="0.5" shapeRendering="geometricPrecision">
        <line x1="152" y1="35" x2="112" y2="0" />
        <line x1="152" y1="35" x2="196" y2="0" />
      </g>
      <g fill={`url(#${pid}city)`}>
        {blocks([
          [62, 30, 8, 32],
          [71, 22, 7, 40],
          [79, 34, 9, 28],
          [89, 26, 6, 36],
          [96, 36, 8, 26],
          [20, 34, 9, 28],
          [32, 28, 7, 34],
          [212, 32, 8, 30],
          [222, 40, 10, 22],
          [234, 26, 7, 36],
          [143, 38, 4, 24],
          [150, 38, 4, 24],
          [157, 38, 4, 24],
        ])}
      </g>
      {rects([
        [74, 18, 1, 4, "#2b2a55"],
        [140, 35, 24, 3, "#2b2a55"],
        [140, 35, 24, 1, "#7c5cff"],
      ])}
      {/* Esplanade durians */}
      {rects([
        [112, 55, 10, 7, "#7a6a5a"],
        [113, 53, 8, 2, "#7a6a5a"],
        [124, 53, 12, 9, "#8a7a6a"],
        [126, 51, 8, 2, "#8a7a6a"],
        [114, 56, 1, 1, "#ffd166"],
        [118, 57, 1, 1, "#ffd166"],
        [127, 55, 1, 1, "#ffd166"],
        [131, 56, 1, 1, "#ffd166"],
      ])}
      <circle cx="203" cy="46" r="8" fill="none" stroke="#6ad0ff" strokeWidth="1.1" shapeRendering="geometricPrecision" />
      {/* Merlion on its pier */}
      {rects([
        [176, 62, 12, 2, "#6a6080"],
        [180, 54, 4, 8, "#f4f0e8"],
        [181, 50, 5, 4, "#f4f0e8"],
        [180, 51, 1, 3, "#d8d2c4"],
        [184, 51, 1, 1, "#2d2142"],
        [184, 60, 3, 2, "#f4f0e8"],
      ])}
      <g className="sa-spout" fill="#9fd8ff">
        {rects([
          [186, 52, 2, 1, "#9fd8ff"],
          [188, 52, 2, 1, "#9fd8ff"],
          [190, 53, 2, 1, "#9fd8ff"],
          [192, 55, 1, 2, "#9fd8ff"],
          [193, 57, 1, 3, "#9fd8ff"],
        ])}
      </g>
      {/* the bay and the promenade */}
      <rect y="58" width="260" height="6" fill="#20306a" />
      <g className="sa-wave">
        {rects([
          [66, 60, 2, 1, "#ffd166"],
          [90, 61, 2, 1, "#ffd166"],
          [145, 60, 2, 1, "#ffe7a0"],
          [152, 61, 2, 1, "#ffe7a0"],
          [159, 60, 2, 1, "#ffe7a0"],
          [203, 61, 3, 1, "#6ad0ff"],
          [114, 61, 2, 1, "#ffd166"],
        ])}
      </g>
      <Ground night fill="#3b3554" edge="#8a7a9a" />
      <g fill="#2a2540">
        {[70, 90, 110, 130, 150, 170, 190].map((x) => (
          <rect key={x} x={x} y="66" width="1" height="20" />
        ))}
      </g>
      {[84, 176].map((x) => (
        <g key={x}>
          <rect x={x - 8} y="58" width="18" height="12" fill="#ffe7a0" opacity="0.14" />
          {rects([
            [x, 50, 1, 14, "#151230"],
            [x - 2, 48, 5, 2, "#151230"],
            [x - 1, 50, 3, 1, "#ffe7a0"],
          ])}
        </g>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sakura Park → Gardens by the Bay: the Flower Dome, Supertrees and the skyway, cherry blossoms
// ---------------------------------------------------------------------------
function Gardens({ night, hideSun }: { night: boolean; hideSun?: boolean }) {
  const trunk = night ? "#3a3448" : "#6d6a7a";
  return (
    <>
      <Sky night={night} top={night ? undefined : "#ffd6ea"} bottom={night ? undefined : "#fff4f9"} />
      {night && <Stars />}
      <SunMoon night={night} hideSun={hideSun} />
      <Clouds night={night} />
      {/* Flower Dome */}
      {rects([
        [62, 48, 34, 2, night ? "#7fb8e0" : "#d9f0ff"],
        [59, 50, 40, 2, night ? "#7fb8e0" : "#d9f0ff"],
        [57, 52, 44, 12, night ? "#7fb8e0" : "#d9f0ff"],
      ])}
      <g fill={night ? "#ffe7a0" : "#a9cbe8"} opacity={night ? 0.5 : 1}>
        {[60, 66, 72, 78, 84, 90, 96].map((x) => (
          <rect key={x} x={x} y="50" width="1" height="14" />
        ))}
      </g>
      {/* Supertrees and the skyway */}
      <rect x="145" y="44" width="30" height="1" fill={trunk} />
      {[148, 162, 176].map((x, i) => (
        <g key={x}>
          {rects([
            [x, 40 + (i % 2) * 2, 3, 24 - (i % 2) * 2, trunk],
            [x - 6, 36 + (i % 2) * 2, 15, 3, night ? (i % 2 ? "#4fd1a5" : "#c45bd6") : "#8a7aa0"],
            [x - 4, 39 + (i % 2) * 2, 11, 2, night ? (i % 2 ? "#c45bd6" : "#4fd1a5") : "#9a8ab0"],
            [x - 2, 41 + (i % 2) * 2, 7, 1, night ? "#ffd166" : "#7a6a90"],
          ], night ? "sa-glow" : undefined)}
        </g>
      ))}
      <Ground night={night} fill={night ? undefined : "#9be39b"} edge={night ? undefined : "#6fcf7a"} />
      {/* cherry blossoms */}
      {[
        [64, 40],
        [192, 42],
      ].map(([x, y]) => (
        <g key={x}>
          {rects([
            [x + 10, y + 10, 3, 64 - y - 10, night ? "#4a3226" : "#8a5a3c"],
            [x, y + 2, 24, 8, night ? "#a06a8a" : "#ffb3d1"],
            [x + 3, y, 18, 2, night ? "#a06a8a" : "#ffb3d1"],
            [x + 3, y + 10, 18, 2, night ? "#7a4a6a" : "#f07aa9"],
            [x + 4, y + 2, 5, 2, night ? "#c08aa8" : "#ffe0ee"],
            [x + 15, y + 6, 2, 2, night ? "#7a4a6a" : "#f07aa9"],
          ])}
        </g>
      ))}
      {/* flower beds */}
      {(
        [
          [64, 72],
          [76, 76],
          [90, 70],
          [168, 74],
          [182, 70],
          [196, 77],
          [210, 72],
        ] as [number, number][]
      ).map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="2" height="2" fill={["#ff8fc1", "#ffd84d", "#c45bd6", "#ff6b6b"][i % 4]} />
      ))}
      <g fill={night ? "#d79ac0" : "#ff9cc6"}>
        {[70, 92, 118, 150, 176, 206, 230].map((x, i) => (
          <rect key={x} x={x} y="-4" width="2" height="2" className="sa-petal" style={{ animationDelay: `${-i * 1.7}s`, animationDuration: `${8 + (i % 3) * 2}s` }} />
        ))}
      </g>
    </>
  );
}

// ---------------------------------------------------------------------------
// Moon Base: Earth in the sky (with a tiny Singapore light), a dome habitat, a rocket and a rover
// ---------------------------------------------------------------------------
function Moon() {
  return (
    <>
      <rect width="260" height="86" fill="#0f0c22" />
      <rect width="260" height="40" fill="#1a1640" />
      <Stars />
      <g className="sa-shoot">
        <rect x="40" y="10" width="6" height="1" fill="#ffffff" opacity="0.8" />
      </g>
      <circle cx="190" cy="18" r="9" fill="#3f8fe0" shapeRendering="geometricPrecision" />
      {rects([
        [184, 13, 5, 3, "#4fbf63"],
        [190, 19, 6, 4, "#4fbf63"],
        [186, 21, 3, 2, "#ffffff"],
        [192, 12, 4, 1, "#ffffff"],
      ])}
      <rect x="193" y="23" width="1" height="1" fill="#ff4d5e" className="sa-twinkle" />
      {rects([
        [30, 56, 50, 6, "#b5b1c8"],
        [42, 53, 26, 3, "#b5b1c8"],
        [184, 57, 60, 5, "#a9a5bf"],
      ])}
      <Ground night fill="#c9c6d8" edge="#a9a5bf" />
      {rects([
        [84, 72, 12, 3, "#a9a5bf"],
        [85, 72, 10, 1, "#8f8ba6"],
        [150, 79, 14, 4, "#a9a5bf"],
        [151, 79, 12, 1, "#8f8ba6"],
        [208, 70, 9, 2, "#a9a5bf"],
        [40, 77, 8, 2, "#a9a5bf"],
      ])}
      {/* habitat dome */}
      {rects([
        [70, 48, 22, 2, "#e8e6f2"],
        [68, 50, 26, 2, "#e8e6f2"],
        [66, 52, 30, 12, "#e8e6f2"],
        [66, 62, 30, 2, "#b5b1c8"],
        [70, 54, 3, 3, "#ffd166"],
        [76, 54, 3, 3, "#ffd166"],
        [82, 54, 3, 3, "#6ad0ff"],
        [88, 56, 4, 6, "#4a4560"],
        [96, 58, 8, 3, "#d8d5e5"],
        [104, 44, 1, 20, "#8f8ba6"],
        [101, 41, 7, 3, "#e8e6f2"],
      ])}
      <rect x="104" y="40" width="1" height="1" fill="#ff4d5e" className="sa-twinkle" />
      {/* rocket */}
      {rects([
        [174, 62, 16, 2, "#6a6e80"],
        [179, 40, 6, 22, "#f4f0e8"],
        [180, 36, 4, 4, "#e5484d"],
        [181, 34, 2, 2, "#e5484d"],
        [179, 48, 6, 2, "#e5484d"],
        [181, 43, 2, 2, "#6ad0ff"],
        [177, 56, 2, 6, "#e5484d"],
        [185, 56, 2, 6, "#e5484d"],
      ])}
      <g className="sa-rover">
        {rects([
          [138, 70, 10, 4, "#f4f0e8"],
          [139, 74, 2, 2, "#3b3554"],
          [145, 74, 2, 2, "#3b3554"],
          [146, 66, 1, 4, "#8f8ba6"],
          [146, 66, 1, 1, "#ff4d5e"],
          [139, 71, 3, 1, "#6ad0ff"],
        ])}
      </g>
    </>
  );
}

const SCENES: Record<string, (p: { night: boolean; name: string; hideSun: boolean; pid: string }) => ReactElement> = {
  meadow: ({ night, name, hideSun, pid }) => <Camp night={night} name={name} hideSun={hideSun} pid={pid} />,
  beach: ({ night, hideSun }) => <Beach night={night} hideSun={hideSun} />,
  city: ({ pid }) => <City pid={pid} />,
  sakura: ({ night, hideSun }) => <Gardens night={night} hideSun={hideSun} />,
  space: () => <Moon />,
};

/** A Camp backdrop. `name` goes on the campsite's signpost; `hideSun` for looks with their own lights. */
export function SceneArt({ scene, night, name = "", hideSun = false }: { scene: string; night: boolean; name?: string; hideSun?: boolean }) {
  const draw = SCENES[scene] ?? SCENES.meadow;
  // each drawing gets its own pattern ids (several scenes can be on screen at once)
  const pid = `sa${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className="scene-art" viewBox="0 0 260 86" preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges" aria-hidden="true">
      {draw({ night, name, hideSun, pid })}
    </svg>
  );
}
