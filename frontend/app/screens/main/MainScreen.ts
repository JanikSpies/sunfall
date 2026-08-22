import {FancyButton} from "@pixi/ui";
import {animate} from "motion";
import type {AnimationPlaybackControls} from "motion/react";
import type {FederatedPointerEvent, Ticker} from "pixi.js";
import {Container, Rectangle} from "pixi.js";

import {engine} from "../../getEngine";
import {PausePopup} from "../../popups/PausePopup";
import {SettingsPopup} from "../../popups/SettingsPopup";
import {Rocket} from "@/app/ui/game/Rocket";
import {GameMap} from "./GameMap";
import {Sun} from "../../ui/game/Sun";
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
    private paused = false;

    constructor() {
        super();

        this.eventMode = "static";

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

        this.timer = new Timer({ text: "00:00" });
        this.addChild(this.timer);

        this.gameMap = new GameMap();
        this.mainContainer.addChild(this.gameMap);

        this.rocket = new Rocket();
        this.gameMap.addChild(this.rocket);

        this.on("pointermove", this.handlePointerMove, this);
    }

    private handlePointerMove(event: FederatedPointerEvent) {
        if (this.paused) return;
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
        engine().audio.bgm.play("main/sounds/bgm-main.mp3", {volume: 0.5});

        const elementsToAnimate = [
            this.pauseButton,
            this.settingsButton,
            this.timer,
        ];

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
    }

    /** Auto pause the app when window go out of focus */
    public blur() {
        if (!engine().navigation.currentPopup) {
            engine().navigation.presentPopup(PausePopup);
        }
    }
}