import {animate} from "motion";
import {Container, type DestroyOptions, Graphics, Sprite, Texture, type Ticker} from "pixi.js";
import {engine} from "../../getEngine";
import type {PlayerState} from "../../lib/models/PlayerState";

// TODO: placeholder SFX for all rocket actions — swap for per-action sounds later.
const ACTION_SFX = "main/sounds/sfx-press.wav";

const BASE_SCALE = 0.5;
const ENERGY_CRITICAL_THRESHOLD = 20;
const ENERGY_CRITICAL_INTERVAL = 1.2;
const TRAIL_HISTORY = 12;

/** How quickly the rendered ship eases toward the latest server state, in 1/seconds (higher = snappier). */
const POSITION_SMOOTH_RATE = 20;
const ROTATION_SMOOTH_RATE = 20;
/** Position deltas beyond this are treated as a teleport (respawn/match reset) and snapped instead of eased. */
const TELEPORT_DISTANCE = 300;

export interface Vector2 {
  x: number;
  y: number;
}

interface EngineDef {
  /** Horizontal nozzle position, 0 = left edge, 1 = right edge of the ship sprite */
  xFrac: number;
  /** Vertical nozzle position, 0 = top edge, 1 = bottom edge of the ship sprite */
  yFrac: number;
  /** Relative size of this engine's flame/glow/trail versus a normal-sized one */
  scale: number;
}

/** Per-stage engine layouts, matched against the actual spaceship_stage_N.svg artwork */
const ENGINE_LAYOUTS: Record<number, EngineDef[]> = {
  1: [
    {xFrac: 0.2, yFrac: 0.94, scale: 0.75},
    {xFrac: 0.5, yFrac: 0.9, scale: 1.3},
    {xFrac: 0.8, yFrac: 0.94, scale: 0.75},
  ],
  2: [
    {xFrac: 0.18, yFrac: 0.93, scale: 0.75},
    {xFrac: 0.33, yFrac: 0.95, scale: 0.75},
    {xFrac: 0.5, yFrac: 0.9, scale: 1.4},
    {xFrac: 0.67, yFrac: 0.95, scale: 0.75},
    {xFrac: 0.82, yFrac: 0.93, scale: 0.75},
  ],
  3: [
    {xFrac: 0.1, yFrac: 0.9, scale: 0.7},
    {xFrac: 0.22, yFrac: 0.94, scale: 0.7},
    {xFrac: 0.35, yFrac: 0.96, scale: 0.7},
    {xFrac: 0.5, yFrac: 0.9, scale: 1.4},
    {xFrac: 0.65, yFrac: 0.96, scale: 0.7},
    {xFrac: 0.78, yFrac: 0.94, scale: 0.7},
    {xFrac: 0.9, yFrac: 0.9, scale: 0.7},
  ],
  4: [
    {xFrac: 0.06, yFrac: 0.9, scale: 1.2},
    {xFrac: 0.14, yFrac: 0.94, scale: 0.7},
    {xFrac: 0.45, yFrac: 0.93, scale: 1.3},
    {xFrac: 0.55, yFrac: 0.93, scale: 1.3},
    {xFrac: 0.86, yFrac: 0.94, scale: 0.7},
    {xFrac: 0.94, yFrac: 0.9, scale: 1.2},
  ],
};

interface BumpOptions {
  flashColor: number;
  squashReduction: number;
  nudgeStrength: number;
  fragments?: boolean;
  fragmentColor?: number;
}

/** Shortest-path angle interpolation, so a ship never spins the long way round when crossing the -PI/PI seam. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  else if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);

  return (r << 16) | (g << 8) | bl;
}

/**
 * Shared ship visuals (sprite, effects, engine trail) for local and remote rockets.
 * Phase 1: pure visual effects only. Only Boost, Dash-Ready and the Energy-critical
 * heartbeat are wired to real state; the rest are public methods with no automatic
 * trigger yet (see plan doc) until the backend/wire signals they need exist.
 */
export class BaseRocket extends Container {
  protected image: Sprite;
  protected stage = 1;

  private effectsBehind: Container;
  private effectsAbove: Container;
  private trailGraphics: Graphics;
  private engines: EngineDef[] = ENGINE_LAYOUTS[1];
  private trailPoints: Vector2[][] = this.engines.map(() => []);

  private prevDashAvailable = false;
  private energyCriticalArmed = false;
  private energyCriticalTimer = 0;

  private hasServerState = false;
  private targetX = 0;
  private targetY = 0;
  private targetRotation = 0;

