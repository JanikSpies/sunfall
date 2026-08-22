import type {TextStyleOptions} from "pixi.js";
import {Container} from "pixi.js";
import {Label} from "../menu/Label";

export interface TimerOptions {
  /** Initial text or formatted time string */
  text?: string;
  /** Custom text styling options */
  style?: Partial<TextStyleOptions>;
}

const defaultTimerStyle: Partial<TextStyleOptions> = {
  fontSize: 28,
  fill: 0xffffff,
  align: "center",
};

/**
 * Visual Timer component at the top of the screen.
 * Displays formatted time / text and provides methods to update it.
 */
export class Timer extends Container {
  private timeLabel: Label;
  private _text: string;

  constructor(options: TimerOptions = {}) {
    super();

    this._text = options.text ?? "00:00";

    this.timeLabel = new Label({
      text: this._text,
      style: {
        ...defaultTimerStyle,
        ...options.style,
      },
    });

    this.addChild(this.timeLabel);
  }

  /**
   * Helper method to format total seconds into MM:SS string
   */
  public static formatTime(totalSeconds: number): string {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Get the current timer text
   */
  public get text(): string {
    return this._text;
  }

  /**
   * Set the timer text
   */
  public set text(value: string) {
    this.setText(value);
  }

  /**
   * Get the current text (method form)
   */
  public getText(): string {
    return this._text;
  }

  /**
   * Update the timer text with a new string
   */
  public setText(text: string): void {
    this._text = text;
    this.timeLabel.text = text;
  }

  /**
   * Update the timer text (alias for setText)
   */
  public updateText(text: string): void {
    this.setText(text);
  }

  /**
   * Update the timer with numeric time.
   * Can pass total seconds, or (minutes, seconds).
   */
  public setTime(seconds: number): void;
  public setTime(minutes: number, seconds: number): void;
  public setTime(minutesOrSeconds: number, maybeSeconds?: number): void {
    let totalSeconds: number;
    if (maybeSeconds !== undefined) {
      totalSeconds = minutesOrSeconds * 60 + maybeSeconds;
    } else {
      totalSeconds = minutesOrSeconds;
    }
    this.setText(Timer.formatTime(totalSeconds));
  }

  /**
   * Reset timer to default static value ("00:00" or provided initial text)
   */
  public reset(defaultText = "00:00"): void {
    this.setText(defaultText);
  }
}
