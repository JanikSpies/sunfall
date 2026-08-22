import {Point, Sprite, Texture, type Ticker} from "pixi.js";
import type {PlayerState} from "../../lib/models/PlayerState";
import {BaseRocket} from "./BaseRocket";

const scale = 0.5;

export class Rocket extends BaseRocket {
  public arrow: Sprite;
  public targetPosition: Point = new Point(0, 0);
  public dashAvailable: boolean = false;

  constructor() {
    super();
    this.arrow = new Sprite({
      texture: Texture.from("sun-pointer-ship-1.svg"),
      anchor: 0.5,
      visible: false,
      scale: scale,
    });
    this.addChild(this.arrow);
  }

  /** Apply authoritative server PlayerState to update position, rotation, visual stage, and dash readiness */
  public applyPlayerState(state: PlayerState): void {
    super.applyBaseState(state);
    this.arrow.texture = Texture.from(`sun-pointer-ship-${this.getStage()}.svg`);
    this.x = state.x;
    this.y = state.y;
    this.rotation = state.rotation + Math.PI / 2;
    this.setStage(state.size);
    this.dashAvailable = state.dashAvailable;
  }

  /** Check if dash is currently available */
  public canDash(): boolean {
    return this.dashAvailable;
  }

  /** Update pointer arrow visibility and direction towards the sun */
  public setSunPointer(visible: boolean, angleToSun?: number) {
    this.arrow.visible = visible;
    if (visible && angleToSun !== undefined) {
      this.arrow.rotation = angleToSun + Math.PI / 2 - this.rotation;
    }
  }

  /** Set target aim coordinates relative to the rocket center */
  public setTarget(x: number, y: number) {
    this.targetPosition.set(x, y);
  }

  /** Perform dash if available and optimistically lock dash readiness until server update */
  public dash(): boolean {
    if (!this.canDash()) {
      return false;
    }
    this.dashAvailable = false;
    return true;
  }

  /** Update rocket ticker callback (client-side positional physics disabled) */
  public update(time: Ticker) {
    super.update(time);
  }

  /** Reset the rocket position, rotation, target, and pointer */
  public override reset() {
    super.reset();
    this.targetPosition.set(0, 0);
    this.rotation = 0;
    this.setSunPointer(false);
    this.dashAvailable = false;
    this.arrow.rotation = 0;
  }
}