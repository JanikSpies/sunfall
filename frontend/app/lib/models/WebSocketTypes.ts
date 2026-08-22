import {PlayerState} from "./PlayerState";

export enum WebSocketTypes {
    PING = 0x01,
    PONG = 0x02,
    CONNECTED = 0x03,
    INPUT = 0x04,
    WORLD_STATE = 0x05,
    DEATH = 0x06,
    MATCH_STATE = 0x09,
    MATCH_RESET = 0x0A,
}
export type PongMessage = { type: WebSocketTypes.PONG }
export type ConnectedMessage = { type: WebSocketTypes.CONNECTED; id: number; x: number; y: number; direction: number }
export type WorldStateMessage = { type: WebSocketTypes.WORLD_STATE; playerCount: number, players: Record<number, PlayerState> }
export type DeathMessage = { type: WebSocketTypes.DEATH; deadId?: number; killerId?: number; reason?: number }
export type MatchStateMessage = { type: WebSocketTypes.MATCH_STATE, worldPhase: number, matchTimer: number, sunRadius: number }
export type MatchResetMessage = { type: WebSocketTypes.MATCH_RESET }

export type DecodedMessage = 
    | PongMessage 
    | ConnectedMessage 
    | WorldStateMessage 
    | DeathMessage 
    | MatchStateMessage 
    | MatchResetMessage;
