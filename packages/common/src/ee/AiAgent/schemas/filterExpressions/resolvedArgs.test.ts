import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { filtersSchemaTransformed } from '../filters';
import {
    toolRunQueryArgsSchemaPersisted,
    toolRunQueryArgsSchemaTransformed,
} from '../tools/toolRunQueryArgs';
import {
    filterExpressionResolvedFiltersSchema,
    filterExpressionResolvedFiltersSchemaTransformed,
    filterExpressionResolvedFiltersSchemaV1,
    filterExpressionResolvedFiltersSchemaV2,
    toolRunQueryExpressionResolvedArgsSchema,
    toolRunQueryExpressionResolvedArgsSchemaTransformed,
} from './resolvedArgs';

const stringRule = {
    fieldId: 'orders_status',
    fieldType: DimensionType.STRING,
    fieldFilterType: FilterType.STRING,
    operator: FilterOperator.EQUALS,
    values: ['completed'],
};

const secondStringRule = {
    fieldId: 'orders_region',
    fieldType: DimensionType.STRING,
    fieldFilterType: FilterType.STRING,
    operator: FilterOperator.EQUALS,
    values: ['emea'],
};

const numberRule = {
    fieldId: 'orders_revenue',
    fieldType: MetricType.SUM,
    fieldFilterType: FilterType.NUMBER,
    operator: FilterOperator.GREATER_THAN,
    values: [100],
};

const tableCalculationRule = {
    fieldId: 'profit_margin',
    fieldType: DimensionType.NUMBER,
    fieldFilterType: FilterType.NUMBER,
    operator: FilterOperator.LESS_THAN,
    values: [0.2],
};

const perCategoryFilters = {
    dimensions: {
        connector: 'and',
        rules: [stringRule, secondStringRule],
    },
    metrics: {
        connector: 'or',
        rules: [numberRule],
    },
    tableCalculations: {
        connector: 'and',
        rules: [tableCalculationRule],
    },
};

const legacyFilters = {
    type: 'or',
    dimensions: [stringRule, secondStringRule],
    metrics: [numberRule],
    tableCalculations: null,
};

const withoutGeneratedIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutGeneratedIds);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => key !== 'id')
                .map(([key, entry]) => [key, withoutGeneratedIds(entry)]),
        );
    }
    return value;
};

describe('filterExpressionResolvedFiltersSchema', () => {
    it('parses the strict per-category V2 shape', () => {
        expect(
            filterExpressionResolvedFiltersSchemaV2.parse(perCategoryFilters),
        ).toEqual(perCategoryFilters);
    });

    it('keeps an all-null V1 payload out of the strict V2 parser', () => {
        const allNullV1 = {
            type: 'and',
            dimensions: null,
            metrics: null,
            tableCalculations: null,
        };

        expect(
            filterExpressionResolvedFiltersSchemaV2.safeParse(allNullV1)
                .success,
        ).toBe(false);
        expect(
            filterExpressionResolvedFiltersSchemaV1.parse(allNullV1),
        ).toEqual(allNullV1);
        expect(filterExpressionResolvedFiltersSchema.parse(allNullV1)).toEqual(
            allNullV1,
        );
    });

    it('rejects malformed V2 payloads instead of stripping them', () => {
        expect(
            filterExpressionResolvedFiltersSchemaV2.safeParse({
                ...perCategoryFilters,
                unknownKey: true,
            }).success,
        ).toBe(false);
        expect(
            filterExpressionResolvedFiltersSchemaV2.safeParse({
                ...perCategoryFilters,
                dimensions: { connector: 'and', rules: [] },
            }).success,
        ).toBe(false);
        expect(
            filterExpressionResolvedFiltersSchemaV2.safeParse({
                ...perCategoryFilters,
                tableCalculations: {
                    connector: 'and',
                    rules: [stringRule],
                },
            }).success,
        ).toBe(false);
    });

    it('still parses the V1 shared-connector object unchanged', () => {
        expect(
            filterExpressionResolvedFiltersSchema.parse(legacyFilters),
        ).toEqual(legacyFilters);
    });

    it('normalizes V2 payloads to independent domain filter groups', () => {
        const filters =
            filterExpressionResolvedFiltersSchemaTransformed.parse(
                perCategoryFilters,
            );
        expect(filters.dimensions).toMatchObject({
            and: [
                { target: { fieldId: 'orders_status' } },
                { target: { fieldId: 'orders_region' } },
            ],
        });
        expect(filters.dimensions).not.toHaveProperty('or');
        expect(filters.metrics).toMatchObject({
            or: [{ target: { fieldId: 'orders_revenue' } }],
        });
        expect(filters.metrics).not.toHaveProperty('and');
        expect(filters.tableCalculations).toMatchObject({
            and: [{ target: { fieldId: 'profit_margin' } }],
        });
    });

    it('normalizes legacy and null payloads exactly like the legacy transform', () => {
        expect(
            withoutGeneratedIds(
                filterExpressionResolvedFiltersSchemaTransformed.parse(
                    legacyFilters,
                ),
            ),
        ).toEqual(
            withoutGeneratedIds(filtersSchemaTransformed.parse(legacyFilters)),
        );
        expect(
            withoutGeneratedIds(
                filterExpressionResolvedFiltersSchemaTransformed.parse(null),
            ),
        ).toEqual(withoutGeneratedIds(filtersSchemaTransformed.parse(null)));
    });
});

