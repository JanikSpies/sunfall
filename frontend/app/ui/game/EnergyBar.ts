import {type ColorSource, Container, Graphics, Sprite, Texture} from "pixi.js";

/**
 * Minimum energy threshold for each energy / size level.
 * Level 1: 0
 * Level 2: 200
 * Level 3: 350
 * Level 4: 600
 * Level 5: 1000
 */
export const ENERGY_LEVEL_MIN: Record<number, number> = {
  1: 0,
  2: 200,
  3: 350,
  4: 600,
  5: 1000,
};

/**
 * Maximum energy threshold for each energy / size level.
 * Level 1: < 200 (max: 200)
 * Level 2: >= 200 (max: 350)
 * Level 3: >= 350 (max: 600)
 * Level 4: >= 600 (max: 1000)
 * Level 5: >= 1000 (max: 1000)
 */
export const ENERGY_LEVEL_MAX: Record<number, number> = {
  1: 200,
  2: 350,
  3: 600,
  4: 1000,
  5: 1000,
};

/**
 * Get minimum energy threshold for a given energy level.
 */
export function getMinEnergyForLevel(level: number): number {
  return ENERGY_LEVEL_MIN[level] ?? 0;
}

/**
 * Get maximum energy threshold for a given energy level.
 */
export function getMaxEnergyForLevel(level: number): number {
  return ENERGY_LEVEL_MAX[level] ?? ENERGY_LEVEL_MAX[1];
}

/**
 * Get the energy capacity (range) needed to complete a given energy level.
 */
export function getEnergyCapacityForLevel(level: number): number {
  const min = getMinEnergyForLevel(level);
  const max = getMaxEnergyForLevel(level);
  return Math.max(0, max - min);
}

/**
 * Calculate the energy level (1-5) for a given energy amount.
 */
export function sizeLevelForEnergy(energy: number): number {
  if (energy >= 1000) return 5;
  if (energy >= 600) return 4;
  if (energy >= 350) return 3;
  if (energy >= 200) return 2;
  return 1;
}

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
  level?: number;
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

    this.fillColor = options.fillColor ?? 0x00ff00;
    this.fillAlpha = options.fillAlpha ?? 1.0;
    this.backgroundColor = options.backgroundColor ?? 0x000000;
    this.backgroundAlpha = options.backgroundAlpha ?? 0.5;
    this.borderColor = options.borderColor ?? 0x00ff00;
    this.borderAlpha = options.borderAlpha ?? 0;
    this.borderWidth = options.borderWidth ?? 0;

    const level = options.level;
    const defaultMax = level
      ? getEnergyCapacityForLevel(level)
      : (options.maxValue ?? getEnergyCapacityForLevel(1));
    this._maxValue = options.maxValue ?? defaultMax;
    this._value = options.value ?? 0;
    this._progress =
      this._maxValue > 0
        ? Math.min(Math.max(this._value / this._maxValue, 0), 1)
        : 0;

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
   * Set energy value and update max according to energy level.
   * Energy progress is relative to the current level range:
   * e.g., for Level 2 (200-350 energy), 200 energy gives a relative value of 0 (0% progress).
   */
  public setValueForLevel(current: number, level?: number): void {
    const currentLevel = level ?? sizeLevelForEnergy(current);
    const min = getMinEnergyForLevel(currentLevel);
    const max = getMaxEnergyForLevel(currentLevel);
    const capacity = Math.max(0, max - min);

    if (capacity <= 0) {
      // Max level (Level 5)
      this._maxValue = 0;
      this._value = Math.max(0, current - min);
      this._progress = 1;
    } else {
      const levelValue = Math.min(Math.max(current - min, 0), capacity);
      this._maxValue = capacity;
      this._value = levelValue;
      this._progress = levelValue / capacity;
    }
    this.drawFill();
  }

  /**
   * Reset energy bar to initial level 1 state with 0 energy
   */
  public reset(): void {
    this.setValueForLevel(0, 1);
  }
}
