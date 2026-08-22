import {create} from 'zustand';
import {NetworkTransport} from '../network/Transport';
import {PlayerState} from '../models/PlayerState';
import {DeathReason, DecodedMessage, WebSocketTypes} from '../models/WebSocketTypes';

interface DeathEvent {
    reason: DeathReason;
    seq: number;
}

interface GameState {
    localPlayerId: number | null;
    players: Record<number, PlayerState>;
    worldPhase: number;
    matchTimer: number;
    sunRadius: number;
    deathEvent: DeathEvent | null;
    matchResetSeq: number;
    playerName: string;
    isDead: boolean;
    setPlayerName: (name: string) => void;
    setLocalPlayerId: (id: number | null) => void;
    setPlayers: (players: Record<number, PlayerState>) => void;
    setMatchState: (worldPhase: number, matchTimer: number, sunRadius: number) => void;
    resetGame: () => void;
    handleMessage: (message: DecodedMessage) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    localPlayerId: null,
    players: {},
    worldPhase: 0,
    matchTimer: 0,
    sunRadius: 150,
    deathEvent: null,
    matchResetSeq: 0,
    playerName: "",
    isDead: false,
    setPlayerName: (name) => set({ playerName: name }),
    setLocalPlayerId: (id) => set({ localPlayerId: id }),
    setPlayers: (players) => set({ players }),
    setMatchState: (worldPhase, matchTimer, sunRadius) => set({ worldPhase, matchTimer, sunRadius }),
    resetGame: () => set({
        players: {},
        localPlayerId: null,
        isDead: false,
        worldPhase: 0,
        matchTimer: 0,
        sunRadius: 150,
    }),
    handleMessage: (message: DecodedMessage) => {
        if (message.type === WebSocketTypes.CONNECTED) {
            set({ localPlayerId: message.id, isDead: false });
        } else if (message.type === WebSocketTypes.WORLD_STATE) {
            set({ players: message.players });
        } else if (message.type === WebSocketTypes.MATCH_STATE) {
            set({
                worldPhase: message.worldPhase,
                matchTimer: message.matchTimer,
                sunRadius: message.sunRadius,
            });
        } else if (message.type === WebSocketTypes.DEATH) {
            set({ deathEvent: { reason: message.reason!, seq: get().deathEvent ? get().deathEvent!.seq + 1 : 1 } });
            const localId = get().localPlayerId;
            if (message.deadId === undefined || message.deadId === localId) {
                set({ isDead: true });
            }
        } else if (message.type === WebSocketTypes.MATCH_RESET) {
            set({ matchResetSeq: get().matchResetSeq + 1 });
            set({ isDead: false });
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
        network = new NetworkTransport(wsUrl, (message: DecodedMessage) => {
            useGameStore.getState().handleMessage(message);
        });
    }

    network.connect();
};