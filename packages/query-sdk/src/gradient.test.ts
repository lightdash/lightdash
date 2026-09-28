import { describe, expect, it } from 'vitest';
import { isVizGradientValue } from './gradient';
import { createGradientColorScale } from './gradientColorScale';

const gradient = { colors: ['#000000', '#ffffff'], min: 0, max: 100 };

describe('createGradientColorScale', () => {
    it('clamps values and interpolates in the preview’s OKLab space', () => {
        const color = createGradientColorScale(gradient);
        expect(color(-10)).toBe('#000000');
        expect(color(110)).toBe('#ffffff');
        expect(color(50)).toBe('#636363');
    });

    it('uses every evenly spaced stop', () => {
        const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'];
        const color = createGradientColorScale({ ...gradient, colors });
        for (const [index, stop] of colors.entries()) {
            expect(color(index * 25)?.toLowerCase()).toBe(stop);
        }
    });

    it('resolves automatic bounds from only finite numeric values chosen by the chart', () => {
        const color = createGradientColorScale(
            { ...gradient, min: 'auto', max: 'auto' },
            [null, '100', NaN, Infinity, 20, 60],
        );
        expect(color(20)).toBe('#000000');
        expect(color(60)).toBe('#ffffff');
        expect(color(40)).toBe('#636363');
        for (const value of [null, undefined, '40', NaN, Infinity]) {
            expect(color(value)).toBeUndefined();
        }
    });

    it('resolves automatic bounds independently', () => {
        expect(
            createGradientColorScale({ ...gradient, min: 'auto' }, [20])(20),
        ).toBe('#000000');
        expect(
            createGradientColorScale({ ...gradient, max: 'auto' }, [20])(20),
        ).toBe('#ffffff');
    });

    it('returns no colour for an empty automatic domain or reversed bounds', () => {
        expect(
            createGradientColorScale({ ...gradient, min: 'auto' })(50),
        ).toBeUndefined();
        expect(
            createGradientColorScale({ ...gradient, min: 200 })(50),
        ).toBeUndefined();
    });

    it('matches the map’s middle stop for equal bounds', () => {
        expect(
            createGradientColorScale({ ...gradient, min: 0, max: 0 })(0),
        ).toBe('#ffffff');
    });

    it('handles finite bounds whose difference overflows', () => {
        expect(
            createGradientColorScale({
                ...gradient,
                min: -Number.MAX_VALUE,
                max: Number.MAX_VALUE,
            })(0),
        ).toBe('#636363');
    });

    it('handles subnormal bounds without dividing by zero', () => {
        expect(
            createGradientColorScale({
                ...gradient,
                min: -Number.MIN_VALUE,
                max: Number.MIN_VALUE,
            })(0),
        ).toBe('#636363');
    });

    it('accepts the picker’s shorthand and alpha hex colours', () => {
        const value = { ...gradient, colors: ['#000', '#ffffff80'] };
        expect(isVizGradientValue(value)).toBe(true);
        const color = createGradientColorScale(value);
        expect(color(0)).toBe('#000');
        expect(color(100)).toBe('#ffffff80');
        expect(color(50)).toMatch(/^#[\da-f]{8}$/i);
    });

    it('rejects malformed gradient values', () => {
        for (const value of [
            null,
            true,
            {},
            { ...gradient, colors: ['red', 'blue'] },
            { ...gradient, colors: ['#000000'] },
            { ...gradient, colors: Array(6).fill('#000000') },
            { ...gradient, max: Infinity },
        ]) {
            expect(isVizGradientValue(value)).toBe(false);
            expect(createGradientColorScale(value)(0)).toBeUndefined();
        }
    });
});
