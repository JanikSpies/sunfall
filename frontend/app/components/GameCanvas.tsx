"use client";

import {useEffect, useRef} from "react";
import {CreationEngine} from "@/engine/engine";
import {initNetwork} from "../lib/store/gameStore";

export default function GameCanvas() {
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        initNetwork();

        let engine: CreationEngine | undefined;

        const startEngine = async () => {
            const [{CreationEngine}, {setEngine}, {userSettings}, {LoadScreen}, {MainScreen}] =
                await Promise.all([
                    import("../../engine/engine"),
                    import("../getEngine"),
                    import("../utils/userSettings"),
                    import("../screens/LoadScreen"),
                    import("../screens/main/MainScreen"),
                ]);

            (globalThis as Record<string, unknown>).APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

            engine = new CreationEngine();
            setEngine(engine);

            await engine.init({
                background: "#09090b",
                antialias: true,
                resizeTo: window,
                resizeOptions: {minWidth: 768, minHeight: 1024, letterbox: false},
            });

            userSettings.init();

            try {
                await engine.navigation.showScreen(LoadScreen);
                await engine.navigation.showScreen(MainScreen);
            } catch (error) {
                console.warn("Unable to start the bundled Pixi screens; using fallback scene.", error);

                const {Container, Graphics, Text, TextStyle} = await import("pixi.js");
                const fallback = new Container();
                const bg = new Graphics()
                    .rect(0, 0, window.innerWidth, window.innerHeight)
                    .fill({color: 0x0f172a});
                fallback.addChild(bg);

                const title = new Text({
                    text: "Sunfall",
                    style: new TextStyle({
                        fontFamily: "Science Gothic",
                        fill: 0xf8fafc,
                        fontSize: 48,
                        fontWeight: "700",
                        letterSpacing: 2,
                    }),
                });
                title.anchor.set(0.5);
                title.position.set(window.innerWidth / 2, window.innerHeight / 2);
                fallback.addChild(title);

                engine.stage.addChild(fallback);
            }
        };

        void startEngine();

        return () => {
            engine?.destroy();
        };
    }, []);

    return (
        <div id="app">
            <div id="pixi-container"></div>
        </div>
    );
}
