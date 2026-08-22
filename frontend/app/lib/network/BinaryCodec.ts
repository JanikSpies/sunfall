import { PlayerState } from "../models/PlayerState";
import { DecodedMessage, WebSocketTypes } from "../models/WebSocketTypes";

export class BinaryCodec {
    public static encodeInput(x: number, y: number, dash: boolean): ArrayBuffer {
        const buffer = new ArrayBuffer(4); 
        const view = new DataView(buffer);
        
        view.setUint8(0, 0x04);
        view.setInt8(1, x);
        view.setInt8(2, y);
        view.setUint8(3, dash ? 1 : 0);
        
        return buffer;
    }

    public static encodePing(): ArrayBuffer {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setInt8(0, WebSocketTypes.PING);
        return buffer;
    }

    public static decodeMessage(buffer: ArrayBuffer): DecodedMessage | null {
        const view = new DataView(buffer);
        const type = view.getInt8(0);

        switch (type) {
            case WebSocketTypes.PONG:
                return { type: WebSocketTypes.PONG };

            case WebSocketTypes.CONNECTED:
                return {
                    type: WebSocketTypes.CONNECTED,
                    id: view.getInt16(1),
                    x: view.getFloat32(3),
                    y: view.getFloat32(7),
                    direction: view.getFloat32(11)
                };

            case WebSocketTypes.WORLD_STATE:
                const playerCount = view.getInt16(1);
                const players: Record<number, PlayerState> = {}; 
                let offset = 3;
                for (let i = 0; i < playerCount; i++) {
                    const id = view.getInt16(offset);
                    players[id] = {
                        id: id,
                        x: view.getFloat32(offset + 2),
                        y: view.getFloat32(offset + 6),
                        rotation: view.getFloat32(offset + 10),
                        energy: view.getFloat32(offset + 14),
                        size: view.getUint8(offset + 18),
                        dashAvailable: Boolean(view.getUint8(offset + 19))
                    };
                    offset += 20;
                }
                return {
                    type: WebSocketTypes.WORLD_STATE,
                    playerCount: playerCount,
                    players: players,
                }

            case WebSocketTypes.MATCH_STATE:
                return {
                    type: WebSocketTypes.MATCH_STATE,
                    worldPhase: view.getUint8(1),
                    matchTime: view.getFloat32(2),
                    sunRadius: view.getFloat32(6)
                }

            default:
                console.warn(`Unknown WebSocket message type received: ${type}`);
                return null;
        }
    }
}