import {Container, Sprite, Texture} from "pixi.js";
import type {PlayerState} from "../../lib/models/PlayerState";
import {Label} from "../menu/Label";

const scale = 0.5;

export class EnemyRocket extends Container {
  private image: Sprite;
  private stage = 1;
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

  /** Apply authoritative server PlayerState to update position, rotation, and visual stage */
  public applyPlayerState(state: PlayerState): void {
    this.x = state.x;
    this.y = state.y;
    this.rotation = state.rotation + Math.PI / 2;
    this.nameLabel.text = state.name || "Player";
    this.nameLabel.rotation = -this.rotation;
    this.setStage(state.size);
  }

  /** Set upgrade stage of the spaceship (1-4) */
  public setStage(stage: number): void {
    this.stage = Math.max(1, Math.min(4, Math.floor(stage)));
    this.image.texture = Texture.from(`spaceship_stage_${this.stage}.svg`);
  }

  /** Get current stage */
  public getStage(): number {
    return this.stage;
  }

  /** Reset the rocket position, rotation, and stage */
  public reset(): void {
    this.position.set(0, 0);
    this.rotation = 0;
    this.nameLabel.rotation = 0;
    this.setStage(1);
  }
}
