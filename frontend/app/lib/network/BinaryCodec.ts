import {PlayerState} from "../models/PlayerState";
import {DecodedMessage, WebSocketTypes} from "../models/WebSocketTypes";

export class BinaryCodec {
    private static readonly inputBuffer = new ArrayBuffer(4);
    private static readonly inputView = new DataView(BinaryCodec.inputBuffer);
    private static readonly pingBuffer = new Uint8Array([WebSocketTypes.PING]).buffer;
    private static readonly playerPool = new Map<number, PlayerState>();

    public static encodeInput(x: number, y: number, dash: boolean): ArrayBuffer {
        BinaryCodec.inputView.setUint8(0, 0x04);
        BinaryCodec.inputView.setInt8(1, x);
        BinaryCodec.inputView.setInt8(2, y);
        BinaryCodec.inputView.setUint8(3, dash ? 1 : 0);
        
        return BinaryCodec.inputBuffer;
    }

    public static encodePing(): ArrayBuffer {
        return BinaryCodec.pingBuffer;
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

            case WebSocketTypes.WORLD_STATE: {
                const playerCount = view.getInt16(1);
                const players: Record<number, PlayerState> = {}; 
                let offset = 3;
                for (let i = 0; i < playerCount; i++) {
                    const id = view.getInt16(offset);
                    let player = BinaryCodec.playerPool.get(id);
                    if (!player) {
                        player = {
                            id: id,
                            x: 0,
                            y: 0,
                            rotation: 0,
                            energy: 0,
                            size: 0,
                            dashAvailable: false,
                            dashed: false,
                        };
                        BinaryCodec.playerPool.set(id, player);
                    }
                    player.id = id;
                    player.x = view.getFloat32(offset + 2);
                    player.y = view.getFloat32(offset + 6);
                    player.rotation = view.getFloat32(offset + 10);
                    player.energy = view.getFloat32(offset + 14);
                    player.size = view.getUint8(offset + 18);
                    player.dashAvailable = Boolean(view.getUint8(offset + 19));
                    player.dashed = Boolean(view.getUint8(offset + 20));

                    players[id] = player;
                    offset += 21;
                }
                return {
                    type: WebSocketTypes.WORLD_STATE,
                    playerCount: playerCount,
                    players: players,
                };
            }

            case WebSocketTypes.SCOREBOARD: {
                const entryCount = view.getUint16(1);
                const entries = [];
                let offset = 3;
                for (let i = 0; i < entryCount; i++) {
                    entries.push({
                        id: view.getUint16(offset),
                        energy: view.getFloat32(offset + 2),
                    });
                    offset += 6;
                }
                return {
                    type: WebSocketTypes.SCOREBOARD,
                    entries: entries,
                };
            }

            case WebSocketTypes.MATCH_STATE:
                return {
                    type: WebSocketTypes.MATCH_STATE,
                    worldPhase: view.getUint8(1),
                    matchTimer: view.getFloat32(2),
                    sunRadius: view.getFloat32(6)
                };

            default:
                return null;
        }
    }
}