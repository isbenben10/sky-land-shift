import type { GameState } from "@/game/engine";
import { Apple, Sparkles, RotateCcw, Heart } from "lucide-react";

interface Props {
  state: GameState;
}

const formatTime = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const GameHUD = ({ state }: Props) => {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-6">
      <div className="hud-panel rounded-2xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-[hsl(var(--hud-fg))] text-shadow-arcade sm:text-4xl">
            {Math.floor(state.miles)}
          </span>
          <span className="font-mono-game text-xs uppercase tracking-widest text-[hsl(var(--hud-fg))]/60 sm:text-sm">
            mi
          </span>
        </div>
        <div className="mt-1 font-mono-game text-xs text-[hsl(var(--hud-fg))]/70 sm:text-sm">
          {formatTime(state.timeMs)} · best {Math.floor(state.bestMiles)} mi
        </div>
      </div>

      <div className="hud-panel flex flex-col items-center gap-2 rounded-2xl px-3 py-2 sm:px-4 sm:py-3">
        <Hearts state={state} />
        <ModeBadge state={state} />
      </div>

      <div className="hud-panel flex flex-col items-end gap-1 rounded-2xl px-3 py-2 sm:px-4 sm:py-3">
        {state.lowGravityMs > 0 && (
          <PowerChip
            icon={<Apple className="h-3.5 w-3.5" />}
            label="Low Gravity"
            color="hsl(355,80%,55%)"
            seconds={Math.ceil(state.lowGravityMs / 1000)}
          />
        )}
        {state.reversed && (
          <PowerChip
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            label="Reversed"
            color="hsl(295,65%,55%)"
          />
        )}
        {(state.mode === "sky" || state.mode === "space") && (
          <PowerChip
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={state.mode === "space" ? "Space" : "Dragon"}
            color="hsl(48,95%,55%)"
          />
        )}
        {state.mode === "cave" && (
          <PowerChip
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Cave"
            color="hsl(295,65%,55%)"
          />
        )}
        {state.lowGravityMs === 0 && !state.reversed && state.mode === "land" && (
          <span className="font-mono-game text-[10px] uppercase tracking-wider text-[hsl(var(--hud-fg))]/50">
            no power-ups
          </span>
        )}
      </div>
    </div>
  );
};

const ModeBadge = ({ state }: { state: GameState }) => {
  const isSky = state.mode === "sky";
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 animate-pulse-glow rounded-full"
        style={{
          backgroundColor: isSky ? "hsl(320,80%,70%)" : "hsl(140,55%,50%)",
          boxShadow: `0 0 12px ${isSky ? "hsl(320,80%,70%)" : "hsl(140,55%,50%)"}`,
        }}
      />
      <span className="font-display text-xs uppercase tracking-widest text-[hsl(var(--hud-fg))] sm:text-sm">
        {isSky ? "Sky Mode" : "Land Mode"}
      </span>
    </div>
  );
};

const PowerChip = ({
  icon,
  label,
  color,
  seconds,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  seconds?: number;
}) => (
  <div
    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono-game text-[10px] uppercase tracking-wider sm:text-xs"
    style={{
      backgroundColor: `${color.replace("hsl", "hsla").replace(")", ",0.18)")}`,
      color,
      boxShadow: `0 0 12px ${color.replace("hsl", "hsla").replace(")", ",0.4)")}`,
    }}
  >
    {icon}
    <span>{label}</span>
    {seconds !== undefined && <span className="opacity-70">{seconds}s</span>}
  </div>
);
