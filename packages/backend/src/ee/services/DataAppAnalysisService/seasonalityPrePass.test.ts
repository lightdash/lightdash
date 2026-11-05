import {
    DimensionType,
    FieldType,
    MetricType,
    TimeFrames,
    type ItemsMap,
} from '@lightdash/common';
import {
    seasonalityPrePass,
    type SeasonalityCoverage,
} from './seasonalityPrePass';

const DATE_FIELD = 'orders_order_date_day';
const METRIC_FIELD = 'orders_total';
const SECOND_METRIC_FIELD = 'orders_count';

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
    [SECOND_METRIC_FIELD]: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
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

const expectCoverageInvariant = (coverage: SeasonalityCoverage | null) => {
    expect(coverage).not.toBeNull();
    expect(coverage!.total).toBe(
        coverage!.assessed +
            coverage!.skippedInsufficientHistory +
            coverage!.skippedZeroBaseline +
            coverage!.excludedIncompleteToday,
    );
};

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
    it.each([0, 1, 100000])(
        'reports an unassessed zero baseline with a departure of %s',
        (value) => {
            const rows = weeklyRows(5, () => 0);
            rows[0][METRIC_FIELD] = value;
            const result = seasonalityPrePass(rows, fields, TODAY);
            expect(result.annotations).toBeNull();
            // Zero coverage still carries a note so the model does not fall
            // back to judging daily rows itself.
            expect(result.note).toContain('could not be computed');
            expect(result.note).toContain('0 of 35 measurements');
            expect(result.note).toContain('unverified');
            expect(result.limitation).toContain('not assessed');
            expect(result.limitation).toContain('zero median and zero MAD');
            expect(result.coverage).toMatchObject({
                assessed: 0,
                skippedZeroBaseline: 35,
            });
            expectCoverageInvariant(result.coverage);
        },
    );

    it('keeps ordinary anomalies when sparse groups would fill the marker budget', () => {
        const rows = Array.from({ length: 11 }, (_, region) =>
            weeklyRows(5, () => 0).map((row, index) => ({
                ...row,
                orders_region: String(region),
                [METRIC_FIELD]: index === 0 ? 1 : 0,
            })),
        ).flat();
        const ordinary = weeklyRows(5, flatWeeklyPattern).map((row, index) => ({
            ...row,
            orders_region: 'ordinary',
            [METRIC_FIELD]: index === 0 ? 1000 : row[METRIC_FIELD],
        }));
        const result = seasonalityPrePass(
            [...rows, ...ordinary],
            fields,
            TODAY,
        );
        const marked = result.annotations!.cells.filter(
            (cell) => cell !== null,
        );
        expect(marked).toHaveLength(1);
        expect(result.annotations!.cells[rows.length]).toContain('median 100');
        expect(result.limitation).toContain('zero median and zero MAD');
        expect(result.note).toContain('measurements were assessed');
        expect(result.note).not.toContain(
            'rows without a marker are within their normal weekly pattern',
        );
        expect(result.note).toContain('unverified');
        expectCoverageInvariant(result.coverage);
    });

    it.each([null, undefined, ''])(
        'does not flag or count a missing metric value (%s)',
        (missing) => {
            const rows = weeklyRows(5, flatWeeklyPattern);
            rows[0][METRIC_FIELD] = missing;
            const result = seasonalityPrePass(rows, fields, TODAY);
            expect(result.annotations).toBeNull();
            // A missing measurement is not an observation at all.
            expect(result.coverage).toMatchObject({
                total: 34,
                assessed: 34,
            });
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
            coverage: null,
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
        expect(result.note).toContain(
            'rows without a marker are within their normal weekly pattern',
        );
        expect(result.limitation).toBeNull();
    });

    it('flags nothing on a flat weekly pattern', () => {
        const result = seasonalityPrePass(
            weeklyRows(5, flatWeeklyPattern),
            fields,
            TODAY,
        );
        expect(result.annotations).toBeNull();
        expect(result.limitation).toBeNull();
        expect(result.note).toContain('All 35 measurements were assessed');
        expect(result.note).toContain('no row breaks');
        expect(result.coverage).toMatchObject({ total: 35, assessed: 35 });
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
        expect(result.note).toContain('could not be computed');
        expect(result.note).toContain('unverified');
        expect(result.limitation).toContain('not assessed');
        expect(result.limitation).toContain('fewer than 3 same-weekday');
        expect(result.coverage).toMatchObject({
            assessed: 0,
            skippedInsufficientHistory: 14,
        });
    });

    it('discloses a mixed-history section instead of vouching for the short group', () => {
        // Region A has three weeks of history, region B only two: B's rows
        // are unassessed and the note must not imply they were checked.
        const spikeDay = '2025-01-18'; // a Saturday in week 2
        const rows: Record<string, unknown>[] = [
            ...weeklyRows(3, flatWeeklyPattern).map((row) => ({
                ...row,
                orders_region: 'A',
                [METRIC_FIELD]:
                    row[DATE_FIELD] === spikeDay ? 930 : row[METRIC_FIELD],
            })),
            ...weeklyRows(2, flatWeeklyPattern).map((row) => ({
                ...row,
                orders_region: 'B',
            })),
        ];
        const result = seasonalityPrePass(rows, fields, TODAY);
        const marked = result
            .annotations!.cells.map((cell, index) => ({ cell, index }))
            .filter(({ cell }) => cell !== null);
        expect(marked).toHaveLength(1);
        expect(rows[marked[0].index].orders_region).toBe('A');
        expect(result.note).toContain('21 of 35 measurements were assessed');
        expect(result.note).toContain('fewer than 3 same-weekday');
        expect(result.limitation).toContain('covered 21 of 35');
        expect(result.coverage).toMatchObject({
            assessed: 21,
            skippedInsufficientHistory: 14,
        });
        expectCoverageInvariant(result.coverage);
    });

    it('tracks coverage per metric when one metric is mostly missing', () => {
        // The second metric only has two same-weekday samples; the first is
        // fully assessed. Coverage must split per metric, not per row.
        const rows = weeklyRows(5, flatWeeklyPattern).map((row, index) => ({
            ...row,
            [SECOND_METRIC_FIELD]: index >= 21 ? 50 : null,
        }));
        const result = seasonalityPrePass(rows, fields, TODAY);
        expect(result.note).toContain('35 of 49 measurements were assessed');
        expect(result.limitation).toContain('covered 35 of 49');
        expect(result.coverage).toMatchObject({
            total: 49,
            assessed: 35,
            skippedInsufficientHistory: 14,
        });
        expectCoverageInvariant(result.coverage);
    });

    it('excludes today from baselines, sample counts and coverage claims', () => {
        // Two full weeks plus a third Monday dated today. Counting today
        // would make the Monday group assessable with today in its baseline,
        // flagging the 160 against a median today distorts; excluding it
        // leaves every group short of samples instead.
        const rows = [
            ...weeklyRows(2, flatWeeklyPattern),
            {
                [DATE_FIELD]: '2025-01-20',
                [METRIC_FIELD]: 104,
            },
        ];
        rows[7][METRIC_FIELD] = 160;
        const result = seasonalityPrePass(rows, fields, '2025-01-20');
        expect(result.annotations).toBeNull();
        expect(result.note).toContain('could not be computed');
        expect(result.note).toContain("today's incomplete day");
        expect(result.limitation).toContain('fewer than 3 same-weekday');
        expect(result.coverage).toMatchObject({
            assessed: 0,
            skippedInsufficientHistory: 14,
            excludedIncompleteToday: 1,
        });
        expectCoverageInvariant(result.coverage);
    });

    it('never flags a row dated today and discloses the exclusion to the model only', () => {
        const rows = weeklyRows(5, flatWeeklyPattern);
        const lastDay = rows[rows.length - 1][DATE_FIELD] as string;
        rows[rows.length - 1] = { ...rows[rows.length - 1], [METRIC_FIELD]: 5 };
        const result = seasonalityPrePass(rows, fields, lastDay);
        expect(result.annotations).toBeNull();
        expect(result.note).toContain('34 of 35 measurements were assessed');
        expect(result.note).toContain("today's incomplete day");
        // Routine trailing-day exclusion is not a user-facing caveat.
        expect(result.limitation).toBeNull();
        expect(result.coverage).toMatchObject({
            assessed: 34,
            excludedIncompleteToday: 1,
        });
    });

    it('discloses deviations omitted by the marker cap', () => {
        const rows = weeklyRows(6, () => 100);
        // Twelve spikes, two per weekday across six weekdays.
        const spiked = rows.map((row, index) =>
            [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].includes(index)
                ? { ...row, [METRIC_FIELD]: 900 }
                : row,
        );
        const result = seasonalityPrePass(spiked, fields, TODAY);
        const marked = result.annotations!.cells.filter(
            (cell) => cell !== null,
        );
        expect(marked).toHaveLength(10);
        expect(result.note).toContain(
            '2 further flagged deviations are unmarked',
        );
        expect(result.note).not.toContain(
            'rows without a marker are within their normal weekly pattern',
        );
        expect(result.limitation).toContain('beyond the 10-marker cap');
        expect(result.coverage).toMatchObject({
            flagged: 12,
            omittedByMarkerCap: 2,
        });
        expectCoverageInvariant(result.coverage);
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
            coverage: null,
        });
    });
});
