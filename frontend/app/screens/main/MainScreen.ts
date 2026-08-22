import {FancyButton} from "@pixi/ui";
import {animate} from "motion";
import type {AnimationPlaybackControls} from "motion/react";
import {Container, FederatedPointerEvent, isMobile, Rectangle, Ticker} from "pixi.js";

import {engine} from "../../getEngine";
import {PausePopup} from "../../popups/PausePopup";
import {SettingsPopup} from "../../popups/SettingsPopup";
import {Rocket} from "@/app/ui/game/Rocket";
import {GameMap} from "./GameMap";
import {Sun} from "../../ui/game/Sun";
import {VirtualJoystick} from "../../ui/game/VirtualJoystick";
import {DashButton} from "../../ui/game/DashButton";
import {Timer} from "../../ui/game/Timer";


/** The screen that holds the app */
export class MainScreen extends Container {
    /** Assets bundles required by this screen */
    public static assetBundles = ["main"];

    public mainContainer: Container;
    public timer: Timer;
    private gameMap: GameMap;
    private pauseButton: FancyButton;
    private settingsButton: FancyButton;
    private rocket: Rocket;
    private sun: Sun;
    private virtualJoystick?: VirtualJoystick;
    private dashButton?: DashButton;
    private isTouchDevice =  isMobile.phone;
    private paused = false;

    constructor() {
        super();

        this.eventMode = "static";

        this.sun = new Sun();
        this.addChild(this.sun);

        this.mainContainer = new Container();
        this.addChild(this.mainContainer);

        const buttonAnimations = {
            hover: {
                props: {
                    scale: {x: 1.1, y: 1.1},
                },
                duration: 100,
            },
            pressed: {
                props: {
                    scale: {x: 0.9, y: 0.9},
                },
                duration: 100,
            },
        };
        this.pauseButton = new FancyButton({
            defaultView: "icon-pause.png",
            anchor: 0.5,
            animations: buttonAnimations,
        });
        this.pauseButton.onPress.connect(() =>
            engine().navigation.presentPopup(PausePopup),
        );
        this.addChild(this.pauseButton);

        this.settingsButton = new FancyButton({
            defaultView: "icon-settings.png",
            anchor: 0.5,
            animations: buttonAnimations,
        });
        this.settingsButton.onPress.connect(() =>
            engine().navigation.presentPopup(SettingsPopup),
        );
        this.addChild(this.settingsButton);

        if (this.isTouchDevice) {
            this.virtualJoystick = new VirtualJoystick();
            this.virtualJoystick.onMove = (dx, dy) => {
                if (this.paused) return;
                this.rocket.setTarget(dx * 100, dy * 100);
            };
            this.addChild(this.virtualJoystick);

            this.dashButton = new DashButton();
            this.dashButton.onDash = () => {
                if (this.paused) return;
                this.rocket.dash();
            };
            this.addChild(this.dashButton);
        }

        this.timer = new Timer({ text: "00:00" });
        this.addChild(this.timer);

        this.gameMap = new GameMap();
        this.mainContainer.addChild(this.gameMap);

        this.rocket = new Rocket();
        this.gameMap.addChild(this.rocket);

        this.on("pointermove", this.handlePointerMove, this);

        window.addEventListener("keydown", this.handleKeyDown);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (this.paused || e.repeat) return;
        if (e.code === "Space") {
            e.preventDefault();
            this.rocket.dash();
        }
    };

    private handlePointerMove(event: FederatedPointerEvent) {
        if (this.paused || event.pointerType !== "mouse") return;
        const localPos = this.mainContainer.toLocal(event.global);
        this.rocket.setTarget(localPos.x, localPos.y);
    }

    /** Prepare the screen just before showing */
    public prepare() {
    }

    /** Update the screen */
    public update(time: Ticker) {
        this.gameMap.update(time);

        if (this.paused) return;
        this.rocket.update(time);
        this.gameMap.setFocus(this.rocket.x, this.rocket.y);
    }

    /** Pause gameplay - automatically fired when a popup is presented */
    public async pause() {
        this.mainContainer.interactiveChildren = false;
        this.paused = true;
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
    }

    /** Resume gameplay */
    public async resume() {
        this.mainContainer.interactiveChildren = true;
        this.paused = false;
    }

    /** Fully reset */
    public reset() {
        this.rocket.reset();
        this.gameMap.reset();
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
    }

    /** Resize the screen, fired whenever window size changes */
    public resize(width: number, height: number) {
        const centerX = width * 0.5;
        const centerY = height * 0.5;

        this.mainContainer.x = centerX;
        this.mainContainer.y = centerY;
        this.pauseButton.x = 30;
        this.pauseButton.y = 30;
        this.settingsButton.x = width - 30;
        this.settingsButton.y = 30;
        this.timer.x = centerX;
        this.timer.y = 30;

        if (this.virtualJoystick) {
            const joyPadX = 115;
            const joyPadY = 115;
            this.virtualJoystick.x = joyPadX;
            this.virtualJoystick.y = height - joyPadY;
        }

        if (this.dashButton) {
            const btnPadX = 90;
            const btnPadY = 90;
            this.dashButton.x = width - btnPadX;
            this.dashButton.y = height - btnPadY;
        }

        this.hitArea = new Rectangle(0, 0, width, height);
    }

    /** Update the timer text */
    public setTimerText(text: string): void {
        this.timer.setText(text);
    }

    /** Update the timer text (alias for setTimerText) */
    public updateTimerText(text: string): void {
        this.timer.setText(text);
    }

    /** Get the current timer text */
    public getTimerText(): string {
        return this.timer.getText();
    }

    /** Set the timer time in seconds or (minutes, seconds) */
    public setTimerTime(seconds: number): void;
    public setTimerTime(minutes: number, seconds: number): void;
    public setTimerTime(minutesOrSeconds: number, maybeSeconds?: number): void {
        if (maybeSeconds !== undefined) {
            this.timer.setTime(minutesOrSeconds, maybeSeconds);
        } else {
            this.timer.setTime(minutesOrSeconds);
        }
    }

    /** Show screen with animations */
    public async show(): Promise<void> {
        window.addEventListener("keydown", this.handleKeyDown);
        engine().audio.bgm.play("main/sounds/bgm-main.mp3", {volume: 0.5});

        const elementsToAnimate: Container[] = [
            this.pauseButton,
            this.settingsButton,
            this.timer,
        ];
        if (this.virtualJoystick) elementsToAnimate.push(this.virtualJoystick);
        if (this.dashButton) elementsToAnimate.push(this.dashButton);

        let finalPromise!: AnimationPlaybackControls;
        for (const element of elementsToAnimate) {
            element.alpha = 0;
            finalPromise = animate(
                element,
                {alpha: 1},
                {duration: 0.3, delay: 0.75, ease: "backOut"},
            );
        }

        await finalPromise;

    }

    /** Hide screen with animations */
    public async hide() {
        window.removeEventListener("keydown", this.handleKeyDown);
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
    }

    /** Auto pause the app when window go out of focus */
    public blur() {
        if (!engine().navigation.currentPopup) {
            engine().navigation.presentPopup(PausePopup);
        }
    }
}