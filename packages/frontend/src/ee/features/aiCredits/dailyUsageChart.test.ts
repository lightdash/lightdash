import { type AiCreditDailyUsageSeries } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    findTopSeriesIndex,
    getAiCreditRowShare,
    getAiCreditSeriesColor,
    renderAiCreditTooltip,
    toAiCreditChartBuckets,
} from './dailyUsageChart';

const days = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
        date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
        credits: [1, 2],
    }));

const series: AiCreditDailyUsageSeries[] = [
    { type: 'value', key: 'agent', name: null, credits: 0 },
    { type: 'other', credits: 0 },
];

describe('toAiCreditChartBuckets', () => {
    it('keeps one bar per day for a monthly period', () => {
        const buckets = toAiCreditChartBuckets({ days: days(30), series });
        expect(buckets).toHaveLength(30);
        expect(buckets[0]).toEqual({ label: '1 Jan', credits: [1, 2] });
    });

    it('sums days into weeks for a yearly period, keeping every credit', () => {
        const buckets = toAiCreditChartBuckets({ days: days(365), series });
        expect(buckets).toHaveLength(53);
        expect(buckets[0]).toEqual({
            label: 'Week of 1 Jan',
            credits: [7, 14],
        });
        expect(buckets.at(-1)?.credits).toEqual([1, 2]);
        const total = buckets.reduce(
            (sum, bucket) => sum + bucket.credits[0] + bucket.credits[1],
            0,
        );
        expect(total).toBe(365 * 3);
    });
});

describe('getAiCreditRowShare', () => {
    it('measures a row against the allowance so rows add up to the usage bar', () => {
        expect(
            getAiCreditRowShare({
                credits: 3,
                allowanceCredits: 6,
                usedCredits: 4,
            }),
        ).toBe(50);
    });

    it('measures against credits used when there is no allowance', () => {
        expect(
            getAiCreditRowShare({
                credits: 1,
                allowanceCredits: null,
                usedCredits: 4,
            }),
        ).toBe(25);
    });

    it('never overflows the bar past the allowance', () => {
        expect(
            getAiCreditRowShare({
                credits: 9,
                allowanceCredits: 6,
                usedCredits: 9,
            }),
        ).toBe(100);
    });
});

describe('getAiCreditSeriesColor', () => {
    it('shows combined usage in a neutral colour', () => {
        expect(getAiCreditSeriesColor(series[1], 1)).toContain('ldGray');
        expect(getAiCreditSeriesColor(series[0], 0)).toContain('violet');
    });
});

describe('findTopSeriesIndex', () => {
    it('rounds the highest segment that has credits that day', () => {
        expect(findTopSeriesIndex([3, 2, 0])).toBe(1);
        expect(findTopSeriesIndex([3, 2, 1])).toBe(2);
    });

    it('finds nothing to round on a day without usage', () => {
        expect(findTopSeriesIndex([0, 0])).toBe(-1);
    });
});

describe('renderAiCreditTooltip', () => {
    const render = (rows: { label: string; credits: number }[]) =>
        renderAiCreditTooltip(
            '15 Sep',
            rows.map((row) => ({ ...row, color: 'var(--c)' })),
            (credits) => String(credits),
        );

    it('lists a day highest first and leaves out series with no credits', () => {
        const html = render([
            { label: 'Ask AI', credits: 2 },
            { label: 'Data App', credits: 9 },
            { label: 'Compaction', credits: 0 },
        ]);
        expect(html.indexOf('Data App')).toBeLessThan(html.indexOf('Ask AI'));
        expect(html).not.toContain('Compaction');
    });

    it('never renders a name as markup', () => {
        const html = render([
            { label: '<img src=x onerror=alert(1)>', credits: 1 },
        ]);
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });
});
