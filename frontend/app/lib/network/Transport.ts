import {BinaryCodec} from "./BinaryCodec";
import {DecodedMessage, WebSocketTypes} from "../models/WebSocketTypes";

export class NetworkTransport {
    private socket: WebSocket | null = null;
    private url: string;
    private pingIntervalId: number | null = null;
    private reconnectTimeoutId: number | null = null;
    private manualDisconnect = false;
    private lastPingSentAt: number | null = null;

    private onStateUpdate: (message: DecodedMessage) => void;
    private onPing?: (latencyMs: number) => void;
    private shouldAutoReconnect?: () => boolean;

    constructor(
        url: string,
        onStateUpdate: (message: DecodedMessage) => void,
        onPing?: (latencyMs: number) => void,
        // Consulted only for an unrequested drop (see handleClose) -- lets the
        // caller veto auto-reconnect for states where silently reviving the
        // connection would be surprising, e.g. while the player is sitting on
        // the death screen with nothing live to resume.
        shouldAutoReconnect?: () => boolean,
    ) {
        this.url = url;
        this.onStateUpdate = onStateUpdate;
        this.onPing = onPing;
        this.shouldAutoReconnect = shouldAutoReconnect;
    }

    public setUrl(url: string) {
        this.url = url;
    }

    public connect(url?: string) {
        if (url) {
            this.url = url;
        }
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

        this.manualDisconnect = false;
        if (this.reconnectTimeoutId) {
            window.clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }

        console.log("Connecting to server");
        this.socket = new WebSocket(this.url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = this.handleOpen.bind(this);
        this.socket.onmessage = this.handleMessage.bind(this);
        this.socket.onclose = this.handleClose.bind(this);
        this.socket.onerror = this.handleError.bind(this);
    }

    public disconnect() {
        this.manualDisconnect = true;
        if (this.reconnectTimeoutId) {
            window.clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }
        // Actually close the socket before cleanup() nulls the reference --
        // otherwise the underlying connection is just abandoned (never sent a
        // close frame), left open and still delivering messages into this same
        // onStateUpdate/onPing until the server's own ping timeout notices.
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.close();
        }
        this.cleanup();
    }

    private handleMessage(event: MessageEvent) {
        if (!(event.data instanceof ArrayBuffer)) {
            console.warn("Received non-binary data. Ignoring.");
            return;
        }
        const decoded = BinaryCodec.decodeMessage(event.data);

        if (decoded) {
            if (decoded.type === WebSocketTypes.PONG && this.lastPingSentAt !== null) {
                this.onPing?.(performance.now() - this.lastPingSentAt);
            }
            this.onStateUpdate(decoded);
        }
    }

    private handleClose(event: CloseEvent) {
        console.log(`WebSocket closed: ${event.code}.`);
        this.cleanup();
        if (!this.manualDisconnect && (this.shouldAutoReconnect?.() ?? true)) {
            console.log("Reconnecting in 2s");
            this.reconnectTimeoutId = window.setTimeout(() => this.connect(), 2000);
        }
    }

    private handleError(error: Event) {
        console.error("WebSocket Error: ", error);
        this.socket?.close(); // Force close to trigger the reconnect logic
    }

    public send(buffer: ArrayBuffer) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(buffer);
        }
    }

    private handleOpen() {
        console.log("WebSocket connected.");
        
        if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);

        if (this.pingIntervalId) window.clearInterval(this.pingIntervalId);

        this.pingIntervalId = window.setInterval(() => this.sendPing(), 2000);
    }

    private sendPing() {
        const pingBuffer = BinaryCodec.encodePing();

        this.lastPingSentAt = performance.now();
        this.send(pingBuffer);
    }

    private cleanup() {
        if (this.pingIntervalId) {
            window.clearInterval(this.pingIntervalId);
            this.pingIntervalId = null;
        }
        this.socket = null;
    }
}