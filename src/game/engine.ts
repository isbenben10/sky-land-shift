import { sfx } from "./sounds";

// ---------- Types ----------
export type Mode = "land" | "sky" | "cave" | "space";
export type FruitKind = "apple" | "pineapple" | "durian" | "mushroom";
export type ObstacleKind =
  | "tree"
  | "hole"
  | "cloud"
  | "bird"
  | "skyhole"
  | "spike"
  | "star"
  | "portal-land"
  | "portal-sky";

export type GameState = {
  running: boolean;
  gameOver: boolean;
  mode: Mode;
  reversed: boolean;
  lowGravityMs: number;
  timeMs: number;
  miles: number;
  bestMiles: number;
  hearts: number;
  maxHearts: number;
  invulnMs: number;
};

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number;
};

type Fruit = { x: number; y: number; r: number; kind: FruitKind; bob: number; _eaten?: boolean };
type Obstacle = { x: number; y: number; w: number; h: number; kind: ObstacleKind; lane?: 0 | 1 };

const GROUND_RATIO = 0.78;
const PLAYER_X_RATIO = 0.18;
const BASE_SPEED = 360;
const SPEED_GROWTH = 8;
const MAX_SPEED = 900;
const NORMAL_GRAVITY = 2200;
const LOW_GRAVITY = 900;
const JUMP_VELOCITY = -780;
const JUMP_VELOCITY_LOW = -640;

const MIN_SPAWN_GAP = 0.55;
const FRUIT_CHANCE = 0.32;

const MAX_HEARTS = 3;
const INVULN_MS = 1400;

