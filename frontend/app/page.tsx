"use client";

import dynamic from "next/dynamic";

const GameCanvas = dynamic(() => import("./components/GameCanvas"), {
    ssr: false
})

export default function Home() {
    return (
        <main>
            <GameCanvas />
        </main>
    );
}
