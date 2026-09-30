import { describe, expect, test } from 'vitest';
import { DARK_VISUALIZATION_THEME, LIGHT_VISUALIZATION_THEME } from './theme';
import { resolveThemeColors } from './themeColors';

describe('resolveThemeColors', () => {
    test('replaces each Mantine variable with the theme value', () => {
        const option = {
            axisLabel: { color: 'var(--mantine-color-ldGray-7, #495057)' },
            tooltip: {
                backgroundColor: 'var(--mantine-color-background-0, #FEFEFE)',
                extraCssText:
                    'color: var(--mantine-color-foreground-0, #1A1B1E); border: 1px solid var(--mantine-color-white, #ffffff);',
            },
            title: { color: 'var(--mantine-color-gray-6, #868e96)' },
        };
        expect(resolveThemeColors(option, DARK_VISUALIZATION_THEME)).toEqual({
            axisLabel: { color: DARK_VISUALIZATION_THEME.neutral[7] },
            tooltip: {
                backgroundColor: DARK_VISUALIZATION_THEME.background,
                extraCssText: `color: ${DARK_VISUALIZATION_THEME.foreground}; border: 1px solid #ffffff;`,
            },
            title: { color: DARK_VISUALIZATION_THEME.neutral[6] },
        });
    });

    test('falls back to the variable fallback for names the theme does not carry', () => {
        expect(
            resolveThemeColors(
                { color: 'var(--mantine-color-teal-3, #63e6be)' },
                LIGHT_VISUALIZATION_THEME,
            ),
        ).toEqual({ color: '#63e6be' });
    });

    test('keeps functions, leaves the dataset alone, and shares untouched objects', () => {
        const formatter = () => 'x';
        const source = [{ color: 'var(--mantine-color-ldGray-1)' }];
        const untouched = { type: 'bar', data: [1, 2, 3] };
        const option = {
            tooltip: { formatter },
            dataset: { source },
            series: [untouched],
        };
        const resolved = resolveThemeColors(option, LIGHT_VISUALIZATION_THEME);

        expect(resolved).toBe(option);
        expect(resolved.tooltip.formatter).toBe(formatter);
        expect(resolved.dataset.source).toBe(source);
        expect(resolved.series[0]).toBe(untouched);
    });
});
