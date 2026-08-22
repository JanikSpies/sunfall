import {create} from 'zustand';
import {NetworkTransport} from '../network/Transport';
import {PlayerState} from '../models/PlayerState';
import {DecodedMessage, ScoreboardEntry, WebSocketTypes} from '../models/WebSocketTypes';

interface GameState {
    localPlayerId: number | null;
    players: Record<number, PlayerState>;
    worldPhase: number;
    matchTimer: number;
    sunRadius: number;
    scoreboard: ScoreboardEntry[];
    setLocalPlayerId: (id: number | null) => void;
    setPlayers: (players: Record<number, PlayerState>) => void;
    setMatchState: (worldPhase: number, matchTimer: number, sunRadius: number) => void;
    handleMessage: (message: DecodedMessage) => void;
}

export const useGameStore = create<GameState>((set) => ({
    localPlayerId: null,
    players: {},
    worldPhase: 0,
    matchTimer: 0,
    sunRadius: 150,
    scoreboard: [],
    setLocalPlayerId: (id) => set({ localPlayerId: id }),
    setPlayers: (players) => set({ players }),
    setMatchState: (worldPhase, matchTimer, sunRadius) => set({ worldPhase, matchTimer, sunRadius }),
    handleMessage: (message: DecodedMessage) => {
        if (message.type === WebSocketTypes.CONNECTED) {
            set({ localPlayerId: message.id });
        } else if (message.type === WebSocketTypes.WORLD_STATE) {
            set({ players: message.players });
        } else if (message.type === WebSocketTypes.SCOREBOARD) {
            set({ scoreboard: message.entries });
        } else if (message.type === WebSocketTypes.MATCH_STATE) {
            set({
                worldPhase: message.worldPhase,
                matchTimer: message.matchTimer,
                sunRadius: message.sunRadius,
            });
        }
    },
}));

export let network: NetworkTransport | null = null;

export const initNetwork = () => {
    if (network) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';

    network = new NetworkTransport(wsUrl, (message: DecodedMessage) => {
        useGameStore.getState().handleMessage(message);
    });

    network.connect();
};