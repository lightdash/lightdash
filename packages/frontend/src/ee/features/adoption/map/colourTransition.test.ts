import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    startColourTransition,
    type ColourTransition,
} from './colourTransition';

const SVG = 'http://www.w3.org/2000/svg';
const AREA = { width: 1200, height: 600 };

// One mark per point, changed the given way: circles in a dots layer as on the map, or the waffle's squares, which
// a reflow moves from the places given
const sweep = (
    points: { x: number; y: number }[],
    transition: ColourTransition = 'sweep',
    {
        squares = false,
        previousIndexes = null,
    }: { squares?: boolean; previousIndexes?: number[] | null } = {},
) => {
    const layer = squares
        ? document.createElement('div')
        : document.createElementNS(SVG, 'g');
    const marks = points.map(() =>
        layer.appendChild(
            squares
                ? document.createElement('div')
                : document.createElementNS(SVG, 'circle'),
        ),
    );
    const bandLayer = document.createElement('div');
    const stop = startColourTransition(
        { layer, marks, points, area: AREA, bandLayer, previousIndexes },
        transition,
    );
    return {
        stop,
        delays: () => marks.map((mark) => mark.style.transitionDelay),
        fade: () => layer.style.getPropertyValue('--colour-fade'),
        move: () => layer.style.getPropertyValue('--colour-move'),
        band: () => bandLayer.querySelector('div'),
    };
};

describe('startColourTransition', () => {
    let matchMedia: typeof window.matchMedia;
    beforeEach(() => {
        ({ matchMedia } = window);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
        vi.useRealTimers();
        window.matchMedia = matchMedia;
    });

    it('reflows the map as the sweep without its band, since dots on the map never move', () => {
        const { delays, fade, move, band } = sweep(
            [
                { x: 0, y: 0 },
                { x: 220, y: 100 },
            ],
            'reflow',
        );
        expect(delays()).toEqual(['0ms', '127ms']);
        expect(fade()).toBe('380ms');
        expect(move()).toBe('');
        expect(band()).toBeNull();

        // Done once the last dot has faded
        vi.advanceTimersByTime(127 + 379);
        expect(delays()).toEqual(['0ms', '127ms']);
        vi.advanceTimersByTime(1);
        expect(delays()).toEqual(['', '']);
        expect(fade()).toBe('');
    });

    it('takes the band away and clears the delays when stopped part way', () => {
        const { stop, delays, fade, band } = sweep([{ x: 600, y: 300 }]);
        expect(delays()).toEqual(['355ms']);
        expect(band()).not.toBeNull();
        stop();
        expect(delays()).toEqual(['']);
        expect(fade()).toBe('');
        expect(band()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the band until its own animation ends, after the dots have finished', () => {
        const { delays, band } = sweep([{ x: 0, y: 0 }]);
        vi.advanceTimersByTime(380);
        expect(delays()).toEqual(['']);
        const crossing = band();
        expect(crossing).not.toBeNull();
        crossing?.dispatchEvent(new Event('animationend'));
        expect(band()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('takes the band away 100 ms after its animation should have ended when it never does, as in a hidden tab', () => {
        const { band } = sweep([{ x: 1200, y: 600 }]);
        const duration = parseFloat(band()?.style.animationDuration ?? '');
        // From off the top-left corner to off the far one: the far dot's delay, half a fade and half the band
        expect(duration).toBe(941);
        vi.advanceTimersByTime(duration + 99);
        expect(band()).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(band()).toBeNull();
    });

    it('sweeps squares from the top-left corner, and leaves no delay, fade or band once the wave has passed', () => {
        const { delays, fade, band } = sweep(
            [
                { x: 0, y: 0 },
                { x: 220, y: 100 },
                { x: 1200, y: 600 },
            ],
            'sweep',
            { squares: true },
        );
        expect(delays()).toEqual(['0ms', '127ms', '709ms']);
        expect(band()).not.toBeNull();
        // The last square has faded 380 ms after the sweep reached the far corner; the band has gone by then
        vi.advanceTimersByTime(709 + 379);
        expect(delays()[2]).toBe('709ms');
        vi.advanceTimersByTime(1);
        expect(delays()).toEqual(['', '', '']);
        expect(fade()).toBe('');
        expect(band()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reflows squares that move: each waits 0.3 ms for every place before its old one, then glides and fades with no band', () => {
        const { delays, fade, move, band } = sweep(
            [
                { x: 0, y: 0 },
                { x: 220, y: 100 },
                { x: 1200, y: 600 },
            ],
            'reflow',
            { squares: true, previousIndexes: [0, 5, 10] },
        );
        expect(delays()).toEqual(['0ms', '2ms', '3ms']);
        expect(move()).toBe('640ms');
        expect(fade()).toBe('380ms');
        expect(band()).toBeNull();
        // Done once the last square has finished its glide
        vi.advanceTimersByTime(3 + 639);
        expect(move()).toBe('640ms');
        vi.advanceTimersByTime(1);
        expect(delays()).toEqual(['', '', '']);
        expect(move()).toBe('');
        expect(fade()).toBe('');
    });

    it('does nothing for people who prefer reduced motion', () => {
        window.matchMedia = vi.fn((query: string) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        const { delays, fade, move, band } = sweep(
            [
                { x: 0, y: 0 },
                { x: 220, y: 100 },
            ],
            'reflow',
            { squares: true, previousIndexes: [0, 1] },
        );
        expect(delays()).toEqual(['', '']);
        expect(move()).toBe('');
        expect(fade()).toBe('');
        expect(band()).toBeNull();
    });
});
