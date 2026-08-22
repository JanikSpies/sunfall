import {type ColorSource, Container, Graphics} from "pixi.js";

export interface EnergyBarOptions {
  width?: number;
  height?: number;
  radius?: number;
  backgroundColor?: ColorSource;
  backgroundAlpha?: number;
  fillColor?: ColorSource;
  fillAlpha?: number;
  borderColor?: ColorSource;
  borderAlpha?: number;
  borderWidth?: number;
  value?: number;
  maxValue?: number;
}

/**
 * Visual energy / health bar component rendered with PixiJS Graphics.
 */
export class EnergyBar extends Container {
  private bgGraphics: Graphics;
  private fillGraphics: Graphics;

  private barWidth: number;
  private barHeight: number;
  private radius: number;
  private backgroundColor: ColorSource;
  private backgroundAlpha: number;
  private fillColor: ColorSource;
  private fillAlpha: number;
  private borderColor: ColorSource;
  private borderAlpha: number;
  private borderWidth: number;

  private _value: number;
  private _maxValue: number;
  private _progress: number;

  constructor(options: EnergyBarOptions = {}) {
    super();

    this.barWidth = options.width ?? 80;
    this.barHeight = options.height ?? 8;
    this.radius = options.radius ?? 4;
    this.backgroundColor = options.backgroundColor ?? 0x0f172a;
    this.backgroundAlpha = options.backgroundAlpha ?? 0.85;
    this.fillColor = options.fillColor ?? 0x38bdf8;
    this.fillAlpha = options.fillAlpha ?? 1.0;
    this.borderColor = options.borderColor ?? 0x1e293b;
    this.borderAlpha = options.borderAlpha ?? 0.9;
    this.borderWidth = options.borderWidth ?? 1.5;

    this._maxValue = options.maxValue ?? 100;
    this._value = options.value ?? this._maxValue;
    this._progress = this._maxValue > 0 ? Math.min(Math.max(this._value / this._maxValue, 0), 1) : 1;

    this.bgGraphics = new Graphics();
    this.fillGraphics = new Graphics();

    this.addChild(this.bgGraphics);
    this.addChild(this.fillGraphics);

    this.drawBackground();
    this.drawFill();
  }

  public get progress(): number {
    return this._progress;
  }

  public get value(): number {
    return this._value;
  }

  public get maxValue(): number {
    return this._maxValue;
  }

  private drawBackground(): void {
    const halfW = this.barWidth / 2;
    const halfH = this.barHeight / 2;

    this.bgGraphics.clear();

    // Background track
    this.bgGraphics
      .roundRect(-halfW, -halfH, this.barWidth, this.barHeight, this.radius)
      .fill({ color: this.backgroundColor, alpha: this.backgroundAlpha });

    // Border
    if (this.borderWidth > 0) {
      this.bgGraphics
        .roundRect(-halfW, -halfH, this.barWidth, this.barHeight, this.radius)
        .stroke({
          width: this.borderWidth,
          color: this.borderColor,
          alpha: this.borderAlpha,
        });
    }
  }

  private drawFill(): void {
    this.fillGraphics.clear();

    if (this._progress <= 0) {
      return;
    }

    const pad = this.borderWidth;
    const innerWidth = Math.max(0, this.barWidth - pad * 2);
    const innerHeight = Math.max(0, this.barHeight - pad * 2);
    const fillW = innerWidth * this._progress;

    if (fillW <= 0 || innerHeight <= 0) {
      return;
    }

    const startX = -this.barWidth / 2 + pad;
    const startY = -this.barHeight / 2 + pad;
    const innerRadius = Math.max(0, this.radius - pad * 0.5);
    const effectiveRadius = Math.min(innerRadius, fillW / 2, innerHeight / 2);

    this.fillGraphics
      .roundRect(startX, startY, fillW, innerHeight, effectiveRadius)
      .fill({ color: this.fillColor, alpha: this.fillAlpha });
  }

  /**
   * Set progress from 0.0 to 1.0
   */
  public setProgress(progress: number): void {
    const clamped = Math.min(Math.max(progress, 0), 1);
    if (this._progress === clamped) return;

    this._progress = clamped;
    this._value = clamped * this._maxValue;
    this.drawFill();
  }

  /**
   * Set numeric energy value and optional maximum
   */
  public setValue(current: number, max = this._maxValue): void {
    this._maxValue = Math.max(max, 0);
    this._value = Math.min(Math.max(current, 0), this._maxValue);
    this._progress = this._maxValue > 0 ? this._value / this._maxValue : 0;
    this.drawFill();
  }

  /**
   * Reset energy bar to full default value
   */
  public reset(): void {
    this.setValue(this._maxValue, this._maxValue);
  }
}
