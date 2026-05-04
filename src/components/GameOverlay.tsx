import { Button } from "@/components/ui/button";
import type { GameState } from "@/game/engine";
import { Apple, Citrus, Leaf, Play, RotateCw, Sparkles } from "lucide-react";

interface Props {
  state: GameState;
  started: boolean;
  onStart: () => void;
}

export const GameOverlay = ({ state, started, onStart }: Props) => {
  if (state.running && !state.gameOver) return null;

  const isStart = !started;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[hsl(var(--hud-bg))]/55 backdrop-blur-sm animate-fade-in">
      <div className="hud-panel mx-4 w-full max-w-xl rounded-3xl p-6 text-center sm:p-10 animate-scale-in">
        {isStart ? (
          <>
            <h1 className="font-display text-4xl text-[hsl(var(--hud-fg))] text-shadow-arcade sm:text-6xl">
              Rex Rush
            </h1>
            <p className="mt-2 font-mono-game text-xs uppercase tracking-[0.3em] text-[hsl(var(--hud-fg))]/60 sm:text-sm">
              Endless runner · power-up chaos
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              <FruitGuide icon={<Apple className="h-4 w-4" />} color="hsl(355,80%,55%)" name="Apple" desc="Low gravity" />
              <FruitGuide icon={<Citrus className="h-4 w-4" />} color="hsl(48,95%,55%)" name="Pineapple" desc="Sky dragon" />
              <FruitGuide icon={<Leaf className="h-4 w-4" />} color="hsl(75,55%,45%)" name="Durian" desc="Back to land" />
              <FruitGuide icon={<Sparkles className="h-4 w-4" />} color="hsl(295,65%,55%)" name="Mushroom" desc="Reverse!" />
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <Button
                size="lg"
                onClick={onStart}
                className="h-14 rounded-full bg-[image:var(--gradient-primary)] px-10 font-display text-lg uppercase tracking-widest text-primary-foreground shadow-[var(--shadow-arcade)] hover:opacity-95"
              >
                <Play className="mr-2 h-5 w-5 fill-current" />
                Start Run
              </Button>
              <p className="font-mono-game text-xs text-[hsl(var(--hud-fg))]/60">
                Press <Kbd>SPACE</Kbd> to jump · in sky, switch lanes
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="font-mono-game text-xs uppercase tracking-[0.3em] text-[hsl(var(--hud-fg))]/60">
              Game Over
            </p>
            <h2 className="mt-2 font-display text-3xl text-[hsl(var(--hud-fg))] text-shadow-arcade sm:text-5xl">
              You survived {Math.floor(state.miles)} miles!
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <Stat label="Miles" value={Math.floor(state.miles).toString()} />
              <Stat label="Time" value={formatTime(state.timeMs)} />
              <Stat label="Best" value={`${Math.floor(state.bestMiles)} mi`} />
              <Stat label="Top Speed" value="—" hide />
            </div>
            <Button
              size="lg"
              onClick={onStart}
              className="mt-8 h-14 rounded-full bg-[image:var(--gradient-primary)] px-10 font-display text-lg uppercase tracking-widest text-primary-foreground shadow-[var(--shadow-arcade)] hover:opacity-95"
            >
              <RotateCw className="mr-2 h-5 w-5" />
              Run Again
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const FruitGuide = ({ icon, color, name, desc }: { icon: React.ReactNode; color: string; name: string; desc: string }) => (
  <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--hud-fg))]/5 p-3">
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `${color.replace("hsl", "hsla").replace(")", ",0.2)")}`, color }}
    >
      {icon}
    </div>
    <div>
      <div className="font-display text-xs uppercase tracking-wider text-[hsl(var(--hud-fg))]">{name}</div>
      <div className="font-mono-game text-[10px] text-[hsl(var(--hud-fg))]/60">{desc}</div>
    </div>
  </div>
);

const Stat = ({ label, value, hide }: { label: string; value: string; hide?: boolean }) => (
  <div className={`rounded-xl bg-[hsl(var(--hud-fg))]/5 p-4 ${hide ? "opacity-0" : ""}`}>
    <div className="font-mono-game text-[10px] uppercase tracking-widest text-[hsl(var(--hud-fg))]/50">{label}</div>
    <div className="mt-1 font-display text-2xl text-[hsl(var(--hud-fg))]">{value}</div>
  </div>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span className="mx-1 inline-block rounded-md border border-[hsl(var(--hud-fg))]/20 bg-[hsl(var(--hud-fg))]/10 px-2 py-0.5 font-mono-game text-[10px] uppercase tracking-widest text-[hsl(var(--hud-fg))]">
    {children}
  </span>
);

const formatTime = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};
