import { afterEach, describe, expect, it, vi } from 'vitest';
import { startColourTransition } from './colourTransition';

const SVG = 'http://www.w3.org/2000/svg';

const drawDots = (count: number) => {
    const dotsLayer = document.createElementNS(SVG, 'g');
    const dots = Array.from({ length: count }, () =>
        dotsLayer.appendChild(document.createElementNS(SVG, 'circle')),
    );
    return { dotsLayer, dots, bandLayer: document.createElement('div') };
};

describe('startColourTransition', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reflows the map as the sweep without its band, since dots on the map never move', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { dotsLayer, dots, bandLayer } = drawDots(2);
        const end = startColourTransition(
            {
                dotsLayer,
                points: [
                    { x: 0, y: 0 },
                    { x: 220, y: 100 },
                ],
                area: { width: 1200, height: 600 },
                bandLayer,
            },
            'reflow',
        );
        expect(dots.map((dot) => dot.style.transitionDelay)).toEqual([
            '0ms',
            '127ms',
        ]);
        expect(dotsLayer.style.getPropertyValue('--colour-fade')).toBe('380ms');
        expect(bandLayer.childElementCount).toBe(0);

        // Done once the last dot has faded
        vi.advanceTimersByTime(127 + 379);
        expect(dots[1].style.transitionDelay).toBe('127ms');
        vi.advanceTimersByTime(1);
        expect(dots.map((dot) => dot.style.transitionDelay)).toEqual(['', '']);
        expect(dotsLayer.style.getPropertyValue('--colour-fade')).toBe('');
        end();
    });

    it('ends at once when stopped part way, band and all', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { dotsLayer, dots, bandLayer } = drawDots(1);
        const end = startColourTransition(
            {
                dotsLayer,
                points: [{ x: 600, y: 300 }],
                area: { width: 1200, height: 600 },
                bandLayer,
            },
            'sweep',
        );
        expect(dots[0].style.transitionDelay).toBe('355ms');
        expect(bandLayer.childElementCount).toBe(1);
        end();
        expect(dots[0].style.transitionDelay).toBe('');
        expect(dotsLayer.style.getPropertyValue('--colour-fade')).toBe('');
        expect(bandLayer.childElementCount).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});
