import {animate} from "motion";
import type {ObjectTarget} from "motion/react";
import {Container, Graphics, Sprite, Texture} from "pixi.js";
import {Input} from "@pixi/ui";

import {engine} from "../getEngine";
import {initNetwork, useGameStore} from "../lib/store/gameStore";
import {Button} from "../ui/menu/Button";
import {MainScreen} from "./main/MainScreen";
import {userSettings} from "../utils/userSettings";

/** Start Screen with player name input and play action */
export class StartScreen extends Container {
    public static assetBundles = ["main"];

    private logo: Sprite;
    private nameInput: Input;
    private playButton: Button;
    private contentContainer: Container;

    constructor() {
        super();

        this.contentContainer = new Container();
        this.addChild(this.contentContainer);

        this.logo = new Sprite({
            texture: Texture.from("logo.svg"),
            anchor: 0.5,
            scale: 0.15,
        });
        this.contentContainer.addChild(this.logo);

        const inputBg = new Graphics()
            .roundRect(0, 0, 300, 56, 14)
            .fill({ color: 0x18181b, alpha: 0.9 })
            .stroke({ width: 2, color: 0x3f3f46 });

        this.nameInput = new Input({
            bg: inputBg,
            placeholder: "Enter your name...",
            value: useGameStore.getState().playerName || "",
            textStyle: {
                fill: 0xffffff,
                fontSize: 20,
                fontFamily: "Science Gothic",
                align: "center",
            },
            align: "center",
            padding: 0,
            maxLength: 16,
            cleanOnFocus: false,
        });
        this.nameInput.pivot.set(150, 28);
        this.contentContainer.addChild(this.nameInput);

        this.playButton = new Button({
            text: "PLAY",
            width: 240,
            height: 72,
            fontSize: 26,
        });
        this.playButton.onPress.connect(() => this.handlePlay());
        this.contentContainer.addChild(this.playButton);
    }

    private async handlePlay() {
        const rawName = this.nameInput.value?.trim();
        const name = rawName && rawName.length > 0 ? rawName : "Player";
        useGameStore.getState().setPlayerName(rawName || "");

        if (!userSettings.hasSeenTutorial()) {
            // Handled by <HowToPlayOverlay> (a plain React component, see app/components) --
            // it calls initNetwork()/showScreen(MainScreen) itself once dismissed.
            useGameStore.getState().setShowTutorial(true);
            return;
        }

        initNetwork(name);

        await engine().navigation.showScreen(MainScreen);
    }

    public prepare() {
        const storedName = useGameStore.getState().playerName;
        this.nameInput.value = storedName || "";
    }

    public resize(width: number, height: number) {
        const centerX = width * 0.5;
        const centerY = height * 0.5;

        this.contentContainer.position.set(centerX, centerY);

        this.logo.position.set(0, -200);
        this.nameInput.position.set(0, 20);
        this.playButton.position.set(0, 105);
    }

    public async show() {
        engine().audio.bgm.play("main/sounds/lobby_music.m4a", { volume: 0.5 });
        this.contentContainer.alpha = 0;
        await animate(
            this.contentContainer,
            { alpha: 1 } as ObjectTarget<Container>,
            { duration: 0.3, ease: "easeOut" }
        );
    }

    public async hide() {
        await animate(
            this.contentContainer,
            { alpha: 0 } as ObjectTarget<Container>,
            { duration: 0.2, ease: "easeIn" }
        );
    }
}
