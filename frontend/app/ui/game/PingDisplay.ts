import {Container} from "pixi.js";
import {Label} from "../menu/Label";

const GOOD_THRESHOLD_MS = 80;
const OK_THRESHOLD_MS = 150;

const GOOD_COLOR = 0x4ade80;
const OK_COLOR = 0xfacc15;
const BAD_COLOR = 0xff4444;

/** Small top-right HUD readout of the current round-trip ping to the server. */
export class PingDisplay extends Container {
  private pingLabel: Label;

  constructor() {
    super();

    this.pingLabel = new Label({
      text: "-- ms",
      style: {fontSize: 16, fill: 0xffffff},
    });
    this.pingLabel.anchor.set(1, 0.5);
    this.addChild(this.pingLabel);
  }

  /** Update the displayed ping (in milliseconds), colored by how good it is. */
  public setPing(ms: number): void {
    this.pingLabel.text = `${Math.max(0, Math.round(ms))} ms`;
    this.pingLabel.style.fill =
      ms <= GOOD_THRESHOLD_MS ? GOOD_COLOR : ms <= OK_THRESHOLD_MS ? OK_COLOR : BAD_COLOR;
  }

  /** Reset to the initial unknown state. */
  public reset(): void {
    this.pingLabel.text = "-- ms";
    this.pingLabel.style.fill = 0xffffff;
  }
}
