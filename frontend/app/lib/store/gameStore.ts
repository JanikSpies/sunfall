import {create} from 'zustand';
import {NetworkTransport} from '../network/Transport';
import {PlayerState} from '../models/PlayerState';
import {DeathReason, DecodedMessage, ScoreboardEntry, WebSocketTypes} from '../models/WebSocketTypes';
import {MOBILE_DEFAULT_BOTTOM_RESERVED, MOBILE_DEFAULT_TOP_RESERVED} from '../layout/titleLayout';

interface DeathEvent {
    reason: DeathReason;
    seq: number;
}

interface DeathStats {
    reason: DeathReason;
    peakEnergy: number;
    survivedSeconds: number | null;
}

interface KillEvent {
    victimName: string;
    energyGained: number;
    victimX: number;
    victimY: number;
    seq: number;
}

interface GameState {
    localPlayerId: number | null;
    players: Record<number, PlayerState>;
    worldPhase: number;
    matchTimer: number;
    sunScale: number;
    scoreboard: ScoreboardEntry[];
    deathEvent: DeathEvent | null;
    killEvent: KillEvent | null;
    matchResetSeq: number;
    playerName: string;
    isDead: boolean;
    // Set a beat after isDead, once the death animation has had time to play --
    // see MainScreen.handleDeathState. Drives <DeathScreen>.
    showDeathScreen: boolean;
    deathStats: DeathStats | null;
    peakEnergy: number;
    joinedAt: number | null;
    // Set by <DeathScreen>'s "Back to Title" button; MainScreen's store
    // subscription picks it up and does the actual navigation/cleanup, since
    // that needs the live MainScreen instance (see MainScreen.leaveMatch).
    returnToTitleRequested: boolean;
    // Set by <DeathScreen>'s "Respawn" button; MainScreen's store
    // subscription picks it up and reconnects in place (see
    // MainScreen.respawnLocal) -- there's only one game right now, so a
    // fresh connection lands back in it.
    respawnRequested: boolean;
    ping: number;
    showTutorial: boolean;
    onTitleScreen: boolean;
    // Real rendered height of the mobile title-stats cards (see
    // TitleStatsPanel), reported in so StartScreen can center its content in
    // the actual space left between them instead of guessing.
    titleCardReserved: { top: number; bottom: number };
    setPlayerName: (name: string) => void;
    setLocalPlayerId: (id: number | null) => void;
    setPlayers: (players: Record<number, PlayerState>) => void;
    setMatchState: (worldPhase: number, matchTimer: number, sunScale: number) => void;
    setPing: (ms: number) => void;
    setShowTutorial: (value: boolean) => void;
    setOnTitleScreen: (value: boolean) => void;
    setTitleCardReserved: (top: number, bottom: number) => void;
    revealDeathScreen: () => void;
    requestReturnToTitle: () => void;
    requestRespawn: () => void;
    resetGame: () => void;
    handleMessage: (message: DecodedMessage) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    localPlayerId: null,
    players: {},
    worldPhase: 0,
    matchTimer: 0,
    sunScale: 1,
    scoreboard: [],
    deathEvent: null,
    killEvent: null,
    matchResetSeq: 0,
    playerName: "",
    isDead: false,
    showDeathScreen: false,
    deathStats: null,
    peakEnergy: 0,
    joinedAt: null,
    returnToTitleRequested: false,
    respawnRequested: false,
    ping: 0,
    showTutorial: false,
    // Defaults false, not true: LoadScreen shows first and has no reason to
    // know about this flag -- StartScreen.show() is what actually flips it
    // once the title screen (and its logo/name/play layout) is really up.
    onTitleScreen: false,
    titleCardReserved: { top: MOBILE_DEFAULT_TOP_RESERVED, bottom: MOBILE_DEFAULT_BOTTOM_RESERVED },
    setPlayerName: (name) => set({ playerName: name }),
    setLocalPlayerId: (id) => set({ localPlayerId: id }),
    setPlayers: (players) => set({ players }),
    setMatchState: (worldPhase, matchTimer, sunScale) => set({ worldPhase, matchTimer, sunScale }),
    setPing: (ms) => set({ ping: ms }),
    setShowTutorial: (value) => set({ showTutorial: value }),
    setOnTitleScreen: (value) => set({ onTitleScreen: value }),
    setTitleCardReserved: (top, bottom) => set({ titleCardReserved: { top, bottom } }),
    revealDeathScreen: () => set({ showDeathScreen: true }),
    requestReturnToTitle: () => set({ returnToTitleRequested: true }),
    requestRespawn: () => set({ respawnRequested: true }),
    resetGame: () => set({
        players: {},
        localPlayerId: null,
        isDead: false,
        showDeathScreen: false,
        deathStats: null,
        peakEnergy: 0,
        joinedAt: null,
        returnToTitleRequested: false,
        respawnRequested: false,
        worldPhase: 0,
        matchTimer: 0,
        sunScale: 1,
        deathEvent: null,
        killEvent: null,
        matchResetSeq: 0,
        ping: 0,
    }),
    handleMessage: (message: DecodedMessage) => {
        if (message.type === WebSocketTypes.CONNECTED) {
            // Deliberately NOT resetting deathEvent here: its seq counter (see the
            // DEATH branch below) must keep incrementing monotonically across a
            // respawn/reconnect. If it restarted from null, a death after
            // reconnecting could land on the same seq MainScreen already saw from
            // the previous life (lastDeathSeq), and the death animation would be
            // silently skipped as a no-op "unchanged" event.
            set({
                localPlayerId: message.id,
                isDead: false,
                showDeathScreen: false,
                deathStats: null,
                peakEnergy: 0,
                joinedAt: Date.now(),
            });
        } else if (message.type === WebSocketTypes.WORLD_STATE) {
            set({ players: message.players });
            const localId = get().localPlayerId;
            const localPlayer = localId !== null ? message.players[localId] : undefined;
            if (localPlayer && localPlayer.energy > get().peakEnergy) {
                set({ peakEnergy: localPlayer.energy });
            }
        } else if (message.type === WebSocketTypes.SCOREBOARD) {
            set({ scoreboard: message.entries });
        } else if (message.type === WebSocketTypes.MATCH_STATE) {
            set({
                worldPhase: message.worldPhase,
                matchTimer: message.matchTimer,
                sunScale: message.sunScale,
            });
        } else if (message.type === WebSocketTypes.DEATH) {
            set({ deathEvent: { reason: message.reason!, seq: get().deathEvent ? get().deathEvent!.seq + 1 : 1 } });
            const localId = get().localPlayerId;
            if (message.deadId === undefined || message.deadId === localId) {
                const joinedAt = get().joinedAt;
                set({
                    isDead: true,
                    deathStats: {
                        reason: message.reason!,
                        peakEnergy: get().peakEnergy,
                        survivedSeconds: joinedAt !== null ? Math.max(0, Math.round((Date.now() - joinedAt) / 1000)) : null,
                    },
                });
            }
        } else if (message.type === WebSocketTypes.MATCH_RESET) {
            set({ matchResetSeq: get().matchResetSeq + 1, isDead: false, deathEvent: null });
        } else if (message.type === WebSocketTypes.KILL) {
            set({
                killEvent: {
                    victimName: message.victimName,
                    energyGained: message.energyGained,
                    victimX: message.victimX,
                    victimY: message.victimY,
                    seq: get().killEvent ? get().killEvent!.seq + 1 : 1,
                },
            });
        }
    },
}));

