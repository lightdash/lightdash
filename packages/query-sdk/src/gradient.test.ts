import { getGradientColor as getCommonGradientColor } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getGradientColor } from './gradient';

const palettes = [
    ['#000000', '#ffffff'],
    ['#228be6', '#fa5252'],
    ['#0000ff', '#00ff00', '#ff0000'],
    ['#7162ff', '#fab005', '#12b886', '#e64980'],
    ['#fff', '#f03e3e', '#1c7ed6', '#37b24d', '#000'],
];

describe('getGradientColor', () => {
    it('matches the host implementation across stops and values', () => {
        const mismatches = palettes.flatMap((colors) =>
            Array.from({ length: 101 }, (_, i) => i - 10).flatMap((value) => {
                const sdk = getGradientColor(
                    { colors, min: 0, max: 80 },
                    value,
                );
                const host = getCommonGradientColor(
                    { colors, min: 0, max: 80 },
                    value,
                );
                return sdk === host ? [] : [{ colors, value, sdk, host }];
            }),
        );
        expect(mismatches).toEqual([]);
    });

    it('fills null bounds from the domain and needs both', () => {
        const gradient = { colors: ['#000000', '#ffffff'], min: null, max: 10 };
        expect(getGradientColor(gradient, 5)).toBeNull();
        expect(getGradientColor(gradient, 0, { min: 0, max: 99 })).toBe(
            '#000000',
        );
        expect(getGradientColor(gradient, 10, { min: 0, max: 99 })).toBe(
            '#ffffff',
        );
    });

    it('returns null for missing or non-numeric values and an inverted range', () => {
        const gradient = { colors: ['#000000', '#ffffff'], min: 0, max: 10 };
        for (const value of [null, undefined, '', 'n/a', NaN, Infinity, true]) {
            expect(getGradientColor(gradient, value)).toBeNull();
        }
        expect(
            getGradientColor({ ...gradient, min: 10, max: 0 }, 5),
        ).toBeNull();
    });

    it('returns null for a non-finite bound or domain', () => {
        const colors = ['#000000', '#ffffff'];
        for (const bound of [NaN, Infinity, -Infinity]) {
            expect(
                getGradientColor({ colors, min: bound, max: 10 }, 5),
            ).toBeNull();
            expect(
                getGradientColor({ colors, min: 0, max: bound }, 5),
            ).toBeNull();
            expect(
                getGradientColor({ colors, min: null, max: null }, 5, {
                    min: 0,
                    max: bound,
                }),
            ).toBeNull();
            expect(
                getGradientColor({ colors, min: null, max: 10 }, 5, {
                    min: bound,
                    max: 99,
                }),
            ).toBeNull();
        }
    });

    it('clamps outside the range and uses the last colour for an empty range', () => {
        const gradient = { colors: ['#000000', '#ffffff'], min: 0, max: 10 };
        expect(getGradientColor(gradient, -5)).toBe('#000000');
        expect(getGradientColor(gradient, '50')).toBe('#ffffff');
        expect(getGradientColor({ ...gradient, min: 3, max: 3 }, 0)).toBe(
            '#ffffff',
        );
    });
});
