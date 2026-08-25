import {FancyButton} from "@pixi/ui";
import {animate} from "motion";
import {Container, type DestroyOptions, FederatedPointerEvent, isMobile, Rectangle, Ticker} from "pixi.js";

import {engine} from "../../getEngine";
import {SettingsPopup} from "../../popups/SettingsPopup";
import {Rocket} from "@/app/ui/game/Rocket";
import {EnemyRocket} from "@/app/ui/game/EnemyRocket";
import {GameMap} from "./GameMap";
import {VirtualJoystick} from "../../ui/game/VirtualJoystick";
import {DashButton} from "../../ui/game/DashButton";
import {Timer} from "../../ui/game/Timer";
import {EnergyBar} from "../../ui/game/EnergyBar";
import {Scoreboard} from "../../ui/game/Scoreboard";
import {PingDisplay} from "../../ui/game/PingDisplay";
import {playEnergyStealEffect} from "../../ui/game/EnergyStealEffect";
import {BinaryCodec} from "@/app/lib/network/BinaryCodec";
import {network, useGameStore} from "@/app/lib/store/gameStore";
import {DeathReason} from "@/app/lib/models/WebSocketTypes";
import {StartScreen} from "../StartScreen";


/** The screen that holds the app */
export class MainScreen extends Container {
    private inputState = {x: 100, y: 0, dash: false};

    /** Assets bundles required by this screen */
    public static assetBundles = ["main"];

    public mainContainer: Container;
    public timer: Timer;
    public energyBar: EnergyBar;
    private pingDisplay: PingDisplay;
    private scoreboard?: Scoreboard;
    private gameMap: GameMap;
    private settingsButton: FancyButton;
    private rocket!: Rocket;
    private enemyRockets: Map<number, EnemyRocket> = new Map();
    private dyingEnemyIds: Set<number> = new Set();
    private lastDeathSeq = 0;
    private lastMatchResetSeq = 0;
    private lastKillSeq = 0;
    private virtualJoystick?: VirtualJoystick;
    private dashButton?: DashButton;
    private isTouchDevice = isMobile.phone;
    private screenWidth = 0;
    private screenHeight = 0;
    private unsubscribeGameStore?: () => void;
    private deathTimeoutId: number | null = null;

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

        this.timer = new Timer({text: "00:00"});
        this.addChild(this.timer);

        this.pingDisplay = new PingDisplay();
        this.addChild(this.pingDisplay);

        this.scoreboard = new Scoreboard();
        this.addChild(this.scoreboard);

        this.energyBar = new EnergyBar();
        this.addChild(this.energyBar);

        this.gameMap = new GameMap();
        this.mainContainer.addChild(this.gameMap);

        this.createRocket();

        this.unsubscribeGameStore = useGameStore.subscribe((state) => {
            this.syncPlayers(state);
            this.handleDeathState(state.isDead);
            this.timer.setTime(state.matchTimer);
            this.gameMap.setSunScale(state.sunScale);
            this.scoreboard?.setEntries(state.scoreboard, state.localPlayerId);
            this.pingDisplay.setPing(state.ping);
            this.handleLifecycleEvents(state);
        });

        this.on("pointermove", this.handlePointerMove, this);

