import {create} from 'zustand';
import {NetworkTransport} from '../network/Transport';
import {PlayerState} from '../models/PlayerState';
import {DeathReason, DecodedMessage, ScoreboardEntry, WebSocketTypes} from '../models/WebSocketTypes';

interface DeathEvent {
    reason: DeathReason;
    seq: number;
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
    ping: number;
    showTutorial: boolean;
    setPlayerName: (name: string) => void;
    setLocalPlayerId: (id: number | null) => void;
    setPlayers: (players: Record<number, PlayerState>) => void;
    setMatchState: (worldPhase: number, matchTimer: number, sunScale: number) => void;
    setPing: (ms: number) => void;
    setShowTutorial: (value: boolean) => void;
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
    ping: 0,
    showTutorial: false,
    setPlayerName: (name) => set({ playerName: name }),
    setLocalPlayerId: (id) => set({ localPlayerId: id }),
    setPlayers: (players) => set({ players }),
    setMatchState: (worldPhase, matchTimer, sunScale) => set({ worldPhase, matchTimer, sunScale }),
    setPing: (ms) => set({ ping: ms }),
    setShowTutorial: (value) => set({ showTutorial: value }),
    resetGame: () => set({
        players: {},
        localPlayerId: null,
        isDead: false,
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
            set({ localPlayerId: message.id, isDead: false, deathEvent: null });
        } else if (message.type === WebSocketTypes.WORLD_STATE) {
            set({ players: message.players });
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
                set({ isDead: true });
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

export const initNetwork = (playerName?: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
    const name = playerName || useGameStore.getState().playerName || 'Player';
    const wsUrl = `${baseUrl}?name=${encodeURIComponent(name)}`;

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
        );
    }

    network.connect();
};