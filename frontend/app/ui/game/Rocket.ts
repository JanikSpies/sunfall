import {Container, NineSliceSprite, Point, Texture, type Ticker} from "pixi.js";
import {EnergyBar} from "./EnergyBar";

export class Rocket extends Container {
  private image: NineSliceSprite;
  public energyBar: EnergyBar;
  public targetPosition: Point = new Point(0, 0);
  public speed = 4;

  constructor() {
    super();
    this.image = new NineSliceSprite({
      texture: Texture.from("spaceship_stage_1.svg"),
      anchor: 0.5,
      alpha: 1,
    });
    this.addChild(this.image);

    this.energyBar = new EnergyBar({
      width: 80,
      height: 10,
      radius: 4,
    });
    this.energyBar.position.set(0, this.image.height * 0.5 + 16);
    this.addChild(this.energyBar);
  }

  /** Get the base width, without counting the shadow */
  public get boxWidth() {
    return this.image.width;
  }

  /** Get the base height, without counting the shadow */
  public get boxHeight() {
    return this.image.height;
  }

  /** Update rocket energy level */
  public setEnergy(current: number, max?: number) {
    this.energyBar.setValue(current, max);
  }

  /** Set target aim coordinates relative to the rocket center */
  public setTarget(x: number, y: number) {
    this.targetPosition.set(x, y);
    if (x !== 0 || y !== 0) {
      this.rotation = Math.atan2(y, x) + Math.PI / 2;
    }
  }

  /** Update the rocket position with constant forward velocity */
  public update(time?: Ticker) {
    const delta = time?.deltaTime ?? 1;
    const clampedDelta = Math.min(delta, 2);

    if (this.targetPosition.x !== 0 || this.targetPosition.y !== 0) {
      this.rotation = Math.atan2(this.targetPosition.y, this.targetPosition.x) + Math.PI / 2;
    }

    const vx = Math.sin(this.rotation) * this.speed * clampedDelta;
    const vy = -Math.cos(this.rotation) * this.speed * clampedDelta;

    this.x += vx;
    this.y += vy;
  }

  /** Reset the rocket position, rotation, target, and energy bar */
  public reset() {
    this.position.set(0, 0);
    this.targetPosition.set(0, 0);
    this.rotation = 0;
    this.energyBar.reset();
  }
}
