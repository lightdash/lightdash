import {
    TableCalculationTemplateType,
    type MetricQuery,
    type TableCalculation,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dataAppVizFieldPoolsFromMetricQuery } from './autoMapDataAppVizFields';
import {
    bindableTableCalculations,
    retainBoundTableCalculations,
} from './chartTypePreviewTableCalcs';

const query = (calcs: TableCalculation[]): MetricQuery => ({
    exploreName: 'customers',
    dimensions: ['customers_channel', 'customers_plan'],
    metrics: ['customers_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: calcs,
});

const sqlCalc = (name: string, sql: string): TableCalculation => ({
    name,
    displayName: name,
    sql,
});

describe('bindableTableCalculations', () => {
    it('offers a calculation whose references are all in the query', () => {
        const calcs = [sqlCalc('share', '${customers_count} / 100')];

        expect(bindableTableCalculations(query(calcs))).toEqual(calcs);
    });

    it('resolves a table.field reference the way the compiler does', () => {
        const calcs = [sqlCalc('share', '${customers.count} * 2')];

        expect(bindableTableCalculations(query(calcs))).toEqual(calcs);
    });

    it('withholds a calculation referencing a column the query lacks', () => {
        const calcs = [sqlCalc('share', '${orders_total} / 100')];

        expect(bindableTableCalculations(query(calcs))).toEqual([]);
    });

    it('withholds a formula calculation, whose references it cannot read', () => {
        const calcs: TableCalculation[] = [
            { name: 'share', displayName: 'Share', formula: 'SUM(count)' },
        ];

        expect(bindableTableCalculations(query(calcs))).toEqual([]);
    });

    it('follows a reference to another calculation', () => {
        const base = sqlCalc('half', '${customers_count} / 2');
        const built = sqlCalc('quarter', '${half} / 2');

        expect(bindableTableCalculations(query([base, built]))).toEqual([
            base,
            built,
        ]);
    });

    it('withholds a calculation built on an unreadable one', () => {
        const unreadable: TableCalculation = {
            name: 'half',
            displayName: 'Half',
            formula: 'count / 2',
        };
        const built = sqlCalc('quarter', '${half} / 2');

        expect(bindableTableCalculations(query([unreadable, built]))).toEqual(
            [],
        );
    });

    it('reads a template calculation’s field, order and partition', () => {
        const ranked: TableCalculation = {
            name: 'rank',
            displayName: 'Rank',
            template: {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId: 'customers_count',
                orderBy: [{ fieldId: 'customers_channel', order: 'asc' }],
            },
        };

        expect(bindableTableCalculations(query([ranked]))).toEqual([ranked]);
    });

    it('keeps an unreadable calculation out of the bindable pools', () => {
        const pools = dataAppVizFieldPoolsFromMetricQuery(
            query([
                sqlCalc('share', '${customers_count} / 100'),
                sqlCalc('gone', '${orders_total} / 100'),
            ]),
        );

        expect(pools.metric).toEqual(['customers_count', 'share']);
    });
});

describe('retainBoundTableCalculations', () => {
    it('keeps a bound calculation and the columns it names', () => {
        const result = retainBoundTableCalculations(
            query([
                sqlCalc('share', '${customers_count} / 100'),
                sqlCalc('unused', '${customers_plan} || ""'),
            ]),
            ['share'],
        );

        expect(result.tableCalculations.map((calc) => calc.name)).toEqual([
            'share',
        ]);
        expect(result.referencedFieldIds).toEqual(['customers_count']);
    });

    it('keeps the calculations a bound one builds on', () => {
        const result = retainBoundTableCalculations(
            query([
                sqlCalc('half', '${customers_count} / 2'),
                sqlCalc('quarter', '${half} / 2'),
            ]),
            ['quarter'],
        );

        expect(result.tableCalculations.map((calc) => calc.name)).toEqual([
            'half',
            'quarter',
        ]);
        expect(result.referencedFieldIds).toEqual(['customers_count']);
    });

    it('drops every calculation when nothing binds one', () => {
        const result = retainBoundTableCalculations(
            query([sqlCalc('share', '${customers_count} / 100')]),
            [],
        );

        expect(result.tableCalculations).toEqual([]);
        expect(result.referencedFieldIds).toEqual([]);
    });
});
