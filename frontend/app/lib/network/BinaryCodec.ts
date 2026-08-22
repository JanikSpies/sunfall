import { PlayerState } from "../models/PlayerState";
import { DecodedMessage, WebSocketTypes } from "../models/WebSocketTypes";

export class BinaryCodec {
    public static encodeInput(inputX: number, inputY: number, isDashing: boolean): ArrayBuffer {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);

        view.setInt8(0, WebSocketTypes.INPUT);
        view.setInt8(1, inputX);
        view.setInt8(2, inputY);
        view.setUint8(3, isDashing ? 1 : 0);

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

            default:
                console.warn(`Unknown WebSocket message type received: ${type}`);
                return null;
        }
    }
}