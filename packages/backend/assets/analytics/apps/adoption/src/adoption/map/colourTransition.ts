// The sweep: a change of colouring crosses the drawing as a diagonal front from the top-left corner, each mark
// fading to its new colour as the front reaches it, with a soft band of light travelling on the front.
// Carried over from the October adoption map.
import type { CSSProperties } from 'react';

// Off: a change of colouring now happens at once, on the map, the waffle and the detail below. Set to true to bring
// the sweep back.
export const SWEEP_ON: boolean = false;

// Slower downwards than across, so the front is a diagonal
export const SWEEP_DOWN_WEIGHT = 0.6;

export type SweepPoint = { x: number; y: number };
export type SweepArea = { width: number; height: number };

// Each mark's fade to its new colour; the marks' CSS transition reads it while a change runs
export const FADE_MS = 80;
// How long the front takes to cross from the top-left corner of the drawing to the bottom-right. With the last
// mark's fade this is the whole change: 0.2 seconds, whatever the size of the drawing.
const SWEEP_CROSS_MS = 120;

// How fast the front moves across the drawing, in pixels a millisecond
const getSweepSpeed = (area: SweepArea): number =>
    Math.max(area.width + SWEEP_DOWN_WEIGHT * area.height, 1) / SWEEP_CROSS_MS;

const clamp = (value: number, max: number): number =>
    Math.min(Math.max(value, 0), max);

// Milliseconds before the sweep reaches a point on screen, given from the visible drawing's top-left corner.
// A point off the visible drawing takes the delay of the nearest point on it.
export const getSweepDelay = (point: SweepPoint, area: SweepArea): number =>
    Math.round(
        (clamp(point.x, area.width) +
            SWEEP_DOWN_WEIGHT * clamp(point.y, area.height)) /
            getSweepSpeed(area),
    );

// What sits below the drawing takes the sweep on as the front passes down to it: each of its marks fades in on the
// same timing as a mark of the drawing at the same place along the front. `x` is how far across (0 to 1) and `y` the
// pixels down from the top of what sits below.
export type FollowSweep = {
    fadeMs: number;
    delayAt: (x: number, y: number) => number;
    // How long the front takes to cross from one place along the width to another
    crossMs: (xFrom: number, xTo: number) => number;
};

export const getFollowSweep = (area: SweepArea, below: number): FollowSweep => ({
    fadeMs: FADE_MS,
    crossMs: (xFrom, xTo) => Math.round(((xTo - xFrom) * area.width) / getSweepSpeed(area)),
    delayAt: (x, y) =>
        Math.round(
            (x * area.width + SWEEP_DOWN_WEIGHT * (area.height + below + y)) / getSweepSpeed(area),
        ),
});

// Spread onto one long mark (a bar) that the sweep wipes in as one piece, from the left edge at `xFrom` to the right
// edge at `xTo`, so it fills smoothly rather than in parts
export const wipeProps = (
    sweep: FollowSweep | null,
    xFrom: number,
    xTo: number,
    y: number,
): { 'data-sweep-wipe'?: string; style?: CSSProperties } =>
    sweep
        ? {
              'data-sweep-wipe': '',
              style: {
                  '--wipe-delay': `${sweep.delayAt(xFrom, y)}ms`,
                  '--wipe-ms': `${sweep.crossMs(xFrom, xTo) + sweep.fadeMs}ms`,
              } as CSSProperties,
          }
        : {};

// Spread onto a mark that populates with the sweep; nothing when there is no sweep
export const sweepProps = (
    sweep: FollowSweep | null,
    x: number,
    y: number,
): { 'data-sweep'?: string; style?: CSSProperties } =>
    sweep
        ? {
              'data-sweep': '',
              style: {
                  '--fade-delay': `${sweep.delayAt(x, y)}ms`,
                  '--fade-ms': `${sweep.fadeMs}ms`,
              } as CSSProperties,
          }
        : {};
const BAND_WIDTH_PX = 160;
// The band's brightest line crosses each mark halfway through the mark's fade
const BAND_LAG_MS = FADE_MS / 2;
// When the band's animation never ends (a hidden tab), it goes this long after it should have
const BAND_FALLBACK_MS = 100;
// The front's slant: it is this much longer than the height it spans, and the band this much wider
// across than it is thick
const SLANT = Math.hypot(1, SWEEP_DOWN_WEIGHT);

