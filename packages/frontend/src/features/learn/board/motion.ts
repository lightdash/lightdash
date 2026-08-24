// Board motion. Twin: lightdash-university academy/board/motion.ts.
// A change here lands in both repositories in the same piece of work.

import type { Seat } from './layout';

export const NODE_TRANSITION =
    'opacity .3s ease-out, transform .34s ease-out, left .44s cubic-bezier(.2,.7,.3,1), top .44s cubic-bezier(.2,.7,.3,1)';

const STAGGER_STEP_MS = 28;
const STAGGER_CYCLE = 10;

export const staggerMs = (index: number): number =>
    (index % STAGGER_CYCLE) * STAGGER_STEP_MS;

export type MotionInput = {
    unlocked: boolean;
    wasUnlocked: boolean;
    seat: Seat;
    prevSeat: Seat | null;
    origin: Seat | null;
    burst: boolean;
    reducedMotion: boolean;
};

export type NodeMotion = {
    x: number;
    y: number;
    opacity: number;
    scale: number;
    animate: boolean;
};

const LOCKED_SCALE = 0.3;
const BORN_SCALE = 0.25;
const DYING_SCALE = 0.2;

export const resolveMotion = (input: MotionInput): NodeMotion => {
    const {
        unlocked,
        wasUnlocked,
        seat,
        prevSeat,
        origin,
        burst,
        reducedMotion,
    } = input;
    const settled: NodeMotion = unlocked
        ? {
              x: seat.x,
              y: seat.y,
              opacity: 1,
              scale: 1,
              animate: !reducedMotion,
          }
        : {
              x: seat.x,
              y: seat.y,
              opacity: 0,
              scale: LOCKED_SCALE,
              animate: !reducedMotion,
          };

    if (reducedMotion || origin === null) return settled;

    const born = unlocked && !wasUnlocked;
    const dying = !unlocked && wasUnlocked;

    if (born && burst) {
        return {
            x: origin.x,
            y: origin.y,
            opacity: 0.5,
            scale: BORN_SCALE,
            animate: false,
        };
    }
    if (dying) {
        if (burst) {
            const from = prevSeat ?? origin;
            return {
                x: from.x,
                y: from.y,
                opacity: 1,
                scale: 1,
                animate: false,
            };
        }
        return {
            x: origin.x,
            y: origin.y,
            opacity: 0,
            scale: DYING_SCALE,
            animate: true,
        };
    }
    return settled;
};
