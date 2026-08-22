import {Circle, Container, type FederatedPointerEvent, Graphics} from "pixi.js";
import {Label} from "../menu/Label";

export interface DashButtonOptions {
  radius?: number;
}

export class DashButton extends Container {
  private buttonGraphics: Graphics;
  private buttonLabel: Label;
  private radius: number;
  private activePointerId: number | null = null;

  public onDash?: () => void;

  constructor(options: DashButtonOptions = {}) {
    super();

    this.radius = options.radius ?? 55;

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = new Circle(0, 0, this.radius + 10);

    this.buttonGraphics = new Graphics();
    this.drawButton(false);
    this.addChild(this.buttonGraphics);

    this.buttonLabel = new Label({
      text: "DASH",
      style: {
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
        letterSpacing: 1,
      },
    });
    this.addChild(this.buttonLabel);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);
    this.on("pointercancel", this.handlePointerUp, this);
  }

  private drawButton(pressed: boolean): void {
    this.buttonGraphics.clear();
    const bgAlpha = pressed ? 0.9 : 0.65;
    const bgColor = pressed ? 0x0284c7 : 0x090d16;
    const strokeColor = pressed ? 0xbae6fd : 0x38bdf8;
    const strokeWidth = pressed ? 3 : 2;

    this.buttonGraphics
      .circle(0, 0, this.radius)
      .fill({ color: bgColor, alpha: bgAlpha })
      .stroke({ width: strokeWidth, color: strokeColor, alpha: 0.85 });

    // Inner subtle ring
    this.buttonGraphics
      .circle(0, 0, this.radius * 0.75)
      .stroke({ width: 1, color: strokeColor, alpha: pressed ? 0.6 : 0.3 });
  }

  private handlePointerDown(event: FederatedPointerEvent): void {
    event.stopPropagation();
    this.activePointerId = event.pointerId;
    this.scale.set(0.92);
    this.drawButton(true);

    // Discrete single dash impulse per press
    this.onDash?.();
  }

  private handlePointerUp(event: FederatedPointerEvent): void {
    if (this.activePointerId !== null && this.activePointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    this.reset();
  }

  public reset(): void {
    this.activePointerId = null;
    this.scale.set(1.0);
    this.drawButton(false);
  }
}
