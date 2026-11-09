import {
    AuthorizationError,
    FilterOperator,
    MetricType,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { validExplore } from '../ProjectService/ProjectService.mock';
import {
    assertMetricQueryFieldsVisible,
    getMetricQueryFieldReferences,
} from './composerChartFieldAccess';

// `a_dim1` and `a_met1` stay visible; table `b` (and `b_dim1`) is hidden by a
// user attribute, so it only appears in `unfilteredTables`.
const filteredExplore: Explore = {
    ...validExplore,
    tables: { a: validExplore.tables.a },
    joinedTables: [],
    unfilteredTables: validExplore.tables,
};

const query = (overrides: Partial<MetricQuery>): MetricQuery => ({
    exploreName: validExplore.name,
    dimensions: ['a_dim1'],
    metrics: ['a_met1'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const filterOn = (fieldId: string) => ({
    id: 'group',
    and: [
        {
            id: 'rule',
            target: { fieldId },
            operator: FilterOperator.EQUALS,
            values: [1],
        },
    ],
});

describe('getMetricQueryFieldReferences', () => {
    test('collects selected fields, filter targets and custom-field bases once each', () => {
        expect(
            getMetricQueryFieldReferences(
                query({
                    filters: {
                        dimensions: filterOn('a_dim1'),
                        metrics: filterOn('b_met2'),
                    },
                    additionalMetrics: [
                        {
                            name: 'dim1_count',
                            table: 'b',
                            type: MetricType.COUNT,
                            sql: '${TABLE}.dim1',
                            baseDimensionName: 'dim1',
                        },
                    ],
                }),
            ),
        ).toEqual(['a_dim1', 'a_met1', 'b_met2', 'b_dim1']);
    });
});

describe('assertMetricQueryFieldsVisible', () => {
    test('passes when every field is in the filtered explore', () => {
        expect(() =>
            assertMetricQueryFieldsVisible(query({}), filteredExplore),
        ).not.toThrow();
    });

    test.each([
        ['a selected dimension', query({ dimensions: ['a_dim1', 'b_dim1'] })],
        [
            'a filter target',
            query({ filters: { dimensions: filterOn('b_dim1') } }),
        ],
        [
            'the base dimension of a custom metric',
            query({
                metrics: ['b_dim1_count'],
                additionalMetrics: [
                    {
                        name: 'dim1_count',
                        table: 'b',
                        type: MetricType.COUNT,
                        sql: '${TABLE}.dim1',
                        baseDimensionName: 'dim1',
                    },
                ],
            }),
        ],
    ])(
        'refuses with the explore authorization error when %s is hidden',
        (_label, metricQuery) => {
            expect(() =>
                assertMetricQueryFieldsVisible(metricQuery, filteredExplore),
            ).toThrow(AuthorizationError);
        },
    );

    test('leaves a field that exists nowhere to the compiler', () => {
        expect(() =>
            assertMetricQueryFieldsVisible(
                query({ dimensions: ['a_missing'] }),
                filteredExplore,
            ),
        ).not.toThrow();
    });

    test('an explore without attribute filtering hides nothing', () => {
        expect(() =>
            assertMetricQueryFieldsVisible(query({ dimensions: ['b_dim1'] }), {
                ...filteredExplore,
                unfilteredTables: undefined,
            }),
        ).not.toThrow();
    });
});
