import type {Ticker} from "pixi.js";
import {Container, Sprite, Texture} from "pixi.js";

const defaultSunOptions = {
    /** Initial scale of the sun */
    scale: 1,
    /** Rotation speed in radians per second for circle 1 */
    circle1RotationSpeed: 0.04,
    /** Rotation speed in radians per second for circle 2 */
    circle2RotationSpeed: -0.025,
    /** Unified growth speed per second applied to all layers */
    growthSpeed: 0,
};

type SunOptions = typeof defaultSunOptions;

/**
 * Multi-layered sun object composed of an outer perimeter corona,
 * a static outer circle base, and two independently rotating inner circles.
 */
export class Sun extends Container {
    private BACKEND_TRANSFORM_FACTOR: number = 0.475;
    private _sunScale: number = 1;

    public perimeter: Sprite;
    public outerCircle: Sprite;
    public circle1: Sprite;
    public circle2: Sprite;
    public circle1RotationSpeed: number;
    public circle2RotationSpeed: number;
    public growthSpeed: number;

    constructor(options: Partial<SunOptions> = {}) {
        super();
        const opts = {...defaultSunOptions, ...options};

        this.perimeter = new Sprite({
            texture: Texture.from("sun-perimeter.svg"),
            anchor: 0.5,
        });

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

        this.setSunScale(opts.scale);

        this.circle1RotationSpeed = opts.circle1RotationSpeed;
        this.circle2RotationSpeed = opts.circle2RotationSpeed;
        this.growthSpeed = opts.growthSpeed;
    }

    /** Set the exact sun scale in world units (for scale 1 the sun is 500px by 500px) */
    public setSunScale(scale: number): void {
        this._sunScale = scale;
        this.scale.set(scale * this.BACKEND_TRANSFORM_FACTOR);
    }

    /** Set the sun scale (alias for setSunScale) */
    public setScale(scale: number): void {
        this.setSunScale(scale);
    }

    /** Set the sun radius (compatibility method) */
    public setRadius(radius: number): void {
        this.setSunScale(radius);
    }

    /** Get the current sun scale in world units */
    public get sunScale(): number {
        return this._sunScale;
    }

    /** Base radius of the sun in world units when scale is 1 */
    public static readonly BASE_RADIUS: number = 300;

    /** Get the exact current radius in world units */
    public get radius(): number {
        return Sun.BASE_RADIUS * this._sunScale;
    }

    /** Set the scale across all layers (perimeter, outer circle, circle 1, circle 2) uniformly */
    public setAllScales(scale: number) {
        this.perimeter.scale.set(scale);
        this.outerCircle.scale.set(scale);
        this.circle1.scale.set(scale);
        this.circle2.scale.set(scale);
    }

    /** Increase scale across all layers uniformly by a given delta amount */
    public grow(deltaScale: number) {
        this.perimeter.scale.x += deltaScale;
        this.perimeter.scale.y += deltaScale;
        this.outerCircle.scale.x += deltaScale;
        this.outerCircle.scale.y += deltaScale;
        this.circle1.scale.x += deltaScale;
        this.circle1.scale.y += deltaScale;
        this.circle2.scale.x += deltaScale;
        this.circle2.scale.y += deltaScale;
    }

    /** Increase scale across all layers uniformly by a given delta amount (alias for grow) */
    public growAll(deltaScale: number) {
        this.grow(deltaScale);
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

    /** Set the outer circle scale factor */
    public setOuterCircleScale(scale: number) {
        this.outerCircle.scale.set(scale);
    }

    /** Increase outer circle scale by a given delta amount */
    public growOuterCircle(deltaScale: number) {
        this.outerCircle.scale.x += deltaScale;
        this.outerCircle.scale.y += deltaScale;
    }

    /** Get current outer circle scale */
    public get outerCircleScale(): number {
        return this.outerCircle.scale.x;
    }

    /** Set the circle 1 scale factor */
    public setCircle1Scale(scale: number) {
        this.circle1.scale.set(scale);
    }

    /** Increase circle 1 scale by a given delta amount */
    public growCircle1(deltaScale: number) {
        this.circle1.scale.x += deltaScale;
        this.circle1.scale.y += deltaScale;
    }

    /** Get current circle 1 scale */
    public get circle1Scale(): number {
        return this.circle1.scale.x;
    }

    /** Set the circle 2 scale factor */
    public setCircle2Scale(scale: number) {
        this.circle2.scale.set(scale);
    }

    /** Increase circle 2 scale by a given delta amount */
    public growCircle2(deltaScale: number) {
        this.circle2.scale.x += deltaScale;
        this.circle2.scale.y += deltaScale;
    }

    /** Get current circle 2 scale */
    public get circle2Scale(): number {
        return this.circle2.scale.x;
    }

    /** Advance rotation of inner circles and update unified growth if configured */
    public update(time?: Ticker) {
        const delta = time?.deltaTime ?? 1;
        const dt = delta / 60;
        this.circle1.rotation += this.circle1RotationSpeed * dt;
        this.circle2.rotation += this.circle2RotationSpeed * dt;

        if (this.growthSpeed !== 0) {
            this.grow(this.growthSpeed * dt);
        }
    }
}