export let network: NetworkTransport | null = null;

// Stable for the lifetime of the page (not per play session): lets the server
// recognize an automatic reconnect (see NetworkTransport.handleClose) as the
// same player resuming, instead of spawning a duplicate "ghost" entity.
let sessionId: string | null = null;

const getSessionId = (): string => {
    if (!sessionId) {
        sessionId = crypto.randomUUID();
    }
    return sessionId;
};

const CLIENT_ID_STORAGE_KEY = "sunfall_client_id";

// Persisted in localStorage (unlike sessionId above) so it survives page
// reloads and new tabs -- it's how the analytics pipeline recognizes a
// returning player without any account/login. Purely a stats tag: never used
// for gameplay.
export const getClientId = (): string => {
    try {
        const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
        if (existing) return existing;

        const fresh = crypto.randomUUID();
        localStorage.setItem(CLIENT_ID_STORAGE_KEY, fresh);
        return fresh;
    } catch {
        // Storage unavailable (private browsing, disabled storage, etc) -- fall
        // back to a per-load id rather than breaking the connection over it.
        return crypto.randomUUID();
    }
};

export const initNetwork = (playerName?: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
    const name = playerName || useGameStore.getState().playerName || 'Player';
    const wsUrl = `${baseUrl}?name=${encodeURIComponent(name)}&session=${getSessionId()}&client_id=${getClientId()}`;

    if (network) {
        network.setUrl(wsUrl);
    } else {
        network = new NetworkTransport(
            wsUrl,
            (message: DecodedMessage) => {
                useGameStore.getState().handleMessage(message);
            },
            (latencyMs: number) => {
                useGameStore.getState().setPing(Math.round(latencyMs));
            },
            // A drop while dead has nothing live to resume -- auto-reconnecting
            // anyway would silently hand the player a fresh life without their
            // consent, which looks like an unrequested "auto respawn" on the
            // death screen. Respawn/leaveMatch both reconnect explicitly, so
            // this only suppresses the *unrequested* case.
            () => !useGameStore.getState().isDead,
        );
    }

    network.connect();
};