type ColourChange = {
    // Holds the fade's length while the change runs
    layer: HTMLElement | SVGElement;
    // People's dots or squares, one per point and in the same order
    marks: Element[];
    // Where each mark is on screen, under the zoom of the moment
    points: SweepPoint[];
    // The visible drawing; the sweep starts at its top-left corner
    area: SweepArea;
    // Over the drawing, where the band is drawn
    bandLayer: HTMLElement;
    // False to fade each mark straight from its old colour to its new one, with no moment where the drawing is empty.
    // The waffle does this: with a square for every person, an empty drawing reads as a lag.
    blank?: boolean;
};

const prefersReducedMotion = (): boolean =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// One band slanted like the sweep's front, crossing the drawing with it from off one corner to off the other.
// It goes when its animation ends; the function returned takes it away sooner.
const drawBand = (layer: HTMLElement, area: SweepArea): (() => void) => {
    // When the band's centre is over the middle of the drawing, and how long it takes to pass a mark
    const centreMs =
        getSweepDelay({ x: area.width / 2, y: area.height / 2 }, area) +
        BAND_LAG_MS;
    const speed = getSweepSpeed(area);
    const passMs = (BAND_WIDTH_PX * SLANT) / speed;
    const duration = Math.round(
        getSweepDelay({ x: area.width, y: area.height }, area) +
            BAND_LAG_MS +
            passMs / 2,
    );
    // How far right of the drawing's middle the band is, a given time after the change
    const offsetAt = (ms: number) => `${(ms - centreMs) * speed}px`;
    const band = document.createElement('div');
    band.className = 'ad-sweep-band';
    band.style.width = `${BAND_WIDTH_PX}px`;
    band.style.height = `${(area.height + BAND_WIDTH_PX) * SLANT}px`;
    band.style.animationDuration = `${duration}ms`;
    band.style.setProperty('--sweep-angle', `${Math.atan(SWEEP_DOWN_WEIGHT)}rad`);
    band.style.setProperty('--sweep-from', offsetAt(0));
    band.style.setProperty('--sweep-to', offsetAt(duration));
    layer.appendChild(band);
    const remove = () => {
        window.clearTimeout(fallback);
        band.remove();
    };
    const fallback = window.setTimeout(remove, duration + BAND_FALLBACK_MS);
    band.addEventListener('animationend', remove);
    return remove;
};

// Fades each mark to the colour React has just drawn once the sweep reaches it. Stopping it early takes the band
// away at once; fades already started finish on their own timing.
export const startColourSweep = ({
    layer,
    marks,
    points,
    area,
    bandLayer,
    blank = true,
}: ColourChange): (() => void) => {
    if (!SWEEP_ON || marks.length === 0 || prefersReducedMotion()) return () => {};
    const delays = points.map((point) => getSweepDelay(point, area));
    const removeBand = drawBand(bandLayer, area);
    const styled = marks as (HTMLElement | SVGElement)[];
    // The old colours go at once: the marks are blanked with no transition and the browser is made to take that
    // look in, so the fade that follows starts from nothing. The sweep then brings each mark's new colour in.
    if (blank) {
        layer.setAttribute('data-blank', '');
        void layer.getBoundingClientRect();
        void window.getComputedStyle(styled[0]).fill;
    }
    layer.style.setProperty('--colour-fade', `${FADE_MS}ms`);
    styled.forEach((mark, index) => {
        mark.style.transitionDelay = `${delays[index] ?? 0}ms`;
    });
    layer.removeAttribute('data-blank');
    let cleared = false;
    // Hover, selection and new data change a mark at once again
    const clearMarks = () => {
        if (cleared) return;
        cleared = true;
        styled.forEach((mark) => {
            mark.style.transitionDelay = '';
        });
        layer.style.removeProperty('--colour-fade');
        layer.removeAttribute('data-blank');
    };
    const timer = window.setTimeout(
        clearMarks,
        FADE_MS + delays.reduce((last, delay) => Math.max(last, delay), 0),
    );
    return () => {
        window.clearTimeout(timer);
        clearMarks();
        removeBand();
    };
};
