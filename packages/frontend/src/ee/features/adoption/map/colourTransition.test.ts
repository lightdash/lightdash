import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    startColourTransition,
    type ColourTransition,
} from './colourTransition';

const SVG = 'http://www.w3.org/2000/svg';
const AREA = { width: 1200, height: 600 };

// One circle per point in a dots layer, swept the given way
const sweep = (
    points: { x: number; y: number }[],
    transition: ColourTransition = 'sweep',
) => {
    const dotsLayer = document.createElementNS(SVG, 'g');
    const dots = points.map(() =>
        dotsLayer.appendChild(document.createElementNS(SVG, 'circle')),
    );
    const bandLayer = document.createElement('div');
    const stop = startColourTransition(
        { dotsLayer, points, area: AREA, bandLayer },
        transition,
    );
    return {
        stop,
        delays: () => dots.map((dot) => dot.style.transitionDelay),
        fade: () => dotsLayer.style.getPropertyValue('--colour-fade'),
        band: () => bandLayer.querySelector('div'),
    };
};

describe('startColourTransition', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reflows the map as the sweep without its band, since dots on the map never move', () => {
        const { delays, fade, band } = sweep(
            [
                { x: 0, y: 0 },
                { x: 220, y: 100 },
            ],
            'reflow',
        );
        expect(delays()).toEqual(['0ms', '127ms']);
        expect(fade()).toBe('380ms');
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
});
