import { type AiCreditPeriod } from '@lightdash/common';
import {
    buildAiCreditDailyUsage,
    listPeriodDays,
    type AiCreditDailyUsageEntry,
} from './aiCreditDailyUsage';

const period: AiCreditPeriod = {
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-09-04T00:00:00Z'),
};

const value = (
    key: string,
    credits: number,
    date = '2026-09-01',
): AiCreditDailyUsageEntry => ({
    date,
    bucket: { type: 'value', key },
    credits,
});

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
                periodStart: new Date('2026-09-01T12:00:00Z'),
                periodEnd: new Date('2026-09-02T12:00:00Z'),
            }),
        ).toEqual(['2026-09-01', '2026-09-02']);
    });
});

describe('buildAiCreditDailyUsage', () => {
    test('keeps days without usage as zeros', () => {
        const usage = buildAiCreditDailyUsage({
            period,
            breakdown: 'feature',
            entries: [value('agent', 2, '2026-09-02')],
            names: null,
        });
        expect(usage.series).toEqual([
            { type: 'value', key: 'agent', name: null, credits: 2 },
        ]);
        expect(usage.days).toEqual([
            { date: '2026-09-01', credits: [0] },
            { date: '2026-09-02', credits: [2] },
            { date: '2026-09-03', credits: [0] },
        ]);
    });

    test('keeps the five largest values and combines the rest as other', () => {
        const usage = buildAiCreditDailyUsage({
            period,
            breakdown: 'feature',
            entries: [7, 6, 5, 4, 3, 2, 1].map((credits, index) =>
                value(`f${index}`, credits),
            ),
            names: null,
        });
        expect(usage.series.map((series) => series.type)).toEqual([
            'value',
            'value',
            'value',
            'value',
            'value',
            'other',
        ]);
        expect(usage.series.at(-1)).toEqual({ type: 'other', credits: 3 });
        expect(usage.days[0].credits).toEqual([7, 6, 5, 4, 3, 3]);
    });

    test('does not hide a single leftover value inside other', () => {
        const usage = buildAiCreditDailyUsage({
            period,
            breakdown: 'feature',
            entries: [6, 5, 4, 3, 2, 1].map((credits, index) =>
                value(`f${index}`, credits),
            ),
            names: null,
        });
        expect(usage.series).toHaveLength(6);
        expect(usage.series.some((series) => series.type === 'other')).toBe(
            false,
        );
    });

    test('names users, projects and agents, and groups ones that no longer exist as deleted', () => {
        const usage = buildAiCreditDailyUsage({
            period,
            breakdown: 'project',
            entries: [value('p1', 3), value('gone-1', 2), value('gone-2', 1)],
            names: new Map([['p1', 'Marketing']]),
        });
        expect(usage.series).toEqual([
            { type: 'value', key: 'p1', name: 'Marketing', credits: 3 },
            { type: 'deleted', credits: 3 },
        ]);
    });

    test('groups embedded viewers and unattributed calls without listing them', () => {
        const usage = buildAiCreditDailyUsage({
            period,
            breakdown: 'user',
            entries: [
                {
                    date: '2026-09-01',
                    bucket: { type: 'embeddedViewers' },
                    credits: 4,
                },
                {
                    date: '2026-09-01',
                    bucket: { type: 'unattributed' },
                    credits: 1,
                },
            ],
            names: new Map(),
        });
        expect(usage.series).toEqual([
            { type: 'embeddedViewers', credits: 4 },
            { type: 'unattributed', credits: 1 },
        ]);
    });

    test('series totals add up to the credits across all days', () => {
        const usage = buildAiCreditDailyUsage({
            period,
            breakdown: 'channel',
            entries: [
                value('web', 1.5, '2026-09-01'),
                value('web', 2.5, '2026-09-03'),
                value('slack', 1, '2026-09-02'),
            ],
            names: null,
        });
        const seriesTotal = usage.series.reduce((sum, s) => sum + s.credits, 0);
        const dayTotal = usage.days
            .flatMap((day) => day.credits)
            .reduce((sum, credits) => sum + credits, 0);
        expect(seriesTotal).toBe(5);
        expect(dayTotal).toBe(5);
    });
});
