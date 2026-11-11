import { describe, expect, it } from 'vitest';
import { getResultSource } from './tileExecutionInfo.utils';

const planTimeHit = { cacheHit: false, preAggregate: { hit: true } };

describe('getResultSource', () => {
    it('shows the pre-aggregate engine when it served the results', () => {
        expect(
            getResultSource(planTimeHit, {
                execution: 'duckdb',
                fallbackReason: null,
            }),
        ).toBe('DuckDB pre-aggregate');
    });

    it.each([
        ['duckdb', 'duckdb_execution_error', 'Warehouse (DuckDB read failed)'],
        [
            'project_warehouse',
            'external_execution_error',
            'Warehouse (external pre-aggregate failed)',
        ],
        [
            null,
            'materialization_near_expiry',
            'Warehouse (pre-aggregate expired, refresh it)',
        ],
    ] as const)(
        'shows the warehouse and the reason for %s / %s',
        (execution, fallbackReason, source) => {
            expect(
                getResultSource(planTimeHit, { execution, fallbackReason }),
            ).toBe(source);
        },
    );
});
