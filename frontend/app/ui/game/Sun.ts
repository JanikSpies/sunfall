import type {Ticker} from "pixi.js";
import {Container, Sprite, Texture} from "pixi.js";

const defaultSunOptions = {
    /** Rotation speed in radians per second for circle 1 */
    circle1RotationSpeed: 0.04,
    /** Rotation speed in radians per second for circle 2 */
    circle2RotationSpeed: -0.025,
};

type SunOptions = typeof defaultSunOptions;

/**
 * Multi-layered sun object composed of a static outer circle
 * and two independently rotating inner circles.
 */
export class Sun extends Container {
    public outerCircle: Sprite;
    public circle1: Sprite;
    public circle2: Sprite;
    public circle1RotationSpeed: number;
    public circle2RotationSpeed: number;

    constructor(options: Partial<SunOptions> = {}) {
        super();
        const opts = { ...defaultSunOptions, ...options };

        this.outerCircle = new Sprite({
            texture: Texture.from("sun-circle-outer.svg"),
            anchor: 0.5,
        });

        this.circle1 = new Sprite({
            texture: Texture.from("sun-circle-1.svg"),
            anchor: 0.5,
        });

        this.circle2 = new Sprite({
            texture: Texture.from("sun-circle-2.svg"),
            anchor: 0.5,
        });

        this.addChild(this.outerCircle);
        this.addChild(this.circle1);
        this.addChild(this.circle2);

        this.circle1RotationSpeed = opts.circle1RotationSpeed;
        this.circle2RotationSpeed = opts.circle2RotationSpeed;
    }

    /** Advance rotation of inner circles */
    public update(time?: Ticker) {
        const delta = time?.deltaTime ?? 1;
        this.circle1.rotation += this.circle1RotationSpeed * (delta / 60);
        this.circle2.rotation += this.circle2RotationSpeed * (delta / 60);
    }
}