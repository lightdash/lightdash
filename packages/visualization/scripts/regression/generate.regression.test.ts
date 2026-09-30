/** Writes the replay's cases to REPLAY_CASES. Run by `run.mjs` on this checkout only. */
import { writeFileSync } from 'fs';
import { expect, test } from 'vitest';
import {
    cartesianCases,
    columnOrder,
    otherCases,
    pivotTableCases,
    results,
    fields,
} from './fixtures';

type Case = {
    name: string;
    chartConfig: unknown;
    pivotColumns?: string[];
    results: {
        rows: unknown;
        pivotDetails?: unknown;
        resolvedTimezone?: string;
    };
};

const slim = (c: Case) => ({
    name: c.name,
    chartConfig: c.chartConfig,
    pivotColumns: c.pivotColumns,
    results: {
        rows: c.results.rows,
        pivotDetails: c.results.pivotDetails,
        resolvedTimezone: c.results.resolvedTimezone,
    },
});

test('generate the replay cases', () => {
    const cases = [
        ...cartesianCases(Number(process.env.REPLAY_RANDOM ?? 750)),
        ...otherCases().map((c) => ({ ...c, results })),
        ...pivotTableCases(),
    ].map((c) => slim(c as Case));
    writeFileSync(
        process.env.REPLAY_CASES!,
        JSON.stringify({
            fields,
            metricQuery: results.metricQuery,
            columnOrder,
            colorPalette: [
                '#7162FF',
                '#1A1B1E',
                '#2F9E44',
                '#E8590C',
                '#1C7ED6',
                '#AE3EC9',
                '#F59F00',
            ],
            cases,
        }),
    );
    expect(cases.length).toBeGreaterThan(100);
});