describe('toolRunQueryExpressionResolvedArgsSchema', () => {
    const legacyResolvedArgs = {
        title: 'Revenue by region',
        description: 'Resolved query',
        queryConfig: {
            exploreName: 'orders',
            dimensions: ['orders_region'],
            metrics: ['orders_revenue'],
            sorts: [],
            limit: 500,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: legacyFilters,
        },
        chartConfig: null,
        mergeConfig: {
            primarySourceId: 'orders',
            additionalSources: [
                {
                    id: 'targets',
                    queryConfig: {
                        exploreName: 'targets',
                        dimensions: ['targets_region'],
                        metrics: ['targets_target'],
                        sorts: [],
                        customMetrics: null,
                        filters: {
                            type: 'and',
                            dimensions: [stringRule],
                            metrics: null,
                            tableCalculations: null,
                        },
                    },
                },
            ],
            joinKey: [
                {
                    name: 'region',
                    fields: [
                        { sourceId: 'orders', fieldId: 'orders_region' },
                        { sourceId: 'targets', fieldId: 'targets_region' },
                    ],
                },
            ],
            joinType: 'full',
        },
    };

    it('accepts every payload the legacy persisted contract accepts, unchanged', () => {
        const legacyParsed =
            toolRunQueryArgsSchemaPersisted.parse(legacyResolvedArgs);
        expect(
            toolRunQueryExpressionResolvedArgsSchema.parse(legacyResolvedArgs),
        ).toEqual(legacyParsed);
    });

    it('replays legacy resolved data exactly like the legacy transform', () => {
        expect(
            withoutGeneratedIds(
                toolRunQueryExpressionResolvedArgsSchemaTransformed.parse(
                    legacyResolvedArgs,
                ),
            ),
        ).toEqual(
            withoutGeneratedIds(
                toolRunQueryArgsSchemaTransformed.parse(legacyResolvedArgs),
            ),
        );
    });

    it('round-trips per-category resolved filters in primary and merge sources', () => {
        const perCategoryResolvedArgs = {
            ...legacyResolvedArgs,
            queryConfig: {
                ...legacyResolvedArgs.queryConfig,
                filters: perCategoryFilters,
            },
            mergeConfig: {
                ...legacyResolvedArgs.mergeConfig,
                additionalSources: [
                    {
                        id: 'targets',
                        queryConfig: {
                            ...legacyResolvedArgs.mergeConfig
                                .additionalSources[0].queryConfig,
                            filters: {
                                dimensions: null,
                                metrics: {
                                    connector: 'or',
                                    rules: [numberRule],
                                },
                                tableCalculations: null,
                            },
                        },
                    },
                ],
            },
        };

        const parsed = toolRunQueryExpressionResolvedArgsSchema.parse(
            perCategoryResolvedArgs,
        );
        expect(parsed.queryConfig.filters).toEqual(perCategoryFilters);

        const transformed =
            toolRunQueryExpressionResolvedArgsSchemaTransformed.parse(parsed);
        expect(transformed.queryConfig.filters.dimensions).toMatchObject({
            and: [expect.anything(), expect.anything()],
        });
        expect(transformed.queryConfig.filters.metrics).toMatchObject({
            or: [expect.anything()],
        });
        expect(
            transformed.mergeConfig?.additionalSources[0].queryConfig.filters
                .metrics,
        ).toMatchObject({ or: [{ target: { fieldId: 'orders_revenue' } }] });
    });
});