  constructor() {
    super();

    this.effectsBehind = new Container();
    this.addChild(this.effectsBehind);

    this.image = new Sprite({
      texture: Texture.from("spaceship_stage_1.svg"),
      anchor: 0.5,
      alpha: 1,
      scale: BASE_SCALE,
    });
    this.addChild(this.image);

    this.effectsAbove = new Container();
    this.addChild(this.effectsAbove);

    this.trailGraphics = new Graphics();
    this.on("added", (parent: Container) => {
      if (!this.trailGraphics.parent) {
        parent.addChildAt(this.trailGraphics, parent.getChildIndex(this));
      }
    });
  }

  /** Set upgrade stage of the spaceship (1-4) */
  public setStage(stage: number): void {
    const nextStage = Math.max(1, Math.min(4, Math.floor(stage)));
    const stageChanged = nextStage !== this.stage;

    this.stage = nextStage;
    this.image.texture = Texture.from(`spaceship_stage_${this.stage}.svg`);

    if (stageChanged) {
      this.engines = ENGINE_LAYOUTS[this.stage] ?? ENGINE_LAYOUTS[1];
      this.trailPoints = this.engines.map(() => []);
    }
  }

  /** Get current stage */
  public getStage(): number {
    return this.stage;
  }

  /** Get the base width, without counting the shadow */
  public get boxWidth(): number {
    return this.image.width;
  }

  /** Get the base height, without counting the shadow */
  public get boxHeight(): number {
    return this.image.height;
  }

  /** Ship's natural (unanimated) rendered width, used as the sizing reference for all effects */
  private get baseWidth(): number {
    return this.image.texture.width * BASE_SCALE;
  }

  /** Ship's natural (unanimated) rendered height, used as the sizing reference for all effects */
  private get baseHeight(): number {
    return this.image.texture.height * BASE_SCALE;
  }

  /** Apply authoritative server PlayerState (position, rotation, stage) and react to effect-relevant fields */
  protected applyBaseState(state: PlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetRotation = state.rotation + Math.PI / 2;

    // Snap on first state (avoids sliding in from origin) or on a large jump (respawn/match reset),
    // otherwise let update() ease toward the target so gaps in server updates don't read as freeze-then-jump.
    const distance = Math.hypot(this.targetX - this.x, this.targetY - this.y);
    if (!this.hasServerState || distance > TELEPORT_DISTANCE) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.rotation = this.targetRotation;
    }
    this.hasServerState = true;

    this.setStage(state.size);

    if (state.dashed) {
      this.playBoost();
    }

    if (state.dashAvailable && !this.prevDashAvailable) {
      this.playDashReady();
    }
    this.prevDashAvailable = state.dashAvailable;

