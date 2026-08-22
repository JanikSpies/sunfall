import {create} from 'zustand';
import {NetworkTransport} from '../network/Transport';
import {PlayerState} from '../models/PlayerState';
import {DecodedMessage, WebSocketTypes} from '../models/WebSocketTypes';

interface GameState {
    localPlayerId: number | null;
    players: Record<number, PlayerState>;
    setLocalPlayerId: (id: number | null) => void;
    setPlayers: (players: Record<number, PlayerState>) => void;
    handleMessage: (message: DecodedMessage) => void;
}

export const useGameStore = create<GameState>((set) => ({
    localPlayerId: null,
    players: {},
    setLocalPlayerId: (id) => set({ localPlayerId: id }),
    setPlayers: (players) => set({ players }),
    handleMessage: (message: DecodedMessage) => {
        if (message.type === WebSocketTypes.CONNECTED) {
            set({ localPlayerId: message.id });
        } else if (message.type === WebSocketTypes.WORLD_STATE) {
            set({ players: message.players });
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