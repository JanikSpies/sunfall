import {Container, NineSliceSprite, Point, Texture, type Ticker} from "pixi.js";
import {lerp} from "@/engine/utils/maths";

export class Rocket extends Container {
  private image: NineSliceSprite;
  public targetPosition: Point = new Point(0, 0);
  public ease = 0.1;

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

  /** Set target coordinates for the rocket to follow */
  public setTarget(x: number, y: number) {
    this.targetPosition.set(x, y);
  }

  /** Update the rocket position and rotation towards the target */
  public update(time?: Ticker) {
    const delta = time?.deltaTime ?? 1;
    const factor = Math.min(1, this.ease * delta);

    const dx = this.targetPosition.x - this.x;
    const dy = this.targetPosition.y - this.y;
    if (dx * dx + dy * dy > 0.01) {
      this.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    }

    this.x = lerp(this.x, this.targetPosition.x, factor);
    this.y = lerp(this.y, this.targetPosition.y, factor);
  }

  /** Reset the rocket position, rotation, and target */
  public reset() {
    this.position.set(0, 0);
    this.targetPosition.set(0, 0);
    this.rotation = 0;
  }
}