// Modes that use ground-based physics (gravity + jump)
const isGroundMode = (m: Mode) => m === "land" || m === "cave";
// Modes that use lane-switching
const isLaneMode = (m: Mode) => m === "sky" || m === "space";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export type EngineCallbacks = {
  onState: (s: GameState) => void;
};

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;
  private raf = 0;
  private lastTs = 0;

  private px = 0;
  private py = 0;
  private vy = 0;
  private onGround = true;
  private skyLane: 0 | 1 = 1;
  private skyTargetY = 0;

  private speed = BASE_SPEED;
  private worldOffset = 0;
  private bgOffset1 = 0;
  private bgOffset2 = 0;

  private fruits: Fruit[] = [];
  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private spawnTimer = 0;
  // Counts of obstacles spawned in current zone — used to schedule a return portal
  private zoneSpawnCount = 0;
  private portalQueued = false;

  private bodyTilt = 0;
  private legPhase = 0;
  private wingPhase = 0;
  private flashMs = 0;
  private flashColor = "rgba(255,255,255,0.4)";

  state: GameState = {
    running: false,
    gameOver: false,
    mode: "land",
    reversed: false,
    lowGravityMs: 0,
    timeMs: 0,
    miles: 0,
    bestMiles: 0,
    hearts: MAX_HEARTS,
    maxHearts: MAX_HEARTS,
    invulnMs: 0,
  };

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("No 2D context");
    this.ctx = c;
    this.cb = cb;
    const stored = typeof window !== "undefined" ? Number(localStorage.getItem("rex-rush-best") || 0) : 0;
    this.state.bestMiles = stored;
    this.resize();
  }

  resize = () => {
    const { canvas } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.state.running) this.draw(0);
  };

  start = () => {
    sfx.resume();
    this.fruits = [];
    this.obstacles = [];
    this.particles = [];
    this.speed = BASE_SPEED;
    this.spawnTimer = 0;
    this.worldOffset = 0;
    this.bgOffset1 = 0;
    this.bgOffset2 = 0;
    this.skyLane = 1;
    this.zoneSpawnCount = 0;
    this.portalQueued = false;
    this.state = {
      ...this.state,
      running: true,
      gameOver: false,
      mode: "land",
      reversed: false,
      lowGravityMs: 0,
      timeMs: 0,
      miles: 0,
      hearts: MAX_HEARTS,
      maxHearts: MAX_HEARTS,
      invulnMs: 0,
    };
    const h = this.cssHeight();
    this.py = h * GROUND_RATIO - this.playerHeight();
    this.vy = 0;
    this.onGround = true;
    this.lastTs = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.cb.onState({ ...this.state });
  };

  stop = () => {
    cancelAnimationFrame(this.raf);
    this.state.running = false;
  };

  destroy = () => {
    cancelAnimationFrame(this.raf);
  };

  press = () => {
    if (!this.state.running || this.state.gameOver) return;
    if (isGroundMode(this.state.mode)) {
      if (this.onGround) {
        this.vy = this.state.lowGravityMs > 0 ? JUMP_VELOCITY_LOW : JUMP_VELOCITY;
        this.onGround = false;
        sfx.jump();
      }
    } else {
      this.skyLane = this.skyLane === 0 ? 1 : 0;
      sfx.jump();
    }
  };

  private cssWidth() { return this.canvas.clientWidth; }
  private cssHeight() { return this.canvas.clientHeight; }
  private playerWidth() { return isGroundMode(this.state.mode) ? 56 : 70; }
  private playerHeight() { return isGroundMode(this.state.mode) ? 60 : 46; }
  private groundY() { return this.cssHeight() * GROUND_RATIO; }
  private skyLaneY(lane: 0 | 1) {
    const h = this.cssHeight();
    return lane === 0 ? h * 0.28 : h * 0.58;
  }

  private loop = (ts: number) => {
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this.state.running && !this.state.gameOver) {
      this.update(dt);
    }
    this.draw(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.state.timeMs += dt * 1000;
    this.state.miles = this.state.timeMs / 1000;

    this.speed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_GROWTH * (this.state.timeMs / 1000));

    if (this.state.lowGravityMs > 0) {
      this.state.lowGravityMs = Math.max(0, this.state.lowGravityMs - dt * 1000);
    }
    if (this.state.invulnMs > 0) {
      this.state.invulnMs = Math.max(0, this.state.invulnMs - dt * 1000);
    }

    const dir = this.state.reversed ? -1 : 1;
    this.bgOffset1 = (this.bgOffset1 + this.speed * 0.25 * dt * dir) % 10000;
    this.bgOffset2 = (this.bgOffset2 + this.speed * 0.55 * dt * dir) % 10000;
    this.worldOffset += this.speed * dt * dir;

    this.px = this.cssWidth() * PLAYER_X_RATIO;
    if (isGroundMode(this.state.mode)) {
      const g = this.state.lowGravityMs > 0 ? LOW_GRAVITY : NORMAL_GRAVITY;
      this.vy += g * dt;
      this.py += this.vy * dt;
      const groundTop = this.groundY() - this.playerHeight();
      if (this.py >= groundTop) {
        this.py = groundTop;
        this.vy = 0;
        this.onGround = true;
      }
      this.legPhase += dt * (this.speed / 60);
      this.bodyTilt = Math.max(-0.15, Math.min(0.2, this.vy / 4000));
    } else {
      this.skyTargetY = this.skyLaneY(this.skyLane) - this.playerHeight() / 2;
      this.py += (this.skyTargetY - this.py) * Math.min(1, dt * 12);
      this.wingPhase += dt * 14;
      this.bodyTilt = Math.sin(this.wingPhase) * 0.06;
    }

    this.spawnTimer -= dt;
    const speedFactor = BASE_SPEED / this.speed;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = rand(MIN_SPAWN_GAP, 1.4) * speedFactor;
    }

    const dx = this.speed * dt * dir;
    for (const o of this.obstacles) o.x -= dx;
    for (const f of this.fruits) { f.x -= dx; f.bob += dt; }

    const margin = 200;
    const w = this.cssWidth();
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -margin && o.x < w + margin * 3);
    this.fruits = this.fruits.filter((f) => f.x + f.r > -margin && f.x < w + margin * 3);

    for (const p of this.particles) {
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (this.flashMs > 0) this.flashMs -= dt * 1000;

    this.checkCollisions();

    this.cb.onState({ ...this.state });
  }

  private spawn() {
    const w = this.cssWidth();
    const dir = this.state.reversed ? -1 : 1;
    const spawnX = dir > 0 ? w + 60 : -120;
    const mode = this.state.mode;

    this.zoneSpawnCount += 1;

    // After enough obstacles in cave/space, queue a return portal
    if (!this.portalQueued && (mode === "cave" || mode === "space") && this.zoneSpawnCount >= 6) {
      this.portalQueued = true;
      if (mode === "cave") {
        this.obstacles.push({
          x: spawnX,
          y: this.groundY() - 80,
          w: 60,
          h: 80,
          kind: "portal-land",
        });
      } else {
        const lane: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        this.obstacles.push({
          x: spawnX,
          y: this.skyLaneY(lane) - 38,
          w: 70,
          h: 76,
          kind: "portal-sky",
          lane,
        });
      }
      return;
    }

    if (mode === "land") {
      if (Math.random() < FRUIT_CHANCE) {
        const kind = pick<FruitKind>(["apple", "apple", "pineapple", "mushroom"]);
        const y = this.groundY() - rand(60, 160);
        this.fruits.push({ x: spawnX, y, r: 16, kind, bob: Math.random() * 6 });
      } else {
        const r = Math.random();
        if (r < 0.6) {
          const h = rand(40, 75);
          this.obstacles.push({ x: spawnX, y: this.groundY() - h, w: 26, h, kind: "tree" });
        } else {
          const ww = rand(50, 90);
          this.obstacles.push({ x: spawnX, y: this.groundY(), w: ww, h: 30, kind: "hole" });
        }
      }
    } else if (mode === "cave") {
      if (Math.random() < FRUIT_CHANCE) {
        const kind = pick<FruitKind>(["apple", "apple", "mushroom", "pineapple"]);
        const y = this.groundY() - rand(60, 150);
        this.fruits.push({ x: spawnX, y, r: 16, kind, bob: Math.random() * 6 });
      } else {
        const h = rand(28, 44);
        this.obstacles.push({
          x: spawnX,
          y: this.groundY() - h,
          w: rand(22, 40),
          h,
          kind: "spike",
        });
      }
    } else if (mode === "sky") {
      if (Math.random() < FRUIT_CHANCE) {
        const kind = pick<FruitKind>(["durian", "durian", "mushroom", "apple"]);
        const lane: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        this.fruits.push({ x: spawnX, y: this.skyLaneY(lane), r: 16, kind, bob: 0 });
      } else {
        const r = Math.random();
        const lane: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        const y = this.skyLaneY(lane);
        if (r < 0.45) {
          this.obstacles.push({ x: spawnX, y: y - 22, w: 70, h: 40, kind: "cloud", lane });
        } else if (r < 0.85) {
          this.obstacles.push({ x: spawnX, y: y - 14, w: 40, h: 28, kind: "bird", lane });
        } else {
          this.obstacles.push({ x: spawnX, y: y - 30, w: 90, h: 60, kind: "skyhole", lane });
        }
      }
    } else if (mode === "space") {
      if (Math.random() < FRUIT_CHANCE) {
        const kind = pick<FruitKind>(["durian", "mushroom", "apple"]);
        const lane: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        this.fruits.push({ x: spawnX, y: this.skyLaneY(lane), r: 16, kind, bob: 0 });
      } else {
        const lane: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        const y = this.skyLaneY(lane);
        this.obstacles.push({ x: spawnX, y: y - 18, w: 36, h: 36, kind: "star", lane });
      }
    }
  }

  private playerRect() {
    return { x: this.px, y: this.py, w: this.playerWidth(), h: this.playerHeight() };
  }

  private intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
    const pad = 6;
    return (
      a.x + pad < b.x + b.w - pad &&
      a.x + a.w - pad > b.x + pad &&
      a.y + pad < b.y + b.h - pad &&
      a.y + a.h - pad > b.y + pad
    );
  }

  private checkCollisions() {
    const pr = this.playerRect();

    for (const f of this.fruits) {
      const fr = { x: f.x - f.r, y: f.y - f.r, w: f.r * 2, h: f.r * 2 };
      if (this.intersects(pr, fr)) {
        this.consumeFruit(f);
      }
    }
    this.fruits = this.fruits.filter((f) => !f._eaten);

    for (const o of this.obstacles) {
      if (o.kind === "hole") {
        if (this.state.mode === "land" && this.onGround) {
          const feet = { x: pr.x + 8, y: pr.y + pr.h - 4, w: pr.w - 16, h: 8 };
          const top = { x: o.x, y: o.y - 2, w: o.w, h: 8 };
          if (this.intersects(feet, top)) return this.enterCave();
        }
      } else if (o.kind === "skyhole") {
        if (this.state.mode === "sky" && o.lane === this.skyLane) {
          if (this.intersects(pr, o)) return this.enterSpace();
        }
      } else if (o.kind === "portal-land") {
        if (this.state.mode === "cave" && this.intersects(pr, o)) return this.exitToLand();
      } else if (o.kind === "portal-sky") {
        if (this.state.mode === "space" && o.lane === this.skyLane && this.intersects(pr, o)) return this.exitToSky();
      } else if (o.kind === "cloud" || o.kind === "bird") {
        if (this.state.mode === "sky" && o.lane === this.skyLane) {
          if (this.intersects(pr, o)) return this.takeHit();
        }
      } else if (o.kind === "star") {
        if (this.state.mode === "space" && o.lane === this.skyLane) {
          if (this.intersects(pr, o)) return this.takeHit();
        }
      } else if (o.kind === "tree") {
        if (this.state.mode === "land" && this.intersects(pr, o)) return this.takeHit();
      } else if (o.kind === "spike") {
        if (this.state.mode === "cave" && this.intersects(pr, o)) return this.takeHit();
      }
    }
  }

  private consumeFruit(f: Fruit & { _eaten?: boolean }) {
    f._eaten = true;
    sfx.fruit();
    this.spawnParticles(f.x, f.y, this.fruitColor(f.kind), 16);
    switch (f.kind) {
      case "apple":
        this.state.lowGravityMs = 6000;
        this.flash("hsla(355,80%,55%,0.25)");
        break;
      case "pineapple":
        if (isGroundMode(this.state.mode)) {
          this.state.mode = "sky";
          this.skyLane = 1;
          this.py = this.skyLaneY(1) - this.playerHeight() / 2;
          this.vy = 0;
          this.obstacles = [];
          this.fruits = [];
          this.zoneSpawnCount = 0;
          this.portalQueued = false;
          sfx.transform();
          this.flash("hsla(48,95%,55%,0.35)");
        }
        break;
      case "durian":
        if (isLaneMode(this.state.mode)) {
          this.state.mode = "land";
          this.py = this.groundY() - this.playerHeight();
          this.vy = 0;
          this.onGround = true;
          this.obstacles = [];
          this.fruits = [];
          this.zoneSpawnCount = 0;
          this.portalQueued = false;
          sfx.transform();
          this.flash("hsla(75,55%,45%,0.35)");
        }
        break;
      case "mushroom":
        this.state.reversed = !this.state.reversed;
        sfx.reverse();
        this.flash("hsla(295,65%,55%,0.3)");
        break;
    }
  }

  // ---------- Zone transitions ----------
  private enterCave() {
    this.state.mode = "cave";
    this.obstacles = [];
    this.fruits = [];
    this.zoneSpawnCount = 0;
    this.portalQueued = false;
    this.py = this.groundY() - this.playerHeight();
    this.vy = 0;
    this.onGround = true;
    this.state.invulnMs = 800;
    sfx.transform();
    this.flash("hsla(20,40%,8%,0.55)");
    this.spawnParticles(this.px + 28, this.py + 30, "hsl(295,65%,55%)", 22);
  }

  private exitToLand() {
    this.state.mode = "land";
    this.obstacles = [];
    this.fruits = [];
    this.zoneSpawnCount = 0;
    this.portalQueued = false;
    this.py = this.groundY() - this.playerHeight();
    this.vy = 0;
    this.onGround = true;
    this.state.invulnMs = 800;
    sfx.transform();
    this.flash("hsla(48,95%,70%,0.4)");
    this.spawnParticles(this.px + 28, this.py + 30, "hsl(48,95%,55%)", 22);
  }

  private enterSpace() {
    this.state.mode = "space";
    this.obstacles = [];
    this.fruits = [];
    this.zoneSpawnCount = 0;
    this.portalQueued = false;
    this.skyLane = 1;
    this.py = this.skyLaneY(1) - this.playerHeight() / 2;
    this.state.invulnMs = 800;
    sfx.transform();
    this.flash("hsla(240,80%,10%,0.55)");
    this.spawnParticles(this.px + 28, this.py + 20, "hsl(280,80%,70%)", 22);
  }

  private exitToSky() {
    this.state.mode = "sky";
    this.obstacles = [];
    this.fruits = [];
    this.zoneSpawnCount = 0;
    this.portalQueued = false;
    this.py = this.skyLaneY(this.skyLane) - this.playerHeight() / 2;
    this.state.invulnMs = 800;
    sfx.transform();
    this.flash("hsla(320,80%,70%,0.4)");
    this.spawnParticles(this.px + 28, this.py + 20, "hsl(320,80%,70%)", 22);
  }

  private fruitColor(k: FruitKind) {
    switch (k) {
      case "apple": return "hsl(355,80%,55%)";
      case "pineapple": return "hsl(48,95%,55%)";
      case "durian": return "hsl(75,55%,45%)";
      case "mushroom": return "hsl(295,65%,55%)";
    }
  }

  private spawnParticles(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(80, 240);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: rand(0.4, 0.9),
        maxLife: 0.9,
        color,
        size: rand(2, 5),
      });
    }
  }

  private flash(color: string) {
    this.flashMs = 220;
    this.flashColor = color;
  }

  private takeHit() {
    if (this.state.invulnMs > 0 || this.state.gameOver) return;
    this.state.hearts -= 1;
    this.state.invulnMs = INVULN_MS;
    this.flash("hsla(0,80%,55%,0.35)");
    this.spawnParticles(
      this.px + this.playerWidth() / 2,
      this.py + this.playerHeight() / 2,
      "hsl(0,80%,60%)",
      18
    );
    sfx.jump();
    if (this.state.hearts <= 0) {
      this.die();
    } else {
      this.cb.onState({ ...this.state });
    }
  }

  private die() {
    if (this.state.gameOver) return;
    this.state.gameOver = true;
    this.state.running = false;
    this.state.hearts = 0;
    if (this.state.miles > this.state.bestMiles) {
      this.state.bestMiles = this.state.miles;
      try { localStorage.setItem("rex-rush-best", String(this.state.bestMiles)); } catch {}
    }
    sfx.gameover();
    this.spawnParticles(this.px + this.playerWidth() / 2, this.py + this.playerHeight() / 2, "hsl(0,75%,55%)", 30);
    this.cb.onState({ ...this.state });
  }

  // ---------- Render ----------
  private draw(_dt: number) {
    const { ctx } = this;
    const w = this.cssWidth();
    const h = this.cssHeight();
    ctx.clearRect(0, 0, w, h);

    if (this.state.mode === "land") this.drawLandBg(w, h);
    else if (this.state.mode === "cave") this.drawCaveBg(w, h);
    else if (this.state.mode === "sky") this.drawSkyBg(w, h);
    else this.drawSpaceBg(w, h);

    if (this.state.reversed) {
      ctx.fillStyle = "hsla(280,80%,50%,0.12)";
      ctx.fillRect(0, 0, w, h);
    }

    if (isGroundMode(this.state.mode)) this.drawGround(w, h);
    this.drawObstacles();
    this.drawFruits();
    this.drawPlayer();
    this.drawParticles();

    if (this.flashMs > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawLandBg(w: number, h: number) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "hsl(200,75%,70%)");
    grad.addColorStop(1, "hsl(30,90%,75%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "hsla(45,100%,70%,0.9)";
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.25, 50, 0, Math.PI * 2);
    ctx.fill();

    const off1 = ((this.bgOffset1 % 600) + 600) % 600;
    ctx.fillStyle = "hsla(260,30%,55%,0.45)";
    for (let i = -1; i < Math.ceil(w / 300) + 2; i++) {
      const x = i * 300 - off1;
      ctx.beginPath();
      ctx.moveTo(x, h * GROUND_RATIO);
      ctx.lineTo(x + 150, h * GROUND_RATIO - 120);
      ctx.lineTo(x + 300, h * GROUND_RATIO);
      ctx.closePath();
      ctx.fill();
    }

    const off2 = ((this.bgOffset2 % 400) + 400) % 400;
    ctx.fillStyle = "hsla(140,40%,40%,0.55)";
    for (let i = -1; i < Math.ceil(w / 200) + 2; i++) {
      const x = i * 200 - off2;
      ctx.beginPath();
      ctx.arc(x + 100, h * GROUND_RATIO + 10, 110, Math.PI, 0);
      ctx.fill();
    }
  }

  private drawCaveBg(w: number, h: number) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "hsl(260,40%,10%)");
    grad.addColorStop(1, "hsl(280,35%,18%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Crystals/glow specks
    const off1 = ((this.bgOffset1 % 800) + 800) % 800;
    for (let i = 0; i < 30; i++) {
      const baseX = (i * 173) % 800;
      const x = ((baseX - off1) % 800 + 800) % 800 + Math.floor(i / 6) * 800 - 400;
      const y = (i * 71) % (h * GROUND_RATIO - 40) + 20;
      ctx.fillStyle = i % 3 === 0 ? "hsla(295,80%,65%,0.6)" : "hsla(200,80%,70%,0.4)";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stalactites
    const off2 = ((this.bgOffset2 % 180) + 180) % 180;
    ctx.fillStyle = "hsl(270,30%,14%)";
    for (let i = -1; i < Math.ceil(w / 90) + 2; i++) {
      const x = i * 90 - off2;
      const sh = 30 + ((i * 17) % 25);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 18, 0);
      ctx.lineTo(x + 9, sh);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSkyBg(w: number, h: number) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "hsl(270,70%,35%)");
    grad.addColorStop(1, "hsl(320,75%,60%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "hsla(0,0%,100%,0.85)";
    const off1 = ((this.bgOffset1 % 800) + 800) % 800;
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137) % 800 - off1 + 800) % 800 + (Math.floor(i / 5) * 800) - 400;
      const y = (i * 53) % h;
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = "hsla(0,0%,100%,0.12)";
    ctx.setLineDash([10, 14]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.28);
    ctx.lineTo(w, h * 0.28);
    ctx.moveTo(0, h * 0.58);
    ctx.lineTo(w, h * 0.58);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawSpaceBg(w: number, h: number) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "hsl(240,60%,6%)");
    grad.addColorStop(1, "hsl(260,70%,12%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Distant nebula glow
    const ng = ctx.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.7, h * 0.3, w * 0.5);
    ng.addColorStop(0, "hsla(280,80%,40%,0.4)");
    ng.addColorStop(1, "hsla(240,80%,20%,0)");
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, w, h);

    // Tiny background stars (don't hurt)
    ctx.fillStyle = "hsla(0,0%,100%,0.7)";
    const off1 = ((this.bgOffset1 % 800) + 800) % 800;
    for (let i = 0; i < 60; i++) {
      const x = ((i * 137) % 800 - off1 + 800) % 800 + (Math.floor(i / 5) * 800) - 400;
      const y = (i * 53) % h;
      ctx.fillRect(x, y, 1, 1);
    }

    // Lane guides
    ctx.strokeStyle = "hsla(280,80%,80%,0.15)";
    ctx.setLineDash([10, 14]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.28);
    ctx.lineTo(w, h * 0.28);
    ctx.moveTo(0, h * 0.58);
    ctx.lineTo(w, h * 0.58);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawGround(w: number, h: number) {
    const { ctx } = this;
    const gy = this.groundY();
    const isCave = this.state.mode === "cave";
    const trackGrad = ctx.createLinearGradient(0, gy, 0, h);
    if (isCave) {
      trackGrad.addColorStop(0, "hsl(270,30%,20%)");
      trackGrad.addColorStop(1, "hsl(270,35%,10%)");
    } else {
      trackGrad.addColorStop(0, "hsl(32,55%,45%)");
      trackGrad.addColorStop(1, "hsl(28,45%,30%)");
    }
    ctx.fillStyle = trackGrad;
    ctx.fillRect(0, gy, w, h - gy);

    ctx.strokeStyle = isCave ? "hsl(280,40%,8%)" : "hsl(28,45%,25%)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();

    const off = ((this.worldOffset % 60) + 60) % 60;
    ctx.fillStyle = isCave ? "hsla(295,80%,70%,0.55)" : "hsla(45,90%,80%,0.7)";
    for (let i = -1; i < Math.ceil(w / 60) + 2; i++) {
      ctx.fillRect(i * 60 - off, gy + 14, 30, 4);
    }
  }

  private drawObstacles() {
    const { ctx } = this;
    for (const o of this.obstacles) {
      ctx.save();
      if (o.kind === "tree") {
        ctx.fillStyle = "hsl(24,55%,25%)";
        ctx.fillRect(o.x + o.w / 2 - 4, o.y + o.h - 18, 8, 18);
        ctx.fillStyle = "hsl(140,60%,35%)";
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, o.y + 14, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "hsl(140,55%,28%)";
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2 - 8, o.y + 22, 12, 0, Math.PI * 2);
        ctx.arc(o.x + o.w / 2 + 8, o.y + 22, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.kind === "hole") {
        ctx.fillStyle = "hsl(20,40%,12%)";
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + 4, o.w / 2, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "hsl(20,40%,8%)";
        ctx.fillRect(o.x, o.y + 4, o.w, 30);
        // Glowing rim hint of teleport
        ctx.strokeStyle = "hsla(295,80%,65%,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + 4, o.w / 2, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (o.kind === "spike") {
        // upward triangle spike from ground
        ctx.fillStyle = "hsl(0,0%,75%)";
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "hsl(0,0%,40%)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // base
        ctx.fillStyle = "hsl(270,30%,18%)";
        ctx.fillRect(o.x - 2, o.y + o.h - 4, o.w + 4, 6);
      } else if (o.kind === "star") {
        // 5-point yellow star (hazard)
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const R = o.w / 2;
        const r = R * 0.45;
        const rot = (performance.now() / 600) % (Math.PI * 2);
        ctx.fillStyle = "hsl(48,95%,60%)";
        ctx.shadowColor = "hsla(48,95%,60%,0.9)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = rot + (i * Math.PI) / 5 - Math.PI / 2;
          const rr = i % 2 === 0 ? R : r;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      } else if (o.kind === "cloud") {
        ctx.fillStyle = "hsla(0,0%,100%,0.85)";
        ctx.beginPath();
        ctx.arc(o.x + 18, o.y + 22, 18, 0, Math.PI * 2);
        ctx.arc(o.x + 38, o.y + 18, 22, 0, Math.PI * 2);
        ctx.arc(o.x + 56, o.y + 24, 16, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.kind === "bird") {
        ctx.fillStyle = "hsl(20,15%,15%)";
        const flap = Math.sin(performance.now() / 100) * 6;
        ctx.beginPath();
        ctx.ellipse(o.x + 20, o.y + 14, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(o.x + 10, o.y + 12);
        ctx.lineTo(o.x, o.y - 4 + flap);
        ctx.lineTo(o.x + 18, o.y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(o.x + 28, o.y + 12);
        ctx.lineTo(o.x + 40, o.y - 4 + flap);
        ctx.lineTo(o.x + 22, o.y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "hsl(35,90%,55%)";
        ctx.beginPath();
        ctx.moveTo(o.x + 32, o.y + 14);
        ctx.lineTo(o.x + 40, o.y + 16);
        ctx.lineTo(o.x + 32, o.y + 18);
        ctx.closePath();
        ctx.fill();
      } else if (o.kind === "skyhole") {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, o.w / 2);
        grad.addColorStop(0, "hsl(0,0%,2%)");
        grad.addColorStop(1, "hsla(280,80%,30%,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "hsla(320,80%,70%,0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.w / 2 - 2, o.h / 2 - 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (o.kind === "portal-land" || o.kind === "portal-sky") {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const isLandPortal = o.kind === "portal-land";
        const innerColor = isLandPortal ? "hsl(48,95%,65%)" : "hsl(200,90%,70%)";
        const ringColor = isLandPortal ? "hsla(48,95%,65%,0.85)" : "hsla(200,90%,70%,0.85)";
        const t = performance.now() / 200;
        // halo
        const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(o.w, o.h) / 1.4);
        halo.addColorStop(0, innerColor);
        halo.addColorStop(0.5, ringColor);
        halo.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.w / 2 + 6, o.h / 2 + 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // swirling ring
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(
            cx,
            cy,
            o.w / 2 - i * 6,
            o.h / 2 - i * 6,
            t + i,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
        // label arrow
        ctx.fillStyle = "hsla(0,0%,100%,0.95)";
        ctx.font = "bold 12px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(isLandPortal ? "LAND" : "SKY", cx, cy + 4);
      }
      ctx.restore();
    }
  }

  private drawFruits() {
    const { ctx } = this;
    for (const f of this.fruits) {
      const bob = Math.sin(f.bob * 4) * 3;
      ctx.save();
      ctx.translate(f.x, f.y + bob);

      ctx.shadowColor = this.fruitColor(f.kind);
      ctx.shadowBlur = 18;

      if (f.kind === "apple") {
        ctx.fillStyle = "hsl(355,80%,55%)";
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "hsl(140,60%,35%)";
        ctx.fillRect(-1, -16, 2, 6);
        ctx.beginPath();
        ctx.ellipse(5, -14, 5, 3, 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === "pineapple") {
        ctx.fillStyle = "hsl(48,95%,55%)";
        ctx.beginPath();
        ctx.ellipse(0, 2, 11, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "hsl(35,80%,40%)";
        ctx.lineWidth = 1;
        for (let i = -8; i <= 8; i += 4) {
          ctx.beginPath();
          ctx.moveTo(-10, i);
          ctx.lineTo(10, i + 2);
          ctx.stroke();
        }
        ctx.fillStyle = "hsl(140,60%,35%)";
        for (let i = -8; i <= 8; i += 4) {
          ctx.beginPath();
          ctx.moveTo(i, -12);
          ctx.lineTo(i + 2, -22);
          ctx.lineTo(i + 4, -12);
          ctx.closePath();
          ctx.fill();
        }
      } else if (f.kind === "durian") {
        ctx.fillStyle = "hsl(75,55%,45%)";
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "hsl(75,60%,30%)";
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          const x = Math.cos(a) * 10;
          const y = Math.sin(a) * 10;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
          ctx.lineTo(Math.cos(a + 0.2) * 12, Math.sin(a + 0.2) * 12);
          ctx.closePath();
          ctx.fill();
        }
      } else if (f.kind === "mushroom") {
        ctx.fillStyle = "hsl(45,30%,90%)";
        ctx.fillRect(-5, 0, 10, 12);
        ctx.fillStyle = "hsl(295,65%,55%)";
        ctx.beginPath();
        ctx.arc(0, 0, 13, Math.PI, 0);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "hsl(45,30%,98%)";
        ctx.beginPath(); ctx.arc(-5, -4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -8, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPlayer() {
    const { ctx } = this;
    const x = this.px;
    const y = this.py;
    const w = this.playerWidth();
    const h = this.playerHeight();

    // Invulnerability blink
    if (this.state.invulnMs > 0) {
      const t = Math.floor(this.state.invulnMs / 90);
      if (t % 2 === 0) {
        // skip drawing this frame to create flicker
        return;
      }
    }

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(this.bodyTilt);

    if (isGroundMode(this.state.mode)) {
      const lowG = this.state.lowGravityMs > 0;
      const bodyColor = lowG ? "hsl(140,65%,45%)" : "hsl(140,55%,40%)";

      if (lowG) {
        ctx.shadowColor = "hsla(355,80%,55%,0.7)";
        ctx.shadowBlur = 18;
      }

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, -2);
      ctx.lineTo(-w / 2 - 12, -10);
      ctx.lineTo(-w / 2 + 4, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillRect(-w / 2 + 4, -h / 2 + 16, w - 12, h - 28);
      ctx.fillRect(w / 2 - 18, -h / 2 + 4, 18, 22);
      ctx.fillRect(w / 2 - 4, -h / 2 + 14, 8, 8);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "white";
      ctx.fillRect(w / 2 - 12, -h / 2 + 10, 5, 5);
      ctx.fillStyle = "black";
      ctx.fillRect(w / 2 - 10, -h / 2 + 12, 2, 2);

      ctx.fillStyle = bodyColor;
      ctx.fillRect(w / 2 - 22, -2, 6, 3);

      const lp = this.onGround ? Math.sin(this.legPhase) * 6 : 0;
      ctx.fillRect(-6, h / 2 - 12, 8, 12 - lp);
      ctx.fillRect(6, h / 2 - 12, 8, 12 + lp);
    } else {
      ctx.shadowColor = "hsla(320,80%,70%,0.6)";
      ctx.shadowBlur = 16;

      ctx.fillStyle = "hsl(280,70%,55%)";
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 6, 0);
      ctx.lineTo(-w / 2 - 18, -8);
      ctx.lineTo(-w / 2 - 18, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "hsl(290,75%,50%)";
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2 - 6, h / 2 - 4, 0, 0, Math.PI * 2);
      ctx.fill();

      const flap = Math.sin(this.wingPhase) * 10;
      ctx.fillStyle = "hsl(320,70%,60%)";
      ctx.beginPath();
      ctx.moveTo(-4, -h / 2 + 4);
      ctx.lineTo(-12, -h / 2 - 14 - flap);
      ctx.lineTo(8, -h / 2 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2, -h / 2 + 4);
      ctx.lineTo(14, -h / 2 - 18 - flap);
      ctx.lineTo(18, -h / 2 + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "hsl(290,75%,50%)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - 8, -2, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "white";
      ctx.fillRect(w / 2 - 6, -6, 4, 4);
      ctx.fillStyle = "black";
      ctx.fillRect(w / 2 - 5, -5, 2, 2);
      ctx.fillStyle = `hsla(${30 + Math.random() * 20},95%,60%,0.9)`;
      ctx.beginPath();
      ctx.moveTo(w / 2 + 4, -2);
      ctx.lineTo(w / 2 + 14 + Math.random() * 4, -4);
      ctx.lineTo(w / 2 + 14 + Math.random() * 4, 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
