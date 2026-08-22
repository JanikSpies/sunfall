import type {Ticker} from "pixi.js";
import {Container, Sprite, Texture} from "pixi.js";

const defaultSunOptions = {
    /** Initial scale of the sun */
    scale: 2,
    /** Rotation speed in radians per second for circle 1 */
    circle1RotationSpeed: 0.04,
    /** Rotation speed in radians per second for circle 2 */
    circle2RotationSpeed: -0.025,
    /** Initial relative scale of the perimeter layer */
    perimeterScale: 1,
    /** Growth speed of perimeter scale per second (default 0, does not grow automatically) */
    perimeterGrowthSpeed: 0,
};

type SunOptions = typeof defaultSunOptions;

/**
 * Multi-layered sun object composed of an outer perimeter corona,
 * a static outer circle base, and two independently rotating inner circles.
 */
export class Sun extends Container {
    public perimeter: Sprite;
    public outerCircle: Sprite;
    public circle1: Sprite;
    public circle2: Sprite;
    public circle1RotationSpeed: number;
    public circle2RotationSpeed: number;
    public perimeterGrowthSpeed: number;

    constructor(options: Partial<SunOptions> = {}) {
        super();
        const opts = { ...defaultSunOptions, ...options };

        this.perimeter = new Sprite({
            texture: Texture.from("sun-perimeter.svg"),
            anchor: 0.5,
        });
        this.perimeter.scale.set(opts.perimeterScale);

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

        this.addChild(this.perimeter);
        this.addChild(this.outerCircle);
        this.addChild(this.circle1);
        this.addChild(this.circle2);

        this.scale.set(opts.scale);

        this.circle1RotationSpeed = opts.circle1RotationSpeed;
        this.circle2RotationSpeed = opts.circle2RotationSpeed;
        this.perimeterGrowthSpeed = opts.perimeterGrowthSpeed;
    }

    /** Set the perimeter scale factor */
    public setPerimeterScale(scale: number) {
        this.perimeter.scale.set(scale);
    }

    /** Increase perimeter scale by a given delta amount */
    public growPerimeter(deltaScale: number) {
        this.perimeter.scale.x += deltaScale;
        this.perimeter.scale.y += deltaScale;
    }

    /** Get current perimeter scale */
    public get perimeterScale(): number {
        return this.perimeter.scale.x;
    }

    /** Advance rotation of inner circles and update perimeter growth if configured */
    public update(time?: Ticker) {
        const delta = time?.deltaTime ?? 1;
        this.circle1.rotation += this.circle1RotationSpeed * (delta / 60);
        this.circle2.rotation += this.circle2RotationSpeed * (delta / 60);

        if (this.perimeterGrowthSpeed !== 0) {
            this.growPerimeter(this.perimeterGrowthSpeed * (delta / 60));
        }
    }
}