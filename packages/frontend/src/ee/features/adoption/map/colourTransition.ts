import { assertUnreachable } from '@lightdash/common';
import { select, selectAll } from 'd3-selection';
import {
    getSweepDelay,
    SWEEP_DOWN_WEIGHT,
    SWEEP_PX_PER_MS,
    type SweepArea,
    type SweepPoint,
} from '../utils/sweepDelay';
import styles from './DepartmentMap.module.css';

export type ColourTransition = 'sweep' | 'reflow';

// How people's dots and squares change when the colouring changes
export const COLOUR_TRANSITION: ColourTransition = 'sweep';

// Each mark's fade to its new colour; the marks' CSS transition reads it while a change runs
const FADE_MS = 380;
// In a reflow, a mark's glide to its new place, which starts with its fade
const MOVE_MS = 640;
// In a reflow, how long a mark waits for each place before its old one, so the reorder runs through a part
const REFLOW_STAGGER_MS = 0.3;
const BAND_WIDTH_PX = 160;
// The band's brightest line crosses each dot halfway through the dot's fade
const BAND_LAG_MS = FADE_MS / 2;
// When the band's animation never ends (a hidden tab), it goes this long after it should have
const BAND_FALLBACK_MS = 100;
// The front's slant: it is this much longer than the height it spans, and the band this much wider
// across than it is thick
const SLANT = Math.hypot(1, SWEEP_DOWN_WEIGHT);

type ColourChange = {
    // Holds the fade's length, and a glide's, while the change runs
    layer: HTMLElement | SVGElement;
    // People's dots or squares, one per point and in the same order
    marks: Element[];
    // Where each mark is on screen, under the zoom of the moment
    points: SweepPoint[];
    // The visible drawing; the sweep starts at its top-left corner
    area: SweepArea;
    // Over the drawing, where the band is drawn
    bandLayer: HTMLElement;
    // Where grouping moves people (the waffle), each mark's place before the change; null where marks never move
    previousIndexes: number[] | null;
};

const prefersReducedMotion = (): boolean =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// One band slanted like the sweep's front, crossing the map with it from off one corner to off the other.
// It goes when its animation ends; the function returned takes it away sooner.
const drawBand = (layer: HTMLElement, area: SweepArea): (() => void) => {
    // When the band's centre is over the middle of the map, and how long it takes to pass a dot
    const centreMs =
        getSweepDelay({ x: area.width / 2, y: area.height / 2 }, area) +
        BAND_LAG_MS;
    const passMs = (BAND_WIDTH_PX * SLANT) / SWEEP_PX_PER_MS;
    const duration = Math.round(
        getSweepDelay({ x: area.width, y: area.height }, area) +
            BAND_LAG_MS +
            passMs / 2,
    );
    // How far right of the map's middle the band is, a given time after the change
    const offsetAt = (ms: number) => `${(ms - centreMs) * SWEEP_PX_PER_MS}px`;
    const band = select(layer)
        .append('div')
        .attr('class', styles.sweepBand)
        .style('width', `${BAND_WIDTH_PX}px`)
        .style('height', `${(area.height + BAND_WIDTH_PX) * SLANT}px`)
        .style('animation-duration', `${duration}ms`)
        .style('--sweep-angle', `${Math.atan(SWEEP_DOWN_WEIGHT)}rad`)
        .style('--sweep-from', offsetAt(0))
        .style('--sweep-to', offsetAt(duration));
    const remove = () => {
        window.clearTimeout(fallback);
        band.remove();
    };
    const fallback = window.setTimeout(remove, duration + BAND_FALLBACK_MS);
    band.on('animationend', remove);
    return remove;
};

// Fades each mark to the colour React has just drawn once the change reaches it, and in a reflow glides it to its new
// place. Stopping it early takes the band away at once; fades and glides already started finish on their own timing.
export const startColourTransition = (
    { layer, marks, points, area, bandLayer, previousIndexes }: ColourChange,
    transition: ColourTransition,
): (() => void) => {
    if (marks.length === 0 || prefersReducedMotion()) return () => {};
    const container = select(layer);
    const sweepDelays = () => points.map((point) => getSweepDelay(point, area));
    let delays: number[];
    let length = FADE_MS;
    let removeBand = () => {};
    switch (transition) {
        case 'sweep':
            delays = sweepDelays();
            removeBand = drawBand(bandLayer, area);
            break;
        // Grouping reorders people, so each one glides to their new place. Dots on the map never move, so there it is
        // the sweep without the band
        case 'reflow':
            if (previousIndexes === null) {
                delays = sweepDelays();
            } else {
                delays = previousIndexes.map((index) =>
                    Math.round(index * REFLOW_STAGGER_MS),
                );
                container.style('--colour-move', `${MOVE_MS}ms`);
                length = MOVE_MS;
            }
            break;
        default:
            return assertUnreachable(transition, 'Unknown colour transition');
    }
    container.style('--colour-fade', `${FADE_MS}ms`);
    const changed = selectAll(marks);
    changed.style('transition-delay', (_, index) => `${delays[index]}ms`);
    let areMarksCleared = false;
    // Hover, selection and new data change a mark at once again
    const clearMarks = () => {
        if (areMarksCleared) return;
        areMarksCleared = true;
        changed.style('transition-delay', null);
        container.style('--colour-fade', null).style('--colour-move', null);
    };
    const timer = window.setTimeout(
        clearMarks,
        length + delays.reduce((last, delay) => Math.max(last, delay), 0),
    );
    return () => {
        window.clearTimeout(timer);
        clearMarks();
        removeBand();
    };
};
