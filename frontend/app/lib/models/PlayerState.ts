export interface PlayerState {
    id: number;
    name: string;
    x: number;
    y: number;
    rotation: number;
    energy: number;
    size: number;
    dashAvailable: boolean;
    dashed: boolean;
}
