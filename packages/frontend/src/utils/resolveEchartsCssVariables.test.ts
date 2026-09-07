import { afterEach, describe, expect, it } from 'vitest';
import { resolveCssVariablesInOptions } from './resolveEchartsCssVariables';

describe('resolveCssVariablesInOptions', () => {
    afterEach(() => {
        document.documentElement.style.removeProperty('--chart-color');
    });

    it('resolves canvas colors from CSS while retaining fallbacks', () => {
        document.documentElement.style.setProperty('--chart-color', '#123456');
        expect(
            resolveCssVariablesInOptions({
                color: 'var(--chart-color, #ffffff)',
                borderColor: 'var(--missing-color, #abcdef)',
            }),
        ).toEqual({ color: '#123456', borderColor: '#abcdef' });
    });

    it('resolves a supplied theme without waiting for the DOM stylesheet', () => {
        document.documentElement.style.setProperty('--chart-color', '#123456');
        expect(
            resolveCssVariablesInOptions(
                { color: 'var(--chart-color, #ffffff)' },
                () => '#eeeeee',
            ),
        ).toEqual({ color: '#eeeeee' });
    });

    it('preserves formatters and input options when resolving nested arrays', () => {
        const formatter = (value: number) => `${value}%`;
        const options = {
            series: [
                {
                    data: [0, null, 10],
                    label: {
                        formatter,
                        color: 'var(--missing-color, #abcdef)',
                    },
                },
            ],
        };
        const resolved = resolveCssVariablesInOptions(options);
        expect(resolved.series[0].label.color).toBe('#abcdef');
        expect(resolved.series[0].label.formatter).toBe(formatter);
        expect(resolved.series[0].data).toEqual([0, null, 10]);
        expect(options.series[0].label.color).toBe(
            'var(--missing-color, #abcdef)',
        );
    });
});
