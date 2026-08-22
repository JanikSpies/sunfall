import { create } from 'zustand';
import { NetworkTransport } from '../network/Transport';

interface GameState {
    players: any[];
    setPlayers: (players: any[]) => void;
}

export const useGameStore = create<GameState>((set) => ({
    players: [],
    setPlayers: (players) => set({ players }),
}));

export let network: NetworkTransport | null = null;

export const initNetwork = () => {
    if (network) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';

    network = new NetworkTransport(wsUrl, (data) => {
        const view = new DataView(data);
        console.log("Received buffer! Byte 0:", view.getUint8(0));
    });

    network.connect();
};