"use client";

import dynamic from "next/dynamic";
import HowToPlayOverlay from "./components/HowToPlayOverlay";
import EnergyDangerOverlay from "./components/EnergyDangerOverlay";

const GameCanvas = dynamic(() => import("./components/GameCanvas"), {
    ssr: false
})

export default function Home() {
    return (
        <main className="h-screen w-screen absolute">
            <GameCanvas />
            <EnergyDangerOverlay />
            <HowToPlayOverlay />
        </main>
    );
}
