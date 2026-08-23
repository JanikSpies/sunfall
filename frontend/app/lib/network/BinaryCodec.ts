import {PlayerState} from "../models/PlayerState";
import {DecodedMessage, WebSocketTypes} from "../models/WebSocketTypes";

export class BinaryCodec {
    private static readonly inputBuffer = new ArrayBuffer(4);
    private static readonly inputView = new DataView(BinaryCodec.inputBuffer);
    private static readonly pingBuffer = new Uint8Array([WebSocketTypes.PING]).buffer;
    private static readonly playerPool: Record<number, PlayerState> = {};
    private static readonly activeIds: number[] = [];
    private static readonly textDecoder = new TextDecoder();

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
                const players = BinaryCodec.playerPool;
                BinaryCodec.activeIds.length = 0;
                let offset = 3;
                for (let i = 0; i < playerCount; i++) {
                    const id = view.getInt16(offset);
                    const x = view.getFloat32(offset + 2);
                    const y = view.getFloat32(offset + 6);
                    const rotation = view.getFloat32(offset + 10);
                    const energy = view.getFloat32(offset + 14);
                    const size = view.getUint8(offset + 18);
                    const dashAvailable = Boolean(view.getUint8(offset + 19));
                    const dashed = Boolean(view.getUint8(offset + 20));

                    let name = "Player";
                    let entrySize = 21;

                    if (view.byteLength > offset + 21) {
                        const nameLen = view.getUint8(offset + 21);
                        entrySize = 22 + nameLen;
                        if (view.byteLength >= offset + entrySize) {
                            const nameBytes = new Uint8Array(buffer, offset + 22, nameLen);
                            name = BinaryCodec.textDecoder.decode(nameBytes) || "Player";
                        }
                    }

                    BinaryCodec.activeIds.push(id);

                    let player = players[id];
                    if (!player) {
                        player = {
                            id,
                            name,
                            x,
                            y,
                            rotation,
                            energy,
                            size,
                            dashAvailable,
                            dashed,
                        };
                        players[id] = player;
                    } else {
                        player.id = id;
                        player.name = name;
                        player.x = x;
                        player.y = y;
                        player.rotation = rotation;
                        player.energy = energy;
                        player.size = size;
                        player.dashAvailable = dashAvailable;
                        player.dashed = dashed;
                    }

                    offset += entrySize;
                }

                for (const key in players) {
                    const numId = Number(key);
                    if (!BinaryCodec.activeIds.includes(numId)) {
                        delete players[numId];
                    }
                }

                return {
                    type: WebSocketTypes.WORLD_STATE,
                    playerCount,
                    players,
                };
            }

            case WebSocketTypes.SCOREBOARD: {
                const entryCount = view.getUint16(1);
                const entries = [];
                let offset = 3;
                const decoder = new TextDecoder();
                for (let i = 0; i < entryCount; i++) {
                    const id = view.getUint16(offset);
                    const energy = view.getFloat32(offset + 2);
                    const nameLen = view.getUint8(offset + 6);
                    const nameBytes = new Uint8Array(buffer, offset + 7, nameLen);
                    const name = decoder.decode(nameBytes) || "Player";

                    entries.push({ id, name, energy });
                    offset += 7 + nameLen;
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
                    sunScale: view.getFloat32(6)
                };

            case WebSocketTypes.DEATH: {
                const reason = view.byteLength >= 2 ? view.getUint8(1) : 0;
                const deadId = view.byteLength >= 3 ? view.getUint16(1) : undefined;
                const killerId = view.byteLength >= 5 ? view.getUint16(3) : undefined;
                return {
                    type: WebSocketTypes.DEATH,
                    reason,
                    deadId,
                    killerId,
                };
            }

            case WebSocketTypes.MATCH_RESET:
                return { type: WebSocketTypes.MATCH_RESET };

            default:
                return null;
        }
    }
}