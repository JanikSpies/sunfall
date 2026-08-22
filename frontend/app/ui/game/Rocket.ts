import {Container, Point, Sprite, Texture, type Ticker} from "pixi.js";
import type {PlayerState} from "../../lib/models/PlayerState";
import {Label} from "../menu/Label";

const scale = 0.5;

export class Rocket extends Container {
  private image: Sprite;
  public arrow: Sprite;
  public targetPosition: Point = new Point(0, 0);
  private stage = 1;
  public dashAvailable: boolean = false;
  private nameLabel: Label;

  constructor() {
    super();
    this.image = new Sprite({
      texture: Texture.from("spaceship_stage_1.svg"),
      anchor: 0.5,
      alpha: 1,
      scale: scale,
    });
    this.addChild(this.image);

    this.arrow = new Sprite({
      texture: Texture.from("sun-pointer-ship-1.svg"),
      anchor: 0.5,
      visible: false,
      scale: scale,
    });
    this.addChild(this.arrow);

    this.nameLabel = new Label({
      text: "",
      style: {
        fontSize: 14,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
        fontWeight: "bold",
        fontFamily: "Science Gothic",
      },
    });
    this.nameLabel.position.set(0, -36);
    this.addChild(this.nameLabel);
  }

  /** Apply authoritative server PlayerState to update position, rotation, visual stage, and dash readiness */
  public applyPlayerState(state: PlayerState): void {
    this.x = state.x;
    this.y = state.y;
    this.rotation = state.rotation + Math.PI / 2;
    this.nameLabel.text = state.name || "Player";
    this.nameLabel.rotation = -this.rotation;
    this.setStage(state.size);
    this.dashAvailable = state.dashAvailable;
  }

  /** Check if dash is currently available */
  public canDash(): boolean {
    return this.dashAvailable;
  }

  /** Set upgrade stage of the spaceship (1-4) */
  public setStage(stage: number) {
    this.stage = Math.max(1, Math.min(4, Math.floor(stage)));
    this.image.texture = Texture.from(`spaceship_stage_${this.stage}.svg`);
    this.arrow.texture = Texture.from(`sun-pointer-ship-${this.stage}.svg`);
  }

  /** Get current stage */
  public getStage(): number {
    return this.stage;
  }

  /** Update pointer arrow visibility and direction towards the sun */
  public setSunPointer(visible: boolean, angleToSun?: number) {
    this.arrow.visible = visible;
    if (visible && angleToSun !== undefined) {
      this.arrow.rotation = angleToSun + Math.PI / 2 - this.rotation;
    }
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
  public update(_time?: Ticker) {
    void _time;
  }

  /** Reset the rocket position, rotation, target, and pointer */
  public reset() {
    this.position.set(0, 0);
    this.targetPosition.set(0, 0);
    this.rotation = 0;
    this.nameLabel.rotation = 0;
    this.setSunPointer(false);
    this.dashAvailable = false;
    this.setStage(1);
    this.arrow.rotation = 0;
  }
}
