import {Container, NineSliceSprite, Point, Texture, type Ticker} from "pixi.js";

export class Rocket extends Container {
  private image: NineSliceSprite;
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
  }

  /** Get the base width, without counting the shadow */
  public get boxWidth() {
    return this.image.width;
  }

  /** Get the base height, without counting the shadow */
  public get boxHeight() {
    return this.image.height;
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

  /** Reset the rocket position, rotation, and target */
  public reset() {
    this.position.set(0, 0);
    this.targetPosition.set(0, 0);
    this.rotation = 0;
  }
}
