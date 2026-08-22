import {Container} from "pixi.js";
import {RoundedBox} from "../menu/RoundedBox";
import {Label} from "../menu/Label";
import type {ScoreboardEntry} from "@/app/lib/models/WebSocketTypes";

const MAX_VISIBLE_ENTRIES = 5;
const WIDTH = 220;
const ROW_HEIGHT = 26;
const PADDING_Y = 14;
const PADDING_X = 16;

const LOCAL_PLAYER_COLOR = 0xffd166;
const OTHER_PLAYER_COLOR = 0xffffff;

/** Very simple, half-transparent list of the top players by energy. */
export class Scoreboard extends Container {
  private background: RoundedBox;
  private rows: Label[] = [];

  constructor() {
    super();

    this.background = new RoundedBox({
      width: WIDTH,
      height: PADDING_Y * 2 + ROW_HEIGHT * MAX_VISIBLE_ENTRIES,
      shadow: false,
      color: 0x0a0a1a,
    });
    this.background.alpha = 0.5;
    this.addChild(this.background);

    for (let i = 0; i < MAX_VISIBLE_ENTRIES; i++) {
      const row = new Label({
        text: "",
        style: {fontSize: 16, fill: OTHER_PLAYER_COLOR},
      });
      row.anchor.set(0, 0.5);
      row.x = -this.background.boxWidth * 0.5 + PADDING_X;
      row.y = -this.background.boxHeight * 0.5 + PADDING_Y + ROW_HEIGHT * (i + 0.5);
      this.rows.push(row);
      this.addChild(row);
    }
  }

  /** Update the displayed rows from the latest scoreboard entries, highlighting the local player. */
  public setEntries(entries: ScoreboardEntry[], localPlayerId: number | null): void {
    for (let i = 0; i < this.rows.length; i++) {
      const entry = entries[i];
      const row = this.rows[i];

      if (!entry) {
        row.text = "";
        continue;
      }

      row.text = `${i + 1}. Player ${entry.id}  ${Math.round(entry.energy)}`;
      row.style.fill = entry.id === localPlayerId ? LOCAL_PLAYER_COLOR : OTHER_PLAYER_COLOR;
    }
  }
}
