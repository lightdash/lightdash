import { describe, expect, it } from 'vitest';
import {
    CHART_TYPE_ICONS,
    chartTypeIconSchema,
    isChartTypeIcon,
} from './chartTypeIcons';

describe('isChartTypeIcon', () => {
    it('accepts every curated icon name', () => {
        CHART_TYPE_ICONS.forEach((icon) => {
            expect(isChartTypeIcon(icon)).toBe(true);
        });
    });

    it('rejects a value not in the curated set', () => {
        expect(isChartTypeIcon('not-a-real-icon')).toBe(false);
    });

    it('rejects null, undefined and non-string values', () => {
        expect(isChartTypeIcon(null)).toBe(false);
        expect(isChartTypeIcon(undefined)).toBe(false);
        expect(isChartTypeIcon(42)).toBe(false);
    });
});

describe('chartTypeIconSchema', () => {
    it('parses every curated icon name', () => {
        CHART_TYPE_ICONS.forEach((icon) => {
            expect(chartTypeIconSchema.safeParse(icon).success).toBe(true);
        });
    });

    it('rejects a value not in the curated set', () => {
        expect(chartTypeIconSchema.safeParse('not-a-real-icon').success).toBe(
            false,
        );
    });
});
