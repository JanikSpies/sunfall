import {type ColorSource, Container, Graphics, Sprite, Texture} from "pixi.js";

export interface EnergyBarOptions {
  scale?: number;
  fillColor?: ColorSource;
  fillAlpha?: number;
  backgroundColor?: ColorSource;
  backgroundAlpha?: number;
  borderColor?: ColorSource;
  borderAlpha?: number;
  borderWidth?: number;
  value?: number;
  maxValue?: number;
}

/**
 * Multi-layer HUD Energy Bar component.
 * Layers from bottom to top:
 * 1. energy-hud-backdrop (Sprite)
 * 2. energy fill graphics (Graphics)
 * 3. energybar track/frame graphics (Graphics)
 * 4. energy-hud overlay (Sprite)
 */
export class EnergyBar extends Container {
  public backdropSprite: Sprite;
  public fillGraphics: Graphics;
  public barGraphics: Graphics;
  public hudSprite: Sprite;

  private fillColor: ColorSource;
  private fillAlpha: number;
  private backgroundColor: ColorSource;
  private backgroundAlpha: number;
  private borderColor: ColorSource;
  private borderAlpha: number;
  private borderWidth: number;

  private _value: number;
  private _maxValue: number;
  private _progress: number;

  // Slot coordinate space for 300x100 SVG anchored at (0.5, 0.5)
  public static readonly SLOT_X = -98;
  public static readonly SLOT_Y = 4;
  public static readonly SLOT_WIDTH = 186;
  public static readonly SLOT_HEIGHT = 16;
  public static readonly SLOT_RADIUS = 8;

  constructor(options: EnergyBarOptions = {}) {
    super();

    if (options.scale !== undefined) {
      this.scale.set(options.scale);
    }

    this.fillColor = options.fillColor ?? 0x00fffc;
    this.fillAlpha = options.fillAlpha ?? 1.0;
    this.backgroundColor = options.backgroundColor ?? 0x000000;
    this.backgroundAlpha = options.backgroundAlpha ?? 0.5;
    this.borderColor = options.borderColor ?? 0x00fffc;
    this.borderAlpha = options.borderAlpha ?? 0;
    this.borderWidth = options.borderWidth ?? 0;

    this._maxValue = options.maxValue ?? 100;
    this._value = options.value ?? this._maxValue;
    this._progress =
      this._maxValue > 0
        ? Math.min(Math.max(this._value / this._maxValue, 0), 1)
        : 1;

    // Layer 4 (Bottom): energy-hud-backdrop.svg
    this.backdropSprite = new Sprite({
      texture: Texture.from("energy-hud-backdrop.svg"),
      anchor: 0.5,
    });

    // Layer 3 (Middle-lower): Energy fill graphics
    this.fillGraphics = new Graphics();

    // Layer 2 (Middle-upper): Energybar track graphics
    this.barGraphics = new Graphics();

    // Layer 1 (Top): energy-hud.svg
    this.hudSprite = new Sprite({
      texture: Texture.from("energy-hud.svg"),
      anchor: 0.5,
    });

    // Add children in bottom-to-top rendering order
    this.addChild(this.backdropSprite);
    this.addChild(this.fillGraphics);
    this.addChild(this.barGraphics);
    this.addChild(this.hudSprite);

    this.drawBar();
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

  private drawBar(): void {
    this.barGraphics.clear();

    if (this.backgroundAlpha > 0) {
      this.barGraphics
        .roundRect(
          EnergyBar.SLOT_X,
          EnergyBar.SLOT_Y,
          EnergyBar.SLOT_WIDTH,
          EnergyBar.SLOT_HEIGHT,
          EnergyBar.SLOT_RADIUS
        )
        .fill({ color: this.backgroundColor, alpha: this.backgroundAlpha });
    }

    if (this.borderWidth > 0 && this.borderAlpha > 0) {
      this.barGraphics
        .roundRect(
          EnergyBar.SLOT_X,
          EnergyBar.SLOT_Y,
          EnergyBar.SLOT_WIDTH,
          EnergyBar.SLOT_HEIGHT,
          EnergyBar.SLOT_RADIUS
        )
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

    const fillW = EnergyBar.SLOT_WIDTH * this._progress;
    const effectiveRadius = Math.min(
      EnergyBar.SLOT_RADIUS,
      fillW / 2,
      EnergyBar.SLOT_HEIGHT / 2
    );

    this.fillGraphics
      .roundRect(
        EnergyBar.SLOT_X,
        EnergyBar.SLOT_Y,
        fillW,
        EnergyBar.SLOT_HEIGHT,
        effectiveRadius
      )
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
