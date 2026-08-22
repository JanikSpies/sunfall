import {FancyButton} from "@pixi/ui";
import {animate} from "motion";
import {Container, type DestroyOptions, FederatedPointerEvent, isMobile, Rectangle, Ticker} from "pixi.js";

import {engine} from "../../getEngine";
import {SettingsPopup} from "../../popups/SettingsPopup";
import {Rocket} from "@/app/ui/game/Rocket";
import {GameMap} from "./GameMap";
import {VirtualJoystick} from "../../ui/game/VirtualJoystick";
import {DashButton} from "../../ui/game/DashButton";
import {Timer} from "../../ui/game/Timer";
import {BinaryCodec} from "@/app/lib/network/BinaryCodec";
import {network, useGameStore} from "@/app/lib/store/gameStore";


/** The screen that holds the app */
export class MainScreen extends Container {
    private inputState = { x: 100, y: 0, dash: false };

    /** Assets bundles required by this screen */
    public static assetBundles = ["main"];

    public mainContainer: Container;
    public timer: Timer;
    private gameMap: GameMap;
    private settingsButton: FancyButton;
    private rocket: Rocket;
    private virtualJoystick?: VirtualJoystick;
    private dashButton?: DashButton;
    private isTouchDevice =  isMobile.phone;
    private screenWidth = 0;
    private screenHeight = 0;
    private unsubscribeGameStore?: () => void;

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
                this.rocket.setTarget(dx * 100, dy * 100);
            };
            this.addChild(this.virtualJoystick);

            this.dashButton = new DashButton();
            this.dashButton.onDash = () => {
                if (!this.rocket.canDash()) return;
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

        this.unsubscribeGameStore = useGameStore.subscribe((state) => {
            const localId = state.localPlayerId;
            if (localId !== null && state.players[localId]) {
                this.rocket.applyPlayerState(state.players[localId]);
            }
        });

        this.on("pointermove", this.handlePointerMove, this);

        if (this.isTouchDevice) {
            this.virtualJoystick = new VirtualJoystick();
            this.virtualJoystick.onMove = (dx, dy) => {
                // Scale the normalized [-1, 1] joystick output to int8 [-100, 100]
                this.inputState.x = Math.round(dx * 100);
                this.inputState.y = Math.round(dy * 100);
            };
            this.virtualJoystick.onEnd = () => {
                this.inputState.x = 0;
                this.inputState.y = 0;
            };
            this.addChild(this.virtualJoystick);

            this.dashButton = new DashButton();
            this.dashButton.onDash = () => {
                if (!this.rocket.canDash()) return;
                this.rocket.dash();
                this.inputState.dash = true;
            };
            this.addChild(this.dashButton);
        }

        window.addEventListener("keydown", this.handleKeyDown);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space") {
            e.preventDefault();
            if (!this.rocket.canDash()) return;
            this.rocket.dash();
            this.inputState.dash = true;
        }
    };

    private handlePointerMove(event: FederatedPointerEvent) {
        if (event.pointerType !== "mouse") return;

        const localPos = this.mainContainer.toLocal(event.global);

        const dx = localPos.x - this.rocket.x;
        const dy = localPos.y - this.rocket.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.1) {
            this.inputState.x = Math.round((dx / dist) * 100);
            this.inputState.y = Math.round((dy / dist) * 100);
        }

        this.rocket.setTarget(localPos.x, localPos.y);
    }

    /** Prepare the screen just before showing */
    public prepare() {
        const state = useGameStore.getState();
        const localId = state.localPlayerId;
        if (localId !== null && state.players[localId]) {
            this.rocket.applyPlayerState(state.players[localId]);
        }
    }

    /** Update the screen */
    public update(time: Ticker) {
        this.gameMap.update(time);

        if (network) {
            const inputBuffer = BinaryCodec.encodeInput(
                this.inputState.x,
                this.inputState.y,
                this.inputState.dash
            );

            console.log(`Sending Input -> X: ${this.inputState.x}, Y: ${this.inputState.y}, Dash: ${this.inputState.dash}`);

            network.send(inputBuffer);
        }

        this.inputState.dash = false;

        this.rocket.update(time);
        this.gameMap.setFocus(this.rocket.x, this.rocket.y);

        this.updateSunPointer();
    }

    /** Update rocket's sun pointer indicator based on sun visibility in viewport */
    private updateSunPointer() {
        if (this.screenWidth <= 0 || this.screenHeight <= 0) return;

        const sun = this.gameMap.sun;
        const centerX = this.screenWidth * 0.5;
        const centerY = this.screenHeight * 0.5;

        // Position of the sun in screen space
        const screenSunX = centerX + (sun.x - this.rocket.x);
        const screenSunY = centerY + (sun.y - this.rocket.y);

        // Visible radius of the sun considering outer circle and current scale
        const sunRadius = sun.outerCircle?.width ? sun.outerCircle.width * sun.scale.x * 0.5 : 150;

        // Check if the sun intersects the screen viewport rectangle [0, screenWidth] x [0, screenHeight]
        const isSunOnScreen =
            screenSunX + sunRadius >= 0 &&
            screenSunX - sunRadius <= this.screenWidth &&
            screenSunY + sunRadius >= 0 &&
            screenSunY - sunRadius <= this.screenHeight;

        if (isSunOnScreen) {
            this.rocket.setSunPointer(false);
        } else {
            const dx = sun.x - this.rocket.x;
            const dy = sun.y - this.rocket.y;
            const angleToSun = Math.atan2(dy, dx);
            this.rocket.setSunPointer(true, angleToSun);
        }
    }

    /** Pause gameplay - automatically fired when a popup is presented */
    public async pause() {
        this.mainContainer.interactiveChildren = false;
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
    }

    /** Resume gameplay */
    public async resume() {
        this.mainContainer.interactiveChildren = true;
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
        this.screenWidth = width;
        this.screenHeight = height;

        const centerX = width * 0.5;
        const centerY = height * 0.5;

        this.mainContainer.x = centerX;
        this.mainContainer.y = centerY;
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
            this.settingsButton,
            this.timer,
        ];
        if (this.virtualJoystick) elementsToAnimate.push(this.virtualJoystick);
        if (this.dashButton) elementsToAnimate.push(this.dashButton);

        for (const element of elementsToAnimate) {
            element.alpha = 0;
            animate(
                element,
                {alpha: 1},
                {duration: 0.2, delay: 0.75, ease: "backOut"},
            );
        }
    }

    /** Hide screen with animations */
    public async hide() {
        window.removeEventListener("keydown", this.handleKeyDown);
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
    }

    public override destroy(options?: DestroyOptions) {
        this.unsubscribeGameStore?.();
        window.removeEventListener("keydown", this.handleKeyDown);
        super.destroy(options);
    }
}