// A change of colouring sweeps from the top-left corner of the visible map, 2.2 px a millisecond
// across and slower downwards, so its front is a diagonal
export const SWEEP_PX_PER_MS = 2.2;
export const SWEEP_DOWN_WEIGHT = 0.6;

export type SweepPoint = { x: number; y: number };
export type SweepArea = { width: number; height: number };

const clamp = (value: number, max: number): number =>
    Math.min(Math.max(value, 0), max);

// Milliseconds before the sweep reaches a point on screen, given from the visible map's top-left corner.
// A point off the visible map takes the delay of the nearest point on it.
export const getSweepDelay = (point: SweepPoint, area: SweepArea): number =>
    Math.round(
        (clamp(point.x, area.width) +
            SWEEP_DOWN_WEIGHT * clamp(point.y, area.height)) /
            SWEEP_PX_PER_MS,
    );
