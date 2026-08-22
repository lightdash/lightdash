import {
    DimensionType,
    ParameterError,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type GroupLimit,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import {
    applyGroupLimit,
    buildGroupLimitRankingQuery,
    getGroupLimitOtherLabel,
    validateGroupLimit,
} from './groupLimit';

const groupLimit: GroupLimit = {
    dimensionId: 'a_dim1',
    rankByMetricId: 'a_met1',
    limit: 5,
};

const metricQuery: MetricQuery = {
    ...metricQueryMock,
    dimensions: ['a_dim1'],
    metrics: ['a_met1'],
};

const pivotConfiguration: PivotConfiguration = {
    indexColumn: { reference: 'a_dim1', type: VizIndexType.CATEGORY },
    valuesColumns: [
        { reference: 'a_met1', aggregation: VizAggregationOptions.SUM },
    ],
    groupByColumns: [{ reference: 'a_dim1' }],
    sortBy: [{ reference: 'a_dim1', direction: SortByDirection.ASC }],
};

describe('groupLimit', () => {
    test('builds a globally ranked query with the original filters and a not-null filter', () => {
        const rankingQuery = buildGroupLimitRankingQuery({
            metricQuery,
            groupLimit,
        });

        expect(rankingQuery).toMatchObject({
            dimensions: ['a_dim1'],
            metrics: ['a_met1'],
            sorts: [
                { fieldId: 'a_met1', descending: true },
                { fieldId: 'a_dim1', descending: false },
            ],
            limit: 5,
        });
        expect(rankingQuery.filters.dimensions).toEqual({
            id: 'group-limit-dimension-filters',
            and: [
                expect.objectContaining({
                    id: 'group-limit-not-null',
                    operator: 'notNull',
                    target: { fieldId: 'a_dim1' },
                }),
            ],
        });
    });

    test('validates pivot capacity at the boundary', () => {
        expect(() =>
            validateGroupLimit({
                groupLimit,
                metricQuery,
                explore: validExplore,
                pivotConfiguration,
                maxColumnLimit: 6,
            }),
        ).not.toThrow();

        expect(() =>
            validateGroupLimit({
                groupLimit,
                metricQuery,
                explore: validExplore,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    valuesColumns: [
                        ...pivotConfiguration.valuesColumns,
                        {
                            reference: 'a_met1',
                            aggregation: VizAggregationOptions.AVERAGE,
                        },
                    ],
                },
                maxColumnLimit: 11,
            }),
        ).toThrow(ParameterError);
    });

    test('rejects non-string dimensions', () => {
        const dimension = validExplore.tables.a.dimensions.dim1;
        expect(() =>
            validateGroupLimit({
                groupLimit,
                metricQuery,
                explore: {
                    ...validExplore,
                    tables: {
                        ...validExplore.tables,
                        a: {
                            ...validExplore.tables.a,
                            dimensions: {
                                ...validExplore.tables.a.dimensions,
                                dim1: {
                                    ...dimension,
                                    type: DimensionType.NUMBER,
                                },
                            },
                        },
                    },
                },
                maxColumnLimit: 100,
            }),
        ).toThrow(ParameterError);
    });

    test('resolves label collisions and marks the synthesized dimension', () => {
        expect(
            getGroupLimitOtherLabel([
                'Other',
                'Other (grouped)',
                'Other (grouped) 2',
            ]),
        ).toBe('Other (grouped) 3');

        const dimension = validateGroupLimit({
            groupLimit,
            metricQuery,
            explore: validExplore,
            pivotConfiguration,
            maxColumnLimit: 100,
        });
        const result = applyGroupLimit({
            metricQuery,
            pivotConfiguration,
            explore: validExplore,
            dimension,
            groupLimit,
            topValues: ['Other', 'United Kingdom'],
        });

        expect(result.metricQuery.dimensions).toEqual(['a_dim1_group_limit']);
        expect(result.metricQuery.sorts.at(-1)).toEqual({
            fieldId: 'a_dim1_group_limit',
            descending: false,
        });
        expect(result.metricQuery.customDimensions?.at(-1)).toMatchObject({
            id: 'a_dim1_group_limit',
            isGroupLimit: true,
            otherLabel: 'Other (grouped)',
        });
        expect(result.pivotConfiguration?.groupByColumns).toEqual([
            { reference: 'a_dim1_group_limit' },
        ]);
    });
});
