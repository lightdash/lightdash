import { type AiBillableFeature, type AiCreditPeriod } from '@lightdash/common';
import {
    buildAiCreditDailyUsage,
    listPeriodDays,
    type AiCreditDailyUsageEntry,
} from './aiCreditDailyUsage';

const period: AiCreditPeriod = {
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-09-04T00:00:00Z'),
};

const usage = (
    feature: AiBillableFeature,
    credits: number,
    date = '2026-09-01',
): AiCreditDailyUsageEntry => ({ date, feature, credits });

describe('listPeriodDays', () => {
    test('lists every UTC day the period touches, end excluded', () => {
        expect(listPeriodDays(period)).toEqual([
            '2026-09-01',
            '2026-09-02',
            '2026-09-03',
        ]);
    });

    test('includes the partial first and last days of a period that starts mid-day', () => {
        expect(
            listPeriodDays({
                periodStart: new Date('2026-09-01T15:00:00Z'),
                periodEnd: new Date('2026-09-03T15:00:00Z'),
            }),
        ).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    });
});

describe('buildAiCreditDailyUsage', () => {
    test('keeps days without usage as zeros', () => {
        const daily = buildAiCreditDailyUsage({
            period,
            entries: [usage('agent', 2), usage('data-app', 1, '2026-09-03')],
        });
        expect(daily.days).toEqual([
            { date: '2026-09-01', credits: [2, 0] },
            { date: '2026-09-02', credits: [0, 0] },
            { date: '2026-09-03', credits: [0, 1] },
        ]);
    });

    test('orders features by credits, largest first, and leaves out unused ones', () => {
        const daily = buildAiCreditDailyUsage({
            period,
            entries: [
                usage('compaction', 1),
                usage('agent', 5),
                usage('deep-research', 0),
                usage('agent', 1, '2026-09-02'),
            ],
        });
        expect(daily.series).toEqual([
            { feature: 'agent', credits: 6 },
            { feature: 'compaction', credits: 1 },
        ]);
    });

    test('series totals add up to the credits across all days', () => {
        const daily = buildAiCreditDailyUsage({
            period,
            entries: [
                usage('agent', 1.5),
                usage('agent', 2.5, '2026-09-02'),
                usage('data-app', 4, '2026-09-03'),
            ],
        });
        daily.series.forEach((series, index) => {
            const total = daily.days.reduce(
                (sum, day) => sum + day.credits[index],
                0,
            );
            expect(series.credits).toBeCloseTo(total, 9);
        });
    });

    test('ignores usage outside the period', () => {
        const daily = buildAiCreditDailyUsage({
            period,
            entries: [usage('agent', 3, '2026-08-31')],
        });
        expect(daily.series).toEqual([{ feature: 'agent', credits: 0 }]);
        expect(daily.days.every((day) => day.credits[0] === 0)).toBe(true);
    });
});
