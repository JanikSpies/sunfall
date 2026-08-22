import {BinaryCodec} from "./BinaryCodec";
import {DecodedMessage} from "../models/WebSocketTypes";

export class NetworkTransport {
    private socket: WebSocket | null = null;
    private url: string;
    private pingIntervalId: number | null = null;
    private reconnectTimeoutId: number | null = null;

    private onStateUpdate: (message: DecodedMessage) => void; 

    constructor(url: string, onStateUpdate: (message: DecodedMessage) => void) {
        this.url = url;
        this.onStateUpdate = onStateUpdate;
    }

    public connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

        console.log("Connecting to server");
        this.socket = new WebSocket(this.url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = this.handleOpen.bind(this);
        this.socket.onmessage = this.handleMessage.bind(this);
        this.socket.onclose = this.handleClose.bind(this);
        this.socket.onerror = this.handleError.bind(this);
    }

    private handleMessage(event: MessageEvent) {
        if (!(event.data instanceof ArrayBuffer)) {
            console.warn("Received non-binary data. Ignoring.");
            return;
        }
        const decoded = BinaryCodec.decodeMessage(event.data);
        
        if (decoded) {
            this.onStateUpdate(decoded);
        }
    }

    private handleClose(event: CloseEvent) {
        console.log(`WebSocket closed: ${event.code}. Reconnecting in 2s`);
        this.cleanup();
        this.reconnectTimeoutId = window.setTimeout(() => this.connect(), 2000);
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