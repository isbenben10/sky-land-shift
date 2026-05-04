import { useEffect, useRef, useState } from "react";
import { Engine, type GameState } from "@/game/engine";
import { GameHUD } from "@/components/GameHUD";
import { GameOverlay } from "@/components/GameOverlay";

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<GameState>({
    running: false,
    gameOver: false,
    mode: "land",
    reversed: false,
    lowGravityMs: 0,
    timeMs: 0,
    miles: 0,
    bestMiles: Number(typeof window !== "undefined" ? localStorage.getItem("rex-rush-best") || 0 : 0),
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, { onState: setState });
    engineRef.current = engine;

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (engine.state.gameOver || !engine.state.running) {
          handleStart();
        } else {
          engine.press();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    setStarted(true);
    engineRef.current?.start();
  };

  const handleTap = () => {
    const e = engineRef.current;
    if (!e) return;
    if (e.state.gameOver || !e.state.running) handleStart();
    else e.press();
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[hsl(var(--hud-bg))]">
      <h1 className="sr-only">Rex Rush — Browser Endless Runner Game</h1>
      <canvas
        ref={canvasRef}
        onPointerDown={handleTap}
        className="absolute inset-0 h-full w-full touch-none select-none"
        aria-label="Rex Rush game canvas"
      />
      <GameHUD state={state} />
      <GameOverlay state={state} started={started} onStart={handleStart} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <span className="font-mono-game text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--hud-fg))]/40">
          space = jump / switch lane
        </span>
      </div>
    </main>
  );
};

export default Index;
