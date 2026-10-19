import {
    DimensionType,
    FieldType,
    MetricType,
    TimeFrames,
    type ItemsMap,
} from '@lightdash/common';
import { seasonalityPrePass } from './seasonalityPrePass';

const DATE_FIELD = 'orders_order_date_day';
const METRIC_FIELD = 'orders_total';

const fields = {
    [DATE_FIELD]: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        timeInterval: TimeFrames.DAY,
        name: 'order_date_day',
        label: 'Order date',
    },
    [METRIC_FIELD]: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'total',
        label: 'Total',
    },
    orders_region: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'region',
        label: 'Region',
    },
} as unknown as ItemsMap;

// Far from any row's date so no row is a trailing incomplete period.
const TODAY = '2030-01-01';

/** `weeks` consecutive days starting Monday 2025-01-06; value by weekday. */
const weeklyRows = (
    weeks: number,
    valueOf: (date: Date) => number,
): Record<string, unknown>[] =>
    Array.from({ length: weeks * 7 }, (_, index) => {
        const date = new Date(Date.UTC(2025, 0, 6 + index));
        return {
            [DATE_FIELD]: date.toISOString().slice(0, 10),
            [METRIC_FIELD]: valueOf(date),
        };
    });

// Weekends run 3× weekdays every week: seasonality, not an anomaly.
const flatWeeklyPattern = (date: Date): number =>
    date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 300 : 100;

describe('seasonalityPrePass', () => {
    it.each([null, undefined, ''])(
        'does not flag a missing metric value (%s)',
        (missing) => {
            const rows = weeklyRows(5, flatWeeklyPattern);
            rows[0][METRIC_FIELD] = missing;
            expect(
                seasonalityPrePass(rows, fields, TODAY).annotations,
            ).toBeNull();
        },
    );

    it('skips metrics with only empty-string values', () => {
        const rows = weeklyRows(5, () => 100).map((row) => ({
            ...row,
            [METRIC_FIELD]: '',
        }));
        expect(seasonalityPrePass(rows, fields, TODAY)).toEqual({
            annotations: null,
            note: null,
            limitation: null,
        });
    });

    it('still flags a real zero below its weekday baseline', () => {
        const rows = weeklyRows(5, flatWeeklyPattern);
        rows[0][METRIC_FIELD] = 0;
        const result = seasonalityPrePass(rows, fields, TODAY);
        expect(result.annotations!.cells[0]).toContain(
            '100% below typical Monday',
        );
        expect(
            result.annotations!.cells.filter((cell) => cell !== null),
        ).toHaveLength(1);
    });

    it('flags nothing on a flat weekly pattern', () => {
        const result = seasonalityPrePass(
            weeklyRows(5, flatWeeklyPattern),
            fields,
            TODAY,
        );
        expect(result.annotations).toBeNull();
        expect(result.limitation).toBeNull();
        expect(result.note).toContain('no row breaks');
    });

    it('flags exactly the injected spike with its weekday baseline', () => {
        const spikeDay = '2025-01-25'; // a Saturday
        const rows = weeklyRows(5, flatWeeklyPattern).map((row) =>
            row[DATE_FIELD] === spikeDay
                ? { ...row, [METRIC_FIELD]: 930 }
                : row,
        );
        const result = seasonalityPrePass(rows, fields, TODAY);
        expect(result.annotations).not.toBeNull();
        const marked = result
            .annotations!.cells.map((cell, index) => ({ cell, index }))
            .filter(({ cell }) => cell !== null);
        expect(marked).toHaveLength(1);
        expect(rows[marked[0].index][DATE_FIELD]).toBe(spikeDay);
        expect(marked[0].cell).toContain(METRIC_FIELD);
        expect(marked[0].cell).toContain('above typical Saturday');
        expect(marked[0].cell).toContain('median 300');
        expect(result.note).toContain('Seasonality');
    });

    it('flags a dip below the weekday baseline', () => {
        const dipDay = '2025-01-29'; // a Wednesday
        const rows = weeklyRows(5, flatWeeklyPattern).map((row) =>
            row[DATE_FIELD] === dipDay ? { ...row, [METRIC_FIELD]: 20 } : row,
        );
        const result = seasonalityPrePass(rows, fields, TODAY);
        const marked = result.annotations!.cells.filter(
            (cell) => cell !== null,
        );
        expect(marked).toHaveLength(1);
        expect(marked[0]).toContain('below typical Wednesday');
    });

    it('reports a limitation and no markers on short history', () => {
        const result = seasonalityPrePass(
            weeklyRows(2, flatWeeklyPattern),
            fields,
            TODAY,
        );
        expect(result.annotations).toBeNull();
        expect(result.note).toBeNull();
        expect(result.limitation).toContain('Too little history');
    });

    it('never flags a row dated today (trailing incomplete period)', () => {
        const rows = weeklyRows(5, flatWeeklyPattern);
        const lastDay = rows[rows.length - 1][DATE_FIELD] as string;
        rows[rows.length - 1] = { ...rows[rows.length - 1], [METRIC_FIELD]: 5 };
        const result = seasonalityPrePass(rows, fields, lastDay);
        expect(result.annotations).toBeNull();
        expect(result.note).toContain('no row breaks');
    });

    it('compares like for like within each other-dimension group', () => {
        // Two regions with different scales; a spike only in one region.
        const rows: Record<string, unknown>[] = weeklyRows(
            5,
            flatWeeklyPattern,
        ).flatMap((row) => [
            { ...row, orders_region: 'EU' },
            {
                ...row,
                orders_region: 'US',
                [METRIC_FIELD]: (row[METRIC_FIELD] as number) * 10,
            },
        ]);
        const spiked = rows.map((row) =>
            row[DATE_FIELD] === '2025-01-25' && row.orders_region === 'EU'
                ? { ...row, [METRIC_FIELD]: 930 }
                : row,
        );
        const result = seasonalityPrePass(spiked, fields, TODAY);
        const marked = result
            .annotations!.cells.map((cell, index) => ({ cell, index }))
            .filter(({ cell }) => cell !== null);
        // 930 is ordinary for US Saturdays (3000 median) but 3.1× an EU one.
        expect(marked).toHaveLength(1);
        expect(spiked[marked[0].index].orders_region).toBe('EU');
    });

    it.each([
        ['no date dimension', [{ orders_region: 'EU', [METRIC_FIELD]: 1 }]],
        [
            'month grain',
            [
                {
                    [DATE_FIELD]: '2025-01-01',
                    [METRIC_FIELD]: 1,
                },
            ],
        ],
    ])('skips a section with %s', (label, rows) => {
        const monthFields = {
            ...fields,
            [DATE_FIELD]: {
                ...(fields[DATE_FIELD] as object),
                timeInterval: TimeFrames.MONTH,
            },
        } as unknown as ItemsMap;
        const result = seasonalityPrePass(
            rows as Record<string, unknown>[],
            label === 'month grain' ? monthFields : fields,
            TODAY,
        );
        expect(result).toEqual({
            annotations: null,
            note: null,
            limitation: null,
        });
    });
});
