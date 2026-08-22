import {Circle, Container, type FederatedPointerEvent, Graphics} from "pixi.js";

export interface VirtualJoystickOptions {
  radius?: number;
  knobRadius?: number;
}

export class VirtualJoystick extends Container {
  private baseGraphics: Graphics;
  private knobGraphics: Graphics;
  private radius: number;
  private knobRadius: number;
  private activePointerId: number | null = null;

  public onMove?: (dx: number, dy: number, angle: number) => void;
  public onEnd?: () => void;

  constructor(options: VirtualJoystickOptions = {}) {
    super();

    this.radius = options.radius ?? 80;
    this.knobRadius = options.knobRadius ?? 35;

    this.eventMode = "static";
    this.hitArea = new Circle(0, 0, this.radius + 15);

    this.baseGraphics = new Graphics();
    this.knobGraphics = new Graphics();

    this.drawBase();
    this.drawKnob();

    this.addChild(this.baseGraphics);
    this.addChild(this.knobGraphics);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("globalpointermove", this.handlePointerMove, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);
    this.on("pointercancel", this.handlePointerUp, this);
  }

  private drawBase(): void {
    this.baseGraphics.clear();
    // Outer glow / border
    this.baseGraphics
      .circle(0, 0, this.radius)
      .fill({ color: 0x090d16, alpha: 0.6 })
      .stroke({ width: 2, color: 0x38bdf8, alpha: 0.4 });

    // Inner subtle guide ring
    this.baseGraphics
      .circle(0, 0, this.radius * 0.5)
      .stroke({ width: 1, color: 0x1e293b, alpha: 0.5 });
  }

  private drawKnob(): void {
    this.knobGraphics.clear();
    // Thumb knob
    this.knobGraphics
      .circle(0, 0, this.knobRadius)
      .fill({ color: 0x38bdf8, alpha: 0.75 })
      .stroke({ width: 2, color: 0xe0f2fe, alpha: 0.9 });
  }

  private handlePointerDown(event: FederatedPointerEvent): void {
    event.stopPropagation();
    this.activePointerId = event.pointerId;
    this.updatePosition(event.global);
  }

  private handlePointerMove(event: FederatedPointerEvent): void {
    if (this.activePointerId === null || this.activePointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    this.updatePosition(event.global);
  }

  private handlePointerUp(event: FederatedPointerEvent): void {
    if (this.activePointerId === null || this.activePointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    this.reset();
    this.onEnd?.();
  }

  private updatePosition(globalPos: { x: number; y: number }): void {
    const local = this.toLocal(globalPos);
    const dist = Math.hypot(local.x, local.y);
    const angle = Math.atan2(local.y, local.x);
    const clampedDist = Math.min(dist, this.radius);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    this.knobGraphics.position.set(knobX, knobY);

    if (this.radius > 0) {
      const normalizedX = knobX / this.radius;
      const normalizedY = knobY / this.radius;
      this.onMove?.(normalizedX, normalizedY, angle);
    }
  }

  public reset(): void {
    this.activePointerId = null;
    this.knobGraphics.position.set(0, 0);
  }
}
