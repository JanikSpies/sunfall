import type {PlayerState} from "../../lib/models/PlayerState";
import {BaseRocket} from "./BaseRocket";
import {Label} from "@/app/ui/menu/Label";

export class EnemyRocket extends BaseRocket {

    private readonly nameLabel: Label;

    constructor() {
        super();
        this.nameLabel = new Label({
            text: "",
            style: {
                fontSize: 16,
                fill: 0xffffff,
                stroke: {color: 0x000000, width: 3},
                fontWeight: "bold",
                fontFamily: "Science Gothic",
            },
        });
        this.nameLabel.position.set(0, -36);
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
