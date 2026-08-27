import {isMobile} from "pixi.js";
import type {PlayerState} from "../../lib/models/PlayerState";
import {BaseRocket} from "./BaseRocket";
import {Label} from "@/app/ui/menu/Label";

export class EnemyRocket extends BaseRocket {

    private readonly nameLabel: Label;

    constructor() {
        super();
        // The engine renders at a minimum internal resolution (see resizeOptions in
        // GameCanvas) and scales that down to fit the real screen -- on phones that
        // downscale is much more aggressive than on desktop, so a fixed font size that
        // reads fine on desktop shrinks to near-illegible on a phone (same problem the
        // energy bar's isTouchDevice scale bump exists for, see MainScreen).
        const touch = isMobile.phone;
        this.nameLabel = new Label({
            text: "",
            style: {
                fontSize: touch ? 24 : 16,
                fill: 0xffffff,
                stroke: {color: 0x000000, width: touch ? 4 : 3},
                fontWeight: "bold",
                fontFamily: "Science Gothic",
            },
        });
        this.nameLabel.position.set(0, touch ? -42 : -36);
        this.addChild(this.nameLabel);
    }

    /** Apply authoritative server PlayerState to update position, rotation, and visual stage */
    public applyPlayerState(state: PlayerState): void {
        super.applyBaseState(state);
        this.nameLabel.text = state.name || "Player";
        this.nameLabel.rotation = -this.rotation;
    }

    public reset(): void {
        super.reset();
        this.nameLabel.rotation = 0;
    }
}
