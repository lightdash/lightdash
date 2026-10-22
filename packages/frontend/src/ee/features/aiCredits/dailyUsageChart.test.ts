import { type AiCreditDailyUsageSeries } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    findTopSeriesIndex,
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
    { feature: 'agent', credits: 0 },
    { feature: 'data-app', credits: 0 },
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

describe('getAiCreditSeriesColor', () => {
    it('gives each series its own hue and wraps around', () => {
        expect(getAiCreditSeriesColor(0)).toContain('violet');
        expect(getAiCreditSeriesColor(1)).not.toBe(getAiCreditSeriesColor(0));
        expect(getAiCreditSeriesColor(6)).toBe(getAiCreditSeriesColor(0));
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

    it('totals a day that has more than one series', () => {
        expect(
            render([
                { label: 'Ask AI', credits: 2 },
                { label: 'Data App', credits: 9 },
            ]),
        ).toMatch(/Total<\/span><b>11 credits/);
        expect(render([{ label: 'Ask AI', credits: 2 }])).not.toContain(
            'Total',
        );
    });

    it('never renders a name as markup', () => {
        const html = render([
            { label: '<img src=x onerror=alert(1)>', credits: 1 },
        ]);
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });
});