        if (this.isTouchDevice) {
            this.virtualJoystick = new VirtualJoystick({radius: 100, knobRadius: 40});
            this.virtualJoystick.onMove = (dx, dy) => {
                if (useGameStore.getState().isDead || !this.rocket) return;

                // Scale the normalized [-1, 1] joystick output to int8 [-100, 100]
                const scaledX = Math.round(dx * 100);
                const scaledY = Math.round(dy * 100);

                this.inputState.x = scaledX;
                this.inputState.y = scaledY;

                // Update local visual target
                this.rocket.setTarget(scaledX, scaledY);
            };
            this.addChild(this.virtualJoystick);

            this.dashButton = new DashButton({radius: 100});
            this.dashButton.onDash = () => {
                if (useGameStore.getState().isDead || !this.rocket || !this.rocket.canDash()) return;
                this.rocket.dash();
                this.inputState.dash = true;
            };
            this.addChild(this.dashButton);
        }
    }

    private createRocket() {
        this.destroyRocket();
        this.rocket = new Rocket();
        this.gameMap.addChild(this.rocket);
    }

    private destroyRocket() {
        if (this.rocket) {
            this.gameMap.removeChild(this.rocket);
            this.rocket.destroy();
            this.rocket = undefined as unknown as Rocket;
        }
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space") {
            e.preventDefault();
            if (useGameStore.getState().isDead || !this.rocket || !this.rocket.canDash()) return;
            this.rocket.dash();
            this.inputState.dash = true;
        }
    };

    private handlePointerMove(event: FederatedPointerEvent) {
        if (event.pointerType !== "mouse" || useGameStore.getState().isDead || !this.rocket) return;

        // This converts the global mouse position into the mainContainer's local space.
        // Since mainContainer is centered, (0,0) is now the dead center of the canvas.
        const localPos = this.mainContainer.toLocal(event.global);

        // Use localPos directly! No need to subtract world coordinates.
        const dx = localPos.x;
        const dy = localPos.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.1) {
            // Normalizes the vector and scales it to an int8 [-100, 100] (matching your joystick)
            this.inputState.x = Math.round((dx / dist) * 100);
            this.inputState.y = Math.round((dy / dist) * 100);
        }

        // Assuming setTarget expects a directional offset like your joystick does
        this.rocket.setTarget(dx, dy);
    }

    private handleDeathState(isDead: boolean) {
        if (isDead) {
            this.rocket?.setSunPointer(false);

            if (this.deathTimeoutId === null) {
                // A popup (e.g. Settings) left open would otherwise be orphaned on top of
                // StartScreen once we navigate away below -- close it the same way its own
                // button would, before the death transition starts.
                if (engine().navigation.currentPopup) {
                    void engine().navigation.dismissPopup();
                }

                this.deathTimeoutId = window.setTimeout(async () => {
                    this.deathTimeoutId = null;
                    network?.disconnect();
                    useGameStore.getState().resetGame();
                    this.reset();
                    await engine().navigation.showScreen(StartScreen);
                }, 3000);
            }
        } else {
            if (this.deathTimeoutId !== null) {
                window.clearTimeout(this.deathTimeoutId);
                this.deathTimeoutId = null;
            }
            if (this.rocket) {
                this.rocket.visible = true;
            }
        }
    }

    /** Prepare the screen just before showing */
    public prepare() {
        this.lastDeathSeq = 0;
        this.lastMatchResetSeq = 0;
        this.lastKillSeq = 0;
        this.createRocket();
        const state = useGameStore.getState();
        this.handleDeathState(state.isDead);
        this.syncPlayers(state);
    }

    /** Synchronize local and remote player entities with game store state */
    private syncPlayers(state: ReturnType<typeof useGameStore.getState>) {
        const localId = state.localPlayerId;
        if (localId !== null && state.players[localId] && this.rocket) {
            const player = state.players[localId];
            this.rocket.applyPlayerState(player);
            this.setEnergy(player.energy, player.size);
        }

        for (const idStr in state.players) {
            const player = state.players[idStr];
            const id = player.id;
            if (id === localId) continue;

            let enemyRocket = this.enemyRockets.get(id);
            if (!enemyRocket) {
                enemyRocket = new EnemyRocket();
                this.enemyRockets.set(id, enemyRocket);
                this.gameMap.addChild(enemyRocket);
                enemyRocket.applyPlayerState(player);
                void enemyRocket.playRespawn();
                continue;
            }
            enemyRocket.applyPlayerState(player);
        }

        for (const [id, enemyRocket] of this.enemyRockets.entries()) {
            if (this.dyingEnemyIds.has(id)) continue;
            if (!(id in state.players) || id === localId) {
                this.dyingEnemyIds.add(id);
                void enemyRocket.playDyingExplosion().then(() => {
                    this.gameMap.removeChild(enemyRocket);
                    enemyRocket.destroy();
                    this.enemyRockets.delete(id);
                    this.dyingEnemyIds.delete(id);
                });
            }
        }

        this.timer.setTime(state.matchTimer);
        this.gameMap.setSunScale(state.sunScale);
        this.scoreboard?.setEntries(state.scoreboard, localId);
    }

    /** React to one-shot lifecycle events (death, match reset) that aren't part of steady PlayerState */
    private handleLifecycleEvents(state: ReturnType<typeof useGameStore.getState>) {
        if (state.deathEvent && state.deathEvent.seq !== this.lastDeathSeq) {
            this.lastDeathSeq = state.deathEvent.seq;
            void this.playLocalDeath(state.deathEvent.reason);
        }

        if (state.matchResetSeq !== this.lastMatchResetSeq) {
            this.lastMatchResetSeq = state.matchResetSeq;
            if (this.rocket) {
                void this.rocket.playRespawn();
            }
        }

        if (state.killEvent && state.killEvent.seq !== this.lastKillSeq) {
            this.lastKillSeq = state.killEvent.seq;
            if (this.rocket) {
                playEnergyStealEffect(
                    this.gameMap,
                    state.killEvent.victimX,
                    state.killEvent.victimY,
                    this.rocket.x,
                    this.rocket.y,
                );
            }
        }
    }

    /** Play the local player's death sequence, chaining a sun-specific pre-animation when relevant */
    private async playLocalDeath(reason: DeathReason): Promise<void> {
        if (!this.rocket) return;
        if (reason === DeathReason.SUN) {
            await this.rocket.playFallingIntoSun();
        }
        if (this.rocket) {
            await this.rocket.playDyingExplosion();
        }
    }

    /** Update the screen */
    public update(time: Ticker) {
        this.gameMap.update(time);

        const isDead = useGameStore.getState().isDead;
        if (!isDead && this.rocket) {
            if (network) {
                const inputBuffer = BinaryCodec.encodeInput(
                    this.inputState.x,
                    this.inputState.y,
                    this.inputState.dash
                );

                network.send(inputBuffer);
            }

            this.rocket.update(time);
            for (const enemyRocket of this.enemyRockets.values()) {
                enemyRocket.update(time);
            }
            this.gameMap.setFocus(this.rocket.x, this.rocket.y);
            this.updateSunPointer();
        }
        this.inputState.dash = false;
    }

    /** Update rocket's sun pointer indicator based on sun visibility in viewport */
    private updateSunPointer() {
        if (this.screenWidth <= 0 || this.screenHeight <= 0 || !this.rocket) return;

        const sun = this.gameMap.sun;
        const centerX = this.screenWidth * 0.5;
        const centerY = this.screenHeight * 0.5;

        // Position of the sun in screen space
        const screenSunX = centerX + (sun.x - this.rocket.x);
        const screenSunY = centerY + (sun.y - this.rocket.y);

        // Visible radius of the sun
        const sunRadius = sun.radius;

        // Check if the circular sun intersects the screen viewport rectangle [0, screenWidth] x [0, screenHeight]
        const clampX = Math.max(0, Math.min(screenSunX, this.screenWidth));
        const clampY = Math.max(0, Math.min(screenSunY, this.screenHeight));
        const dx = screenSunX - clampX;
        const dy = screenSunY - clampY;
        const isSunOnScreen = dx * dx + dy * dy <= sunRadius * sunRadius;

        if (isSunOnScreen) {
            this.rocket.setSunPointer(false);
        } else {
            const angleToSun = Math.atan2(sun.y - this.rocket.y, sun.x - this.rocket.x);
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
        if (this.deathTimeoutId !== null) {
            window.clearTimeout(this.deathTimeoutId);
            this.deathTimeoutId = null;
        }
        this.destroyRocket();
        this.lastDeathSeq = 0;
        this.lastMatchResetSeq = 0;
        this.lastKillSeq = 0;
        this.inputState = {x: 100, y: 0, dash: false};
        this.gameMap.reset();
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
        this.energyBar.reset();
        this.pingDisplay.reset();
        this.scoreboard?.setEntries([], null);
        for (const enemyRocket of this.enemyRockets.values()) {
            this.gameMap.removeChild(enemyRocket);
            enemyRocket.destroy();
        }
        this.enemyRockets.clear();
        this.dyingEnemyIds.clear();
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
        this.pingDisplay.x = width - 30;
        this.pingDisplay.y = 62;
        this.timer.x = centerX;
        this.timer.y = 30;

        if (this.scoreboard) {
            this.scoreboard.x = 30 + this.scoreboard.width * 0.5;
            this.scoreboard.y = 30 + this.scoreboard.height * 0.5;
        }

        this.energyBar.x = centerX;
        this.energyBar.y = height - 50;

        if (this.virtualJoystick) {
            const joyPadX = 150;
            const joyPadY = 150;
            this.virtualJoystick.x = joyPadX;
            this.virtualJoystick.y = height - joyPadY;
        }

        if (this.dashButton) {
            const btnPadX = 150;
            const btnPadY = 150;
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

    /** Set energy current value and optional level */
    public setEnergy(current: number, level: number): void {
        this.energyBar.setValueForLevel(current, level);
    }

    /** Set energy progress directly from 0.0 to 1.0 */
    public setEnergyProgress(progress: number): void {
        this.energyBar.setProgress(progress);
    }

    /** Get current energy value */
    public getEnergy(): number {
        return this.energyBar.value;
    }

    /** Get max energy value */
    public getMaxEnergy(): number {
        return this.energyBar.maxValue;
    }

    /** Get energy progress fraction */
    public getEnergyProgress(): number {
        return this.energyBar.progress;
    }

    /** Show screen with animations */
    public async show(): Promise<void> {
        window.addEventListener("keydown", this.handleKeyDown);
        engine().audio.bgm.play("main/sounds/game_music.m4a", {volume: 0.5});

        const elementsToAnimate: Container[] = [
            this.settingsButton,
            this.timer,
            this.energyBar,
            this.pingDisplay,
        ];
        if (this.scoreboard) elementsToAnimate.push(this.scoreboard);
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
        if (this.deathTimeoutId !== null) {
            window.clearTimeout(this.deathTimeoutId);
            this.deathTimeoutId = null;
        }
        window.removeEventListener("keydown", this.handleKeyDown);
        this.virtualJoystick?.reset();
        this.dashButton?.reset();
    }

    public override destroy(options?: DestroyOptions) {
        if (this.deathTimeoutId !== null) {
            window.clearTimeout(this.deathTimeoutId);
            this.deathTimeoutId = null;
        }
        this.unsubscribeGameStore?.();
        this.destroyRocket();
        window.removeEventListener("keydown", this.handleKeyDown);
        for (const enemyRocket of this.enemyRockets.values()) {
            this.gameMap.removeChild(enemyRocket);
            enemyRocket.destroy();
        }
        this.enemyRockets.clear();
        this.dyingEnemyIds.clear();
        super.destroy(options);
    }
}