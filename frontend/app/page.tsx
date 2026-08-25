"use client";

import dynamic from "next/dynamic";
import HowToPlayOverlay from "./components/HowToPlayOverlay";

const GameCanvas = dynamic(() => import("./components/GameCanvas"), {
    ssr: false
})

export default function Home() {
    return (
        <main className="h-screen w-screen absolute">
            <GameCanvas />
            <HowToPlayOverlay />
        </main>
    );
}
