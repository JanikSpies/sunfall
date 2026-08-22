import { BinaryCodec } from "./BinaryCodec";

export class NetworkTransport {
    private socket: WebSocket | null = null;
    private url: string;
    private pingIntervalId: number | null = null;
    private reconnectTimeoutId: number | null = null;

    private onStateUpdate: (data: ArrayBuffer) => void; 

    constructor(url: string, onStateUpdate: (data: ArrayBuffer) => void) {
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

    private handleOpen() {
        console.log("WebSocket connected.");
        // Clear any pending reconnects
        if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);

        this.pingIntervalId = window.setInterval(() => this.sendPing(), 2000);
    }

    private handleMessage(event: MessageEvent) {
        if (!(event.data instanceof ArrayBuffer)) {
            console.warn("Received non-binary data. Ignoring.");
            return;
        }
        const decoded = BinaryCodec.decodeMessage(event.data);
        
        if (decoded) {
            console.log("Successfully decoded message:", decoded);
            // Later: this.onStateUpdate(decoded);
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

    private sendPing() {
        // this.send(BinaryMaker.createPing());
        const tempBuffer = new ArrayBuffer(1);
        const view = new DataView(tempBuffer);
        view.setUint8(0, 0x02);
        this.send(tempBuffer);
    }

    public send(buffer: ArrayBuffer) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(buffer);
        }
    }

    private cleanup() {
        if (this.pingIntervalId) window.clearInterval(this.pingIntervalId);
        this.socket = null;
    }
}