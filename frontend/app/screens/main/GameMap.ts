import {Container, Graphics, type Renderer, Texture, type Ticker, TilingSprite} from "pixi.js";
import {Sun} from "../../ui/game/Sun";
import {engine} from "../../getEngine";

export class GameMap extends Container {
  private static cachedGridTexture: Texture | null = null;
  private static cachedStarTexture: Texture | null = null;

  private background: Container;
  public sun: Sun;
  public mapWidth: number;
  public mapHeight: number;

  constructor(mapWidth = 10000, mapHeight = 10000) {
    super();
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    this.background = this.createBackground(mapWidth, mapHeight);
    this.addChild(this.background);

    this.sun = new Sun();
    this.sun.position.set(0, 0);
    this.addChild(this.sun);
  }

  private static getOrCreateTextures(renderer: Renderer) {
    if (!GameMap.cachedGridTexture) {
      const minorGridSize = 100;
      const majorGridSize = 500;
      const tile = new Graphics();

      // Base dark space background tile
      tile.rect(0, 0, majorGridSize, majorGridSize).fill({ color: 0x090d16 });

      // Minor grid lines
      for (let x = 0; x <= majorGridSize; x += minorGridSize) {
        const isMajor = x === 0 || x === majorGridSize;
        tile.moveTo(x, 0)
          .lineTo(x, majorGridSize)
          .stroke({
            width: isMajor ? 1.5 : 1,
            color: isMajor ? 0x334155 : 0x1e293b,
            alpha: isMajor ? 0.6 : 0.25,
          });
      }

      for (let y = 0; y <= majorGridSize; y += minorGridSize) {
        const isMajor = y === 0 || y === majorGridSize;
        tile.moveTo(0, y)
          .lineTo(majorGridSize, y)
          .stroke({
            width: isMajor ? 1.5 : 1,
            color: isMajor ? 0x334155 : 0x1e293b,
            alpha: isMajor ? 0.6 : 0.25,
          });
      }

      // Major intersection crosshair
      const crossSize = 8;
      tile.moveTo(0, -crossSize).lineTo(0, crossSize).stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.5 });
      tile.moveTo(-crossSize, 0).lineTo(crossSize, 0).stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.5 });

      GameMap.cachedGridTexture = renderer.generateTexture(tile);
      tile.destroy();
    }

    if (!GameMap.cachedStarTexture) {
      const starTileSize = 2000;
      const starTile = new Graphics();
      let seed = 12345;
      const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      const starColors = [0xffffff, 0x93c5fd, 0x38bdf8, 0xfde047, 0xf472b6];
      const totalStars = 100;
      for (let i = 0; i < totalStars; i++) {
        const sx = pseudoRandom() * starTileSize;
        const sy = pseudoRandom() * starTileSize;
        const radius = 1 + pseudoRandom() * 2;
        const color = starColors[Math.floor(pseudoRandom() * starColors.length)];
        const alpha = 0.3 + pseudoRandom() * 0.7;

        starTile.circle(sx, sy, radius).fill({ color, alpha });
      }

      GameMap.cachedStarTexture = renderer.generateTexture(starTile);
      starTile.destroy();
    }
  }

  private createBackground(width: number, height: number): Container {
    const halfW = width / 2;
    const halfH = height / 2;
    const appRenderer = engine()?.renderer;

    if (appRenderer) {
      GameMap.getOrCreateTextures(appRenderer);

      const bg = new Container();

      if (GameMap.cachedGridTexture) {
        const gridSprite = new TilingSprite({
          texture: GameMap.cachedGridTexture,
          width,
          height,
        });
        gridSprite.position.set(-halfW, -halfH);
        bg.addChild(gridSprite);
      }

      if (GameMap.cachedStarTexture) {
        const starSprite = new TilingSprite({
          texture: GameMap.cachedStarTexture,
          width,
          height,
        });
        starSprite.position.set(-halfW, -halfH);
        bg.addChild(starSprite);
      }

      const overlay = new Graphics();
      // Origin / Spawn point indicator
      overlay.circle(0, 0, 40).stroke({ width: 2, color: 0x38bdf8, alpha: 0.8 });
      overlay.circle(0, 0, 6).fill({ color: 0x38bdf8, alpha: 0.9 });

      // Map boundary border
      overlay.rect(-halfW, -halfH, width, height).stroke({
        width: 4,
        color: 0xef4444,
        alpha: 0.7,
      });

      bg.addChild(overlay);
      return bg;
    }

    return this.createDirectBackground(width, height);
  }

  private createDirectBackground(width: number, height: number): Graphics {
    const bg = new Graphics();
    const halfW = width / 2;
    const halfH = height / 2;

    // 1. Base dark space background
    bg.rect(-halfW, -halfH, width, height).fill({ color: 0x090d16 });

    // 2. Minor & major grid pattern
    const minorGridSize = 100;
    const majorGridSize = 500;

    // Draw vertical grid lines
    for (let x = -halfW; x <= halfW; x += minorGridSize) {
      const isMajor = x % majorGridSize === 0;
      bg.moveTo(x, -halfH)
        .lineTo(x, halfH)
        .stroke({
          width: isMajor ? 1.5 : 1,
          color: isMajor ? 0x334155 : 0x1e293b,
          alpha: isMajor ? 0.6 : 0.25,
        });
    }

    // Draw horizontal grid lines
    for (let y = -halfH; y <= halfH; y += minorGridSize) {
      const isMajor = y % majorGridSize === 0;
      bg.moveTo(-halfW, y)
        .lineTo(halfW, y)
        .stroke({
          width: isMajor ? 1.5 : 1,
          color: isMajor ? 0x334155 : 0x1e293b,
          alpha: isMajor ? 0.6 : 0.25,
        });
    }

    // 3. Coordinate crosshair markers at major intersections
    const crossSize = 8;
    for (let x = -halfW; x <= halfW; x += majorGridSize) {
      for (let y = -halfH; y <= halfH; y += majorGridSize) {
        bg.moveTo(x - crossSize, y)
          .lineTo(x + crossSize, y)
          .stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.5 });
        bg.moveTo(x, y - crossSize)
          .lineTo(x, y + crossSize)
          .stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.5 });
      }
    }

    // 4. Deterministic starfield pattern
    let seed = 12345;
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const starColors = [0xffffff, 0x93c5fd, 0x38bdf8, 0xfde047, 0xf472b6];
    const totalStars = 500;
    for (let i = 0; i < totalStars; i++) {
      const sx = (pseudoRandom() - 0.5) * width;
      const sy = (pseudoRandom() - 0.5) * height;
      const radius = 1 + pseudoRandom() * 2;
      const color = starColors[Math.floor(pseudoRandom() * starColors.length)];
      const alpha = 0.3 + pseudoRandom() * 0.7;

      bg.circle(sx, sy, radius).fill({ color, alpha });
    }

    // 5. Origin / Spawn point indicator
    bg.circle(0, 0, 40).stroke({ width: 2, color: 0x38bdf8, alpha: 0.8 });
    bg.circle(0, 0, 6).fill({ color: 0x38bdf8, alpha: 0.9 });

    // 6. Map boundary border
    bg.rect(-halfW, -halfH, width, height).stroke({
      width: 4,
      color: 0xef4444,
      alpha: 0.7,
    });

    return bg;
  }

  /** Set camera focus / pivot position */
  public setFocus(x: number, y: number) {
    this.pivot.set(x, y);
  }

  /** Set the sun radius */
  public setSunScale(radius: number) {
    this.sun.setScale(radius);
  }

  /** Update map elements like the sun */
  public update(time?: Ticker) {
    this.sun.update(time);
  }

  /** Reset map pivot */
  public reset() {
    this.pivot.set(0, 0);
  }
}
