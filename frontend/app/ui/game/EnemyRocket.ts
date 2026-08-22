import type {PlayerState} from "../../lib/models/PlayerState";
import {BaseRocket} from "./BaseRocket";

export class EnemyRocket extends BaseRocket {
  /** Apply authoritative server PlayerState to update position, rotation, and visual stage */
  public applyPlayerState(state: PlayerState): void {
    super.applyBaseState(state);
  }
}