    const isCritical = state.energy < ENERGY_CRITICAL_THRESHOLD;
    if (isCritical && !this.energyCriticalArmed) {
      this.energyCriticalTimer = 0;
    }
    this.energyCriticalArmed = isCritical;
  }

  /** Per-frame effect upkeep: position/rotation easing, engine trail redraw and energy-critical heartbeat */
  public update(time: Ticker): void {
    this.updateInterpolation(time.deltaMS / 1000);
    this.updateTrail();
    this.updateEnergyCritical(time.deltaMS / 1000);
  }

  /** Ease the rendered transform toward the latest server state, decoupled from when packets actually arrive */
  private updateInterpolation(elapsedSeconds: number): void {
    if (!this.hasServerState) return;

    const posT = 1 - Math.exp(-POSITION_SMOOTH_RATE * elapsedSeconds);
    this.x += (this.targetX - this.x) * posT;
    this.y += (this.targetY - this.y) * posT;

    const rotT = 1 - Math.exp(-ROTATION_SMOOTH_RATE * elapsedSeconds);
    this.rotation = lerpAngle(this.rotation, this.targetRotation, rotT);
  }

  private updateEnergyCritical(elapsedSeconds: number): void {
    if (!this.energyCriticalArmed) return;

    this.energyCriticalTimer -= elapsedSeconds;
    if (this.energyCriticalTimer <= 0) {
      this.energyCriticalTimer = ENERGY_CRITICAL_INTERVAL;
      this.playEnergyCriticalPulse();
    }
  }

  private localToWorld(lx: number, ly: number): Vector2 {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.x + lx * cos - ly * sin,
      y: this.y + lx * sin + ly * cos,
    };
  }

  private toLocalDirection(dir: Vector2): Vector2 {
    const length = Math.hypot(dir.x, dir.y) || 1;
    const nx = dir.x / length;
    const ny = dir.y / length;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    return {
      x: nx * cos - ny * sin,
      y: nx * sin + ny * cos,
    };
  }

  // ---- Boost (Dash) ----

  public playBoost(): void {
    engine().audio.sfx.play(ACTION_SFX);

    animate(
      this.image.scale,
      {x: [BASE_SCALE, BASE_SCALE * 0.8, BASE_SCALE], y: [BASE_SCALE, BASE_SCALE * 1.45, BASE_SCALE]},
      {duration: 0.3, ease: "easeOut"},
    );

    for (const engine of this.engines) {
      this.playEngineBoost(engine);
    }
  }

  private playEngineBoost(engine: EngineDef): void {
    const width = this.baseWidth;
    const localX = (engine.xFrac - 0.5) * width;
    const localY = (engine.yFrac - 0.5) * this.baseHeight;
    const sizeScale = engine.scale;

    const glow = new Graphics().circle(0, 0, width * 0.4 * sizeScale).fill({color: 0xfff4c2});
    glow.alpha = 0.9;
    glow.position.set(localX, localY);
    this.effectsBehind.addChild(glow);
    animate(glow.scale, {x: 2.4, y: 3}, {duration: 0.35, ease: "easeOut"});
    animate(glow, {alpha: 0}, {duration: 0.35, ease: "easeOut"}).finished.then(() => glow.destroy());

    const burstColors = [0xffe08a, 0xff8c3a];
    const particleCount = Math.max(3, Math.round(7 * sizeScale));
    for (let i = 0; i < particleCount; i++) {
      const particle = new Graphics().circle(0, 0, (3 + Math.random() * 2) * sizeScale).fill({color: burstColors[i % 2]});
      const startX = localX + (Math.random() - 0.5) * 24 * sizeScale;
      particle.position.set(startX, localY);
      this.effectsBehind.addChild(particle);

      const duration = 0.3 + Math.random() * 0.15;
      const targetX = startX + (Math.random() - 0.5) * 30 * sizeScale;
      const targetY = localY + (45 + Math.random() * 35) * sizeScale;

      animate(particle.position, {x: targetX, y: targetY}, {duration});
      animate(particle, {alpha: 0}, {duration}).finished.then(() => particle.destroy());
    }
  }

  // ---- Dash-Ready ----

  public playDashReady(): void {
    engine().audio.sfx.play(ACTION_SFX);

    const width = this.baseWidth;
    const ring = new Graphics().circle(0, 0, width * 0.55).stroke({width: 3, color: 0x38bdf8});
    ring.alpha = 0.9;
    ring.scale.set(0.7);
    this.effectsAbove.addChild(ring);

    animate(ring.scale, {x: 1.4, y: 1.4}, {duration: 0.4, ease: "easeOut"});
    animate(ring, {alpha: 0}, {duration: 0.4, ease: "easeOut"}).finished.then(() => ring.destroy());
  }

  // ---- Bump: Player / Asteroid ----
  // Implemented, not wired this phase — no bump signal exists client-side yet.

  private playBumpEffect(dir: Vector2, opts: BumpOptions): void {
    engine().audio.sfx.play(ACTION_SFX);

    const width = this.baseWidth;
    const local = this.toLocalDirection(dir);
    const angle = Math.atan2(local.y, local.x);

    const flash = new Graphics().circle(0, 0, width * 0.7).fill({color: opts.flashColor});
    flash.alpha = 0.9;
    this.effectsAbove.addChild(flash);
    animate(flash, {alpha: 0}, {duration: 0.35}).finished.then(() => flash.destroy());

    const ring = new Graphics().circle(0, 0, width * 0.4).stroke({width: 4, color: 0xffffff});
    ring.alpha = 0.95;
    this.effectsAbove.addChild(ring);
    animate(ring.scale, {x: 2.2, y: 2.2}, {duration: 0.35});
    animate(ring, {alpha: 0}, {duration: 0.35}).finished.then(() => ring.destroy());

    const prevImageRotation = this.image.rotation;
    this.image.rotation = angle;
    const squashScale = 1 - opts.squashReduction;
    animate(
      this.image.scale,
      {x: [BASE_SCALE, BASE_SCALE * squashScale, BASE_SCALE * 1.12, BASE_SCALE]},
      {duration: 0.35},
    ).finished.then(() => {
      this.image.rotation = prevImageRotation;
    });

    const nudgeX = -local.x * opts.nudgeStrength;
    const nudgeY = -local.y * opts.nudgeStrength;
    animate(this.image.position, {x: [0, nudgeX, 0], y: [0, nudgeY, 0]}, {duration: 0.3});

    if (opts.fragments) {
      for (let i = 0; i < 5; i++) {
        const fragAngle = angle + (Math.random() - 0.5) * 1.4;
        const dist = 20 + Math.random() * 20;
        const fragment = new Graphics().rect(-2, -2, 4, 4).fill({color: opts.fragmentColor ?? 0x9c8a76});
        this.effectsAbove.addChild(fragment);

        animate(fragment.position, {x: Math.cos(fragAngle) * dist, y: Math.sin(fragAngle) * dist}, {duration: 0.45});
        animate(fragment, {rotation: (Math.random() - 0.5) * Math.PI * 4}, {duration: 0.45});
        animate(fragment, {alpha: 0}, {duration: 0.45}).finished.then(() => fragment.destroy());
      }
    }
  }

  public playBumpPlayer(dir: Vector2): void {
    this.playBumpEffect(dir, {flashColor: 0xff7a1a, squashReduction: 0.4, nudgeStrength: 10});
  }

  public playBumpAsteroid(dir: Vector2): void {
    this.playBumpEffect(dir, {
      flashColor: 0x8a7a6a,
      squashReduction: 0.5,
      nudgeStrength: 14,
      fragments: true,
      fragmentColor: 0x9c8a76,
    });
  }

  // ---- Energy-Reset ----
  // Implemented, not wired this phase — no real trigger event exists yet.

  public playEnergyReset(): void {
    engine().audio.sfx.play(ACTION_SFX);

    const width = this.baseWidth;
    const flash = new Graphics().circle(0, 0, width * 0.6).fill({color: 0xef4444});
    flash.alpha = 0.85;
    this.effectsAbove.addChild(flash);
    animate(flash, {alpha: 0}, {duration: 0.35}).finished.then(() => flash.destroy());

    animate(
      this.image.scale,
      {
        x: [BASE_SCALE, BASE_SCALE * 0.55, BASE_SCALE * 1.1, BASE_SCALE],
        y: [BASE_SCALE, BASE_SCALE * 0.55, BASE_SCALE * 1.1, BASE_SCALE],
      },
      {duration: 0.35, ease: "easeIn"},
    );
  }

  // ---- Energy-critical (warning pulse) ----

  private playEnergyCriticalPulse(): void {
    engine().audio.sfx.play(ACTION_SFX);

    const width = this.baseWidth;
    const flash = new Graphics().circle(0, 0, width * 0.6).fill({color: 0xff2d55});
    flash.alpha = 0.55;
    this.effectsAbove.addChild(flash);
    animate(flash, {alpha: 0}, {duration: 0.25}).finished.then(() => flash.destroy());

    animate(
      this.image.scale,
      {x: [BASE_SCALE, BASE_SCALE * 0.94, BASE_SCALE], y: [BASE_SCALE, BASE_SCALE * 0.94, BASE_SCALE]},
      {duration: 0.2},
    );
  }

  // ---- Falling into Sun ----
  // Implemented, not wired this phase — needs a decoded DEATH reason.

  public async playFallingIntoSun(): Promise<void> {
    engine().audio.sfx.play(ACTION_SFX);

    const currentRotation = this.image.rotation;

    await Promise.all([
      animate(
        this.image.scale,
        {x: BASE_SCALE * 0.6, y: BASE_SCALE * 0.6},
        {duration: 0.6, ease: "easeIn"},
      ).finished,
      animate(this.image, {rotation: currentRotation + Math.PI * 2}, {duration: 0.6}).finished,
      // The sun always sits at the world origin (see GameMap/backend gravity center) — pull the ship into it.
      animate(this.position, {x: 0, y: 0}, {duration: 0.6, ease: "easeIn"}).finished,
    ]);

    this.image.rotation = 0;
  }

  // ---- Dying/Explosion ----
  // Implemented, not wired this phase — needs a decoded DEATH message.

  public async playDyingExplosion(): Promise<void> {
    engine().audio.sfx.play(ACTION_SFX);

    const width = this.baseWidth;

    const flash = new Graphics().circle(0, 0, width * 0.6).fill({color: 0xff4444});
    flash.alpha = 0.9;
    this.effectsAbove.addChild(flash);
    const flashAnim = animate(flash, {alpha: 0}, {duration: 0.5});
    flashAnim.finished.then(() => flash.destroy());

    const fadeAnim = animate(this.image, {alpha: 0}, {duration: 0.3});

    const particleAnims: Promise<unknown>[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const particle = new Graphics().circle(0, 0, 5).fill({color: 0xfb923c});
      this.effectsAbove.addChild(particle);

      animate(particle.position, {x: Math.cos(angle) * 60, y: Math.sin(angle) * 60}, {duration: 0.7});
      const p = animate(particle, {alpha: 0}, {duration: 0.7}).finished.then(() => particle.destroy());
      particleAnims.push(p);
    }

    await Promise.all([fadeAnim.finished, flashAnim.finished, ...particleAnims]);
  }

  // ---- Respawn ----
  // Implemented, not wired this phase — needs a decoded MATCH_RESET message.

  public async playRespawn(): Promise<void> {
    engine().audio.sfx.play(ACTION_SFX);

    const width = this.baseWidth;

    this.image.alpha = 0;
    this.image.scale.set(BASE_SCALE * 0.4);

    const flash = new Graphics().circle(0, 0, width * 0.6).fill({color: 0x38bdf8});
    flash.alpha = 0.7;
    this.effectsAbove.addChild(flash);
    const flashAnim = animate(flash, {alpha: 0}, {duration: 0.4});
    flashAnim.finished.then(() => flash.destroy());

    const fadeIn = animate(this.image, {alpha: 1}, {duration: 0.3});
    const scaleIn = animate(
      this.image.scale,
      {
        x: [BASE_SCALE * 0.4, BASE_SCALE * 1.15, BASE_SCALE],
        y: [BASE_SCALE * 0.4, BASE_SCALE * 1.15, BASE_SCALE],
      },
      {duration: 0.45, ease: "easeOut"},
    );

    await Promise.all([fadeIn.finished, scaleIn.finished, flashAnim.finished]);
  }

  // ---- Engine trail ----

  private updateTrail(): void {
    for (let i = 0; i < this.engines.length; i++) {
      const engine = this.engines[i];
      const localX = (engine.xFrac - 0.5) * this.baseWidth;
      const localY = (engine.yFrac - 0.5) * this.baseHeight;
      this.pushTrailPoint(this.trailPoints[i], this.localToWorld(localX, localY));
    }

    this.drawTrail();
  }

  private pushTrailPoint(history: Vector2[], point: Vector2): void {
    history.push(point);
    if (history.length > TRAIL_HISTORY) {
      history.shift();
    }
  }

  private drawTrail(): void {
    this.trailGraphics.clear();
    for (let i = 0; i < this.trailPoints.length; i++) {
      this.drawTrailSide(this.trailPoints[i], this.engines[i]?.scale ?? 1);
    }
  }

  private drawTrailSide(points: Vector2[], engineScale: number): void {
    const count = points.length;
    if (count < 2) return;

    const width = this.baseWidth;

    for (let i = 1; i < count; i++) {
      const t = i / (count - 1);
      const prev = points[i - 1];
      const cur = points[i];
      const waveMod = 0.85 + 0.15 * Math.sin(t * 6 * Math.PI);

      const baseWidth = width * (0.08 + 0.2 * t) * engineScale;
      const baseColor = lerpColor(0xff8c3a, 0xc21e6e, t);
      const baseAlpha = (0.15 + t * 0.35) * waveMod;

      this.trailGraphics
        .moveTo(prev.x, prev.y)
        .lineTo(cur.x, cur.y)
        .stroke({width: baseWidth, color: baseColor, alpha: baseAlpha, cap: "round"});

      const coreColor = lerpColor(baseColor, 0xfff4c2, 0.55);
      const coreAlpha = (0.2 + t * 0.6) * waveMod;

      this.trailGraphics
        .moveTo(prev.x, prev.y)
        .lineTo(cur.x, cur.y)
        .stroke({width: baseWidth * 0.4, color: coreColor, alpha: coreAlpha, cap: "round"});
    }
  }

  /** Reset ship visuals, effect state and trail history */
  public reset(): void {
    this.position.set(0, 0);
    this.rotation = 0;
    this.setStage(1);

    this.image.rotation = 0;
    this.image.alpha = 1;
    this.image.scale.set(BASE_SCALE);
    this.image.position.set(0, 0);

    this.prevDashAvailable = false;
    this.energyCriticalArmed = false;
    this.energyCriticalTimer = 0;

    this.hasServerState = false;
    this.targetX = 0;
    this.targetY = 0;
    this.targetRotation = 0;

    this.trailPoints = this.engines.map(() => []);
    this.trailGraphics.clear();

    this.effectsBehind.removeChildren().forEach((child) => child.destroy());
    this.effectsAbove.removeChildren().forEach((child) => child.destroy());
  }

  public override destroy(options?: DestroyOptions): void {
    this.trailGraphics.parent?.removeChild(this.trailGraphics);
    this.trailGraphics.destroy();
    super.destroy(options);
  }
}
