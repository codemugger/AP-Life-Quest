// Festive touches on the Camp stage for the seasonal looks (pure CSS pixel art, see seasons.css).
// Singapore flavour: Gardens by the Bay orchids, National Day bunting and fireworks, Mid-Autumn
// lanterns and mooncakes, Orchard Road lights, Lunar New Year lanterns, oranges and ang baos.
import type { ThemeId } from "../../shared/themes";
import "../seasons.css";

/** Evenly scattered things that drift down (or up) the stage, each on its own timing. */
function scatter(n: number, className: string, speed: [number, number]) {
  return Array.from({ length: n }, (_, i) => (
    <i
      key={i}
      className={className}
      style={{
        left: `${(i * 37 + 9) % 94}%`,
        animationDuration: `${speed[0] + ((i * 7) % (speed[1] - speed[0] + 1))}s`,
        animationDelay: `${-((i * 1.9) % 9)}s`,
      }}
    />
  ));
}

export function SeasonDeco({ look, night }: { look: ThemeId; night: boolean }) {
  if (look === "original") return null;
  return (
    <div className={`season-deco sd-${look}`} aria-hidden="true">
      {look === "spring" && (
        <>
          {scatter(9, "sd-fall sd-petal", [7, 12])}
          <i className="sd-orchid" style={{ left: "9%" }} />
          <i className="sd-orchid tall" style={{ left: "13%" }} />
          <i className="sd-orchid" style={{ right: "12%" }} />
        </>
      )}
      {look === "summer" && (
        <>
          <div className="sd-bunting">
            {Array.from({ length: 16 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          {night &&
            [
              { left: "22%", top: "28%", c: "#ff5a5f", d: "0s" },
              { left: "62%", top: "20%", c: "#ffffff", d: "-0.8s" },
              { left: "80%", top: "36%", c: "#ffd166", d: "-1.6s" },
            ].map((f) => <i key={f.left} className="sd-firework" style={{ left: f.left, top: f.top, color: f.c, animationDelay: f.d }} />)}
          <i className="sd-ball" />
        </>
      )}
      {look === "autumn" && (
        <>
          {scatter(4, "sd-lantern", [16, 22])}
          <i className="sd-mooncake" />
        </>
      )}
      {look === "winter" && (
        <>
          <div className="sd-lights">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${-((i * 0.37) % 1.6)}s` }} />
            ))}
          </div>
          {scatter(14, "sd-fall sd-snow", [8, 14])}
        </>
      )}
      {look === "cny" && (
        <>
          <i className="sd-hang" style={{ left: "66%" }} />
          <i className="sd-hang late" style={{ left: "86%" }} />
          {scatter(6, "sd-fall sd-angbao", [9, 14])}
          {scatter(4, "sd-fall sd-coin", [8, 12])}
          <i className="sd-orange" style={{ left: "9%" }} />
          <i className="sd-orange" style={{ left: "14%" }} />
        </>
      )}
    </div>
  );
}
