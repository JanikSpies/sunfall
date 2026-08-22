import type { Ticker } from "pixi.js";
import { Sprite, Texture } from "pixi.js";

const defaultSunOptions = {
    size: 3000,
    /** Rotation speed in radians per second */
    rotationSpeed: 0.05,
};

type SunOptions = typeof defaultSunOptions;

/**
 * Decorative sun shown permanently in the background.
 * Rotates slowly; call `update` every frame and `resize` whenever
 * the screen size changes to keep it centered and covering the view.
 */
export class Sun extends Sprite {
    private rotationSpeed: number;

    constructor(options: Partial<SunOptions> = {}) {
        const opts = { ...defaultSunOptions, ...options };

        super({
            texture: Texture.from("sun-outer-circle.svg"),
            anchor: 0.5,
            width: opts.size,
            height: opts.size,
        });

        this.rotationSpeed = opts.rotationSpeed;
    }

    /** Advance the sun's rotation; call this from the screen's update loop */
    public update(time: Ticker) {
        this.rotation += this.rotationSpeed * (time.deltaTime / 60);
    }

    /** Keep the sun centered and large enough to cover the screen */
    public resize(width: number, height: number) {
        this.x = width * 0.5;
        this.y = height * 0.5;

        const scale = Math.max(width, height) / this.texture.width;
        this.scale.set(scale);
    }
}