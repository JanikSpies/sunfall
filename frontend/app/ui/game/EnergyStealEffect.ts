import {animate} from "motion";
import {Container, Graphics} from "pixi.js";

const PARTICLE_COUNT = 10;
const PARTICLE_COLORS = [0xfde047, 0xfacc15, 0xfff4c2];
const TRAVEL_DURATION = 0.55;
const STAGGER = 0.03;
const SPAWN_JITTER = 26;

/**
 * Bursts a trail of yellow energy particles from a victim's death point over to the
 * killer's current position, visualizing the energy steal. World-space coordinates --
 * add to the same container the ship sprites live in (e.g. GameMap).
 */
export function playEnergyStealEffect(parent: Container, fromX: number, fromY: number, toX: number, toY: number): void {
  const flash = new Graphics().circle(0, 0, 14).fill({color: 0xfff4c2});
  flash.position.set(fromX, fromY);
  flash.alpha = 0.9;
  parent.addChild(flash);
  animate(flash.scale, {x: 2.5, y: 2.5}, {duration: 0.3, ease: "easeOut"});
  animate(flash, {alpha: 0}, {duration: 0.3, ease: "easeOut"}).finished.then(() => flash.destroy());

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const startX = fromX + (Math.random() - 0.5) * SPAWN_JITTER;
    const startY = fromY + (Math.random() - 0.5) * SPAWN_JITTER;

    const particle = new Graphics()
      .circle(0, 0, 3 + Math.random() * 3)
      .fill({color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]});
    particle.position.set(startX, startY);
    particle.alpha = 0;
    parent.addChild(particle);

    const delay = i * STAGGER;
    const duration = TRAVEL_DURATION + Math.random() * 0.15;

    animate(particle, {alpha: [0, 1, 1, 0]}, {duration, delay})
      .finished.then(() => particle.destroy());
    animate(particle.position, {x: [startX, toX], y: [startY, toY]}, {duration, delay, ease: "easeIn"});
    animate(particle.scale, {x: [1, 0.2], y: [1, 0.2]}, {duration, delay, ease: "easeIn"});
  }
}
