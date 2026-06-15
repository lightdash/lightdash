import { DimensionType } from '../../../../types/field';
import {
    FilterOperator,
    FilterType,
    type Filters,
} from '../../../../types/filter';
import { getTotalFilterRules } from '../../../../utils/filters';
import {
    isRunQueryArgsV1,
    migrateRunQueryArgsV1ToV2,
    parsePersistedRunQueryArgs,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryArgsSchemaV1,
    toolRunQueryArgsSchemaV2,
} from './toolRunQueryArgs';

const baseQueryConfig = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_revenue'],
    sorts: [],
    limit: 500,
};

const baseArgs = {
    title: 'Revenue by month',
    description: 'Monthly revenue trend',
    chartConfig: null,
};

const buildStringFilters = (fieldId: string) => ({
    type: 'and' as const,
    dimensions: [
        {
            fieldId,
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        },
    ],
    metrics: null,
    tableCalculations: null,
});

// V2: customMetrics / tableCalculations / filters nested in queryConfig
const buildV2Args = (queryConfigOverrides: Record<string, unknown> = {}) => ({
    ...baseArgs,
    queryConfig: {
        ...baseQueryConfig,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
        ...queryConfigOverrides,
    },
});

// V1: customMetrics / tableCalculations / filters at the top level
const buildV1Args = (overrides: Record<string, unknown> = {}) => ({
    ...baseArgs,
    customMetrics: null,
    tableCalculations: null,
    filters: null,
    queryConfig: baseQueryConfig,
    ...overrides,
});

const getDimensionFilterFieldIds = (filters: Filters) =>
    getTotalFilterRules(filters).map((rule) => rule.target.fieldId);

describe('toolRunQueryArgsSchemaTransformed (V2 only)', () => {
    it('parses V2 args into the nested internal shape', () => {
        const parsed = toolRunQueryArgsSchemaTransformed.parse(buildV2Args());

        expect(parsed).toMatchObject({
            title: baseArgs.title,
            description: baseArgs.description,
            queryConfig: {
                ...baseQueryConfig,
                customMetrics: null,
                tableCalculations: null,
            },
            chartConfig: null,
        });
    });

    it('rejects V1-shaped args (the tool only accepts V2)', () => {
        expect(
            toolRunQueryArgsSchemaTransformed.safeParse(buildV1Args()).success,
        ).toBe(false);
        expect(toolRunQueryArgsSchemaV2.safeParse(buildV1Args()).success).toBe(
            false,
        );
        expect(toolRunQueryArgsSchemaV1.safeParse(buildV1Args()).success).toBe(
            true,
        );
    });
});

describe('parsePersistedRunQueryArgs', () => {
    it('passes V2 artifacts through unchanged', () => {
        const parsed = parsePersistedRunQueryArgs(buildV2Args());
        expect(parsed?.queryConfig.exploreName).toBe('orders');
    });

    it('migrates V1 artifacts to the V2 internal shape', () => {
        const parsed = parsePersistedRunQueryArgs(buildV1Args());
        expect(parsed).toMatchObject({
            queryConfig: {
                ...baseQueryConfig,
                customMetrics: null,
                tableCalculations: null,
            },
        });
    });

    it('resolves filters nested in queryConfig on V1 artifacts (#17269)', () => {
        const parsed = parsePersistedRunQueryArgs(
            buildV1Args({
                queryConfig: {
                    ...baseQueryConfig,
                    filters: buildStringFilters('orders_status'),
                },
            }),
        );
        expect(getDimensionFilterFieldIds(parsed!.queryConfig.filters)).toEqual(
            ['orders_status'],
        );
    });

    it('prefers top-level filters when a V1 artifact has both', () => {
        const parsed = parsePersistedRunQueryArgs(
            buildV1Args({
                filters: buildStringFilters('orders_top_level'),
                queryConfig: {
                    ...baseQueryConfig,
                    filters: buildStringFilters('orders_nested'),
                },
            }),
        );
        expect(getDimensionFilterFieldIds(parsed!.queryConfig.filters)).toEqual(
            ['orders_top_level'],
        );
    });

    it('returns null for unparseable input', () => {
        expect(parsePersistedRunQueryArgs({ nonsense: true })).toBeNull();
    });
});

describe('migrateRunQueryArgsV1ToV2', () => {
    it('moves top-level fields into queryConfig (top-level filters win)', () => {
        const v1 = toolRunQueryArgsSchemaV1.parse(
            buildV1Args({
                filters: buildStringFilters('orders_top_level'),
                queryConfig: {
                    ...baseQueryConfig,
                    filters: buildStringFilters('orders_nested'),
                },
            }),
        );

        const v2 = migrateRunQueryArgsV1ToV2(v1);

        expect(v2.queryConfig.customMetrics).toBe(v1.customMetrics);
        expect(v2.queryConfig.tableCalculations).toBe(v1.tableCalculations);
        expect(v2.queryConfig.filters?.dimensions?.[0].fieldId).toBe(
            'orders_top_level',
        );
        expect('filters' in v2).toBe(false);
        expect('customMetrics' in v2).toBe(false);
    });
});

describe('isRunQueryArgsV1', () => {
    it('is true for parsed V1 args, false for parsed V2 args', () => {
        const v1 = toolRunQueryArgsSchemaV1.parse(buildV1Args());
        const v2 = toolRunQueryArgsSchemaV2.parse(buildV2Args());

        expect(isRunQueryArgsV1(v1)).toBe(true);
        expect(isRunQueryArgsV1(v2)).toBe(false);
    });
});
