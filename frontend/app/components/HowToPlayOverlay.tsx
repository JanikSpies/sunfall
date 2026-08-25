"use client";

import { engine } from "../getEngine";
import { initNetwork, useGameStore } from "../lib/store/gameStore";
import { userSettings } from "../utils/userSettings";
import { MainScreen } from "../screens/main/MainScreen";

const SHIP_SRC = "/assets/main/game/spaceship_stage_1.svg";

/** Small curved arrow, fixed size -- sits directly between two flex siblings, never needs
 * to know where anything else on screen is (that's the whole point: flexbox places it). */
function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" fill="none" className={className}>
      <path
        d="M2 20 Q20 2 36 11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M36 11 L28 8.5 M36 11 L31.5 17.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 26"
      className={className}
      fill="white"
      stroke="#1e293b"
      strokeWidth="1.5"
    >
      <polygon points="0,0 0,22 5.5,17 9,24 12.5,22.5 9,15.5 16,15" />
    </svg>
  );
}

function JoystickIcon({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full border-2 border-sky-400/40 bg-zinc-900/60 ${className}`}
    >
      <div className="h-1/2 w-1/2 rounded-full bg-sky-400" />
    </div>
  );
}

function ImpactBurst({ className }: { className?: string }) {
  return (
    <svg viewBox="-24 -24 48 48" className={className}>
      <circle r="10" fill="#fff4c2" fillOpacity="0.6" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <line
          key={deg}
          x1="0"
          y1="-9"
          x2="0"
          y2="-20"
          stroke="#ffe08a"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${deg})`}
        />
      ))}
    </svg>
  );
}

/**
 * First-join tutorial, shown between the title screen and the game. Plain React/CSS on top
 * of the Pixi canvas -- StartScreen sets `showTutorial` instead of navigating to a Pixi
 * screen; this component owns continuing into the game once dismissed.
 *
 * The big sun and the ship images are the game's real assets; everything else (icons,
 * arrows, layout) is plain SVG/Tailwind, so placement is just flexbox -- no coordinate math.
 * Mobile vs desktop control hints (joystick/DASH button vs cursor/SPACE) are pure CSS via
 * the `md:` breakpoint, not device detection, so there's nothing to get out of sync.
 */
export default function HowToPlayOverlay() {
  const showTutorial = useGameStore((state) => state.showTutorial);

  if (!showTutorial) return null;

  const handleContinue = async () => {
    userSettings.setTutorialSeen();
    useGameStore.getState().setShowTutorial(false);

    const name = useGameStore.getState().playerName || undefined;
    initNetwork(name);
    await engine().navigation.showScreen(MainScreen);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/95 text-white"
      onClick={() => void handleContinue()}
    >
      {/* Big sun, bleeding off the edge -- bottom on mobile, left on desktop */}
      <div
        className="pointer-events-none fixed aspect-square left-0 bottom-0 h-[50vw] -translate-x-1/2 translate-y-1/3
                   md:left-0 md:-translate-y-1/2 md:top-1/2 md:h-[100vh] md:-translate-x-2/3">
        <img
          src="/assets/main/game/sun-perimeter.svg"
          alt=""
          className="absolute inset-0 h-full w-full"
        />
        <img
          src="/assets/main/game/sun-circle-outer.svg"
          alt=""
          className="absolute inset-0 h-full w-full"
        />
        <img
          src="/assets/main/game/sun-circle-2.svg"
          alt=""
          className="absolute inset-0 h-full w-full"
        />
        <img
          src="/assets/main/game/sun-circle-1.svg"
          alt=""
          className="absolute inset-0 h-full w-full"
        />
      </div>
      

      <div className="poiinter-events-none fixed aspect-square right-0 top-0 -translate-y-1/3 translate-x-1/3 h-[50vw] md:right-0 md:translate-x-1/2 md:h-screen md:translate-y-0">
        <img
              src="/assets/main/game/black-hole.svg"
              alt=""
              className="absolute inset-0 h-full w-full"
            />
      </div>

      <div
        className="flex flex-col gap-10 justify-center items-center p-10"
      >
        <h1 className="text-3xl font-bold">How to Play</h1>

        {/* Movement */}
        <div className="flex flex-col items-center gap-2 md:items-end">
          <div className="flex items-center gap-2">
            <JoystickIcon className="h-10 w-10 md:hidden" />
            <CursorIcon className="hidden h-6 w-6 md:block" />
            <Arrow className="h-6 w-9 text-white/70" />
            <img src={SHIP_SRC} alt="" className="h-10 w-10 -rotate-45" />
          </div>
          <p className="text-sm text-white/90">
            <span className="md:hidden">Drag the stick to move</span>
            <span className="hidden md:inline">Move the mouse to steer</span>
          </p>
        </div>

        {/* Dash control */}
        <div className="flex flex-col items-center gap-2 md:items-end">
          <div className="hidden rounded-lg border-2 border-zinc-700 bg-zinc-900/95 px-5 py-2 text-lg font-bold md:block">
            SPACE
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-sky-400/60 bg-zinc-900/70 text-xs font-bold md:hidden">
            DASH
          </div>
          <p className="text-sm text-white/90">
            <span className="md:hidden">Tap to dash</span>
            <span className="hidden md:inline">Press to dash</span>
          </p>
        </div>

        {/* Dash into rivals -- the kill / energy-steal mechanic */}
        <div className="flex flex-col items-center gap-2 md:items-center">
          <div className="flex items-center">
            <img src={SHIP_SRC} alt="" className="h-10 w-10 rotate-[150deg]" />
            <ImpactBurst className="h-9 w-9" />
            <img src={SHIP_SRC} alt="" className="h-10 w-10 -rotate-[20deg]" />
          </div>
          <p className="max-w-xs text-center text-sm text-yellow-400">
            Dash into rivals to knock them into the sun and steal their energy
          </p>
        </div>

        <p className="text-lg font-semibold text-yellow-400">
          Grow near the sun
        </p>

        {/* Timer / supernova / black hole */}
        <div className="flex flex-col items-center gap-2 md:items-center">
          <span className="text-2xl font-semibold tabular-nums">04:00</span>
          <p className="max-w-xs text-sm text-red-400 text-center">
            The sun goes supernova when the timer runs out
          </p>
          <div className="mt-1 flex items-center gap-3 md:flex-row-reverse">
            <img
              src="/assets/main/game/black-hole.svg"
              alt=""
              className="h-10 w-10 rounded-full"
            />
            <p className="max-w-[9rem] text-left text-xs text-red-400 md:text-right">
              ...then collapses into a black hole
            </p>
          </div>
        </div>

        <p className="mt-2 animate-pulse text-white/60">
          Tap anywhere to continue
        </p>
      </div>
    </div>
  );
}
