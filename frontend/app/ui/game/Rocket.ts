import {Container, NineSliceSprite, Texture} from "pixi.js";

export class Rocket extends Container {
  private image: NineSliceSprite;

  constructor() {
    super();
    this.image = new NineSliceSprite({
      texture: Texture.from("spaceship_stage_1.svg"),
      alpha: 1
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
}
