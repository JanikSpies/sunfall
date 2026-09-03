import {animate} from "motion";
import type {ObjectTarget} from "motion/react";
import {Container, Graphics, Sprite, Texture} from "pixi.js";
import {Input} from "@pixi/ui";

import {engine} from "../getEngine";
import {initNetwork, useGameStore} from "../lib/store/gameStore";
import {
    DESKTOP_BREAKPOINT,
    DESKTOP_COMPOSITION_WIDTH,
    DESKTOP_GAP,
    DESKTOP_PADDING,
    DESKTOP_PANEL_WIDTH,
    MOBILE_BASE_SCALE,
    MOBILE_CONTENT_MARGIN,
    MOBILE_CONTENT_SIDE_MARGIN,
    MOBILE_MIN_AVAILABLE_HEIGHT,
} from "../lib/layout/titleLayout";
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

        // Static layout, set once here (not per-resize) so
        // contentContainer.getLocalBounds() in resize() always reflects the
        // real content -- it needs these positions applied before it can
        // measure anything meaningful.
        this.logo.position.set(0, -200);
        this.nameInput.position.set(0, 20);
        this.playButton.position.set(0, 105);
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

    public resize(width: number) {
        // `width` here is Pixi's internal resolution, which is
        // scaled up from the real CSS viewport whenever the window is
        // smaller than GameCanvas's resizeOptions floor (minWidth 768 /
        // minHeight 1024) -- e.g. on most phones. TitleStatsPanel's CSS
        // overlay, meanwhile, always works in real CSS pixels. Layout math
        // shared between the two (DESKTOP_BREAKPOINT, the mobile reserved
        // card space) has to happen in one consistent space, so compute
        // everything in real CSS pixels and convert the final position back
        // into Pixi's space with this ratio.
        const cssWidth = window.innerWidth;
        const cssHeight = window.innerHeight;
        const toPixiScale = width / cssWidth;

        // The container's local origin (0,0) isn't the visual center of its
        // content -- the logo sits well above y=0 (see the constructor).
        // Bounds are independent of contentContainer's own scale (they're in
        // its children's local space), so this is safe to read before scale
        // is set below.
        const bounds = this.contentContainer.getLocalBounds();
        const localCenterX = bounds.x + bounds.width * 0.5;
        const localCenterY = bounds.y + bounds.height * 0.5;

        const isDesktop = cssWidth >= DESKTOP_BREAKPOINT;
        let cssCenterX: number;
        let cssCenterY: number;
        let scale: number;

        if (isDesktop) {
            // The TitleStatsPanel React overlay sits beside this content in a
            // shared composition capped at DESKTOP_COMPOSITION_WIDTH (see
            // titleLayout.ts) -- past that width the whole two-column group
            // just stays centered instead of the gap between them growing
            // with the window.
            const compositionWidth = Math.min(cssWidth, DESKTOP_COMPOSITION_WIDTH);
            const compositionLeft = (cssWidth - compositionWidth) * 0.5;
            const gameColumnWidth = compositionWidth - DESKTOP_PANEL_WIDTH - DESKTOP_GAP - DESKTOP_PADDING * 2;

            cssCenterX = compositionLeft + DESKTOP_PADDING + gameColumnWidth * 0.5;
            cssCenterY = cssHeight * 0.5;
            scale = 1;
        } else {
            // The records/leaderboard stats live behind the "Stats" tab now
            // (see MobileTabBar/TitleStatsPanel), not stacked above/below the
            // title content -- the only thing this content needs to leave
            // room for is the tab bar itself at the bottom. MobileTabBar
            // measures its own real rendered height (which varies with the
            // safe-area inset on notched phones) into titleCardReserved.
            const { bottom } = useGameStore.getState().titleCardReserved;
            const availableHeight = Math.max(
                cssHeight - bottom - MOBILE_CONTENT_MARGIN * 2,
                MOBILE_MIN_AVAILABLE_HEIGHT
            );
            const availableWidth = Math.max(cssWidth - MOBILE_CONTENT_SIDE_MARGIN * 2, MOBILE_MIN_AVAILABLE_HEIGHT);

            // A fixed target size rather than "fill whatever room is left" --
            // the latter reliably read as too big (edge-to-edge, no
            // breathing room) once the stats cards stopped eating into the
            // available space. This only shrinks below MOBILE_BASE_SCALE as
            // a safety net for unusually small/short viewports; it never
            // grows past it just because more room opened up.
            const naturalHeightPx = bounds.height / toPixiScale;
            const naturalWidthPx = bounds.width / toPixiScale;
            const shrinkForHeight =
                naturalHeightPx > 0 ? Math.min(1, availableHeight / (naturalHeightPx * MOBILE_BASE_SCALE)) : 1;
            const shrinkForWidth =
                naturalWidthPx > 0 ? Math.min(1, availableWidth / (naturalWidthPx * MOBILE_BASE_SCALE)) : 1;

            cssCenterX = cssWidth * 0.5;
            cssCenterY = MOBILE_CONTENT_MARGIN + availableHeight * 0.5;
            scale = MOBILE_BASE_SCALE * Math.min(shrinkForHeight, shrinkForWidth);
        }

        this.contentContainer.scale.set(scale);
        // Position has to convert into Pixi's space to land in the same spot
        // as the CSS overlay's landmarks (see the toPixiScale comment above).
        this.contentContainer.position.set(
            cssCenterX * toPixiScale - localCenterX * scale,
            cssCenterY * toPixiScale - localCenterY * scale
        );
    }

    public async show() {
        engine().audio.bgm.play("main/sounds/lobby_music.m4a", { volume: 0.5 });
        useGameStore.getState().setOnTitleScreen(true);
        this.contentContainer.alpha = 0;
        await animate(
            this.contentContainer,
            { alpha: 1 } as ObjectTarget<Container>,
            { duration: 0.3, ease: "easeOut" }
        );
    }

    public async hide() {
        useGameStore.getState().setOnTitleScreen(false);
        await animate(
            this.contentContainer,
            { alpha: 0 } as ObjectTarget<Container>,
            { duration: 0.2, ease: "easeIn" }
        );
    }
}
