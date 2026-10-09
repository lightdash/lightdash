import { assertUnreachable } from '@lightdash/common';
import { select } from 'd3-selection';
import {
    getSweepDelay,
    SWEEP_DOWN_WEIGHT,
    SWEEP_PX_PER_MS,
    type SweepArea,
    type SweepPoint,
} from '../utils/sweepDelay';
import styles from './DepartmentMap.module.css';

export type ColourTransition = 'sweep' | 'reflow';

// How the people dots change when the map's colouring changes
export const COLOUR_TRANSITION: ColourTransition = 'sweep';

// Each dot's fade to its new colour; the dots' CSS transition reads it while a change runs
const FADE_MS = 380;
const BAND_WIDTH_PX = 160;
// The band's brightest line crosses each dot halfway through the dot's fade
const BAND_LAG_MS = FADE_MS / 2;
// The front's slant: it is this much longer than the height it spans, and the band this much wider
// across than it is thick
const SLANT = Math.hypot(1, SWEEP_DOWN_WEIGHT);

type ColourChange = {
    // The layer the people dots are drawn in: one circle per point, in the same order
    dotsLayer: SVGGElement;
    // Where each dot is on screen, under the zoom of the moment
    points: SweepPoint[];
    // The visible map; the sweep starts at its top-left corner
    area: SweepArea;
    // Over the map, where the band is drawn
    bandLayer: HTMLElement;
};

const prefersReducedMotion = (): boolean =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// One band slanted like the sweep's front, crossing the map with it from off one corner to off the other
const drawBand = (layer: HTMLElement, area: SweepArea) => {
    // When the band's centre is over the middle of the map, and how long it takes to pass a dot
    const centreMs =
        getSweepDelay({ x: area.width / 2, y: area.height / 2 }, area) +
        BAND_LAG_MS;
    const passMs = (BAND_WIDTH_PX * SLANT) / SWEEP_PX_PER_MS;
    const duration =
        getSweepDelay({ x: area.width, y: area.height }, area) +
        BAND_LAG_MS +
        passMs / 2;
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
    return { duration, remove: () => band.remove() };
};

// Called once React has drawn the new colours, before the browser works them out: each dot fades to its
// new colour when the sweep reaches it. Returns a function that ends the change at once.
export const startColourTransition = (
    { dotsLayer, points, area, bandLayer }: ColourChange,
    transition: ColourTransition,
): (() => void) => {
    if (points.length === 0 || prefersReducedMotion()) return () => {};
    const layer = select(dotsLayer);
    const dots = layer.selectChildren<SVGCircleElement, unknown>('circle');
    const delays = points.map((point) => getSweepDelay(point, area));
    layer.style('--colour-fade', `${FADE_MS}ms`);
    dots.style('transition-delay', (_, index) => `${delays[index]}ms`);
    let end = FADE_MS + delays.reduce((last, delay) => Math.max(last, delay));
    let removeBand = () => {};
    switch (transition) {
        case 'sweep': {
            const band = drawBand(bandLayer, area);
            removeBand = band.remove;
            end = Math.max(end, band.duration);
            break;
        }
        // Reflow is drawn where grouping reorders people (the waffle view). Dots on the map never move,
        // so here it is the sweep without the band.
        case 'reflow':
            break;
        default:
            return assertUnreachable(transition, 'Unknown colour transition');
    }
    let isDone = false;
    // Hover, selection and new data change a dot at once again
    const finish = () => {
        if (isDone) return;
        isDone = true;
        dots.style('transition-delay', null);
        layer.style('--colour-fade', null);
        removeBand();
    };
    const timer = window.setTimeout(finish, end);
    return () => {
        window.clearTimeout(timer);
        finish();
    };
};
