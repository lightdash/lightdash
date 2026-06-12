import {
    toolRunQueryArgsSchema,
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

describe('toolRunQueryArgsSchema', () => {
    it('uses the V2 queryConfig shape for the current schema', () => {
        const v2Args = {
            ...baseArgs,
            queryConfig: {
                ...baseQueryConfig,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
        };

        expect(toolRunQueryArgsSchemaV2.safeParse(v2Args).success).toBe(true);
        expect(toolRunQueryArgsSchema.safeParse(v2Args).success).toBe(true);
    });

    it('keeps V1 available for strict parsing of old tool args', () => {
        const v1Args = {
            ...baseArgs,
            customMetrics: null,
            tableCalculations: null,
            queryConfig: baseQueryConfig,
            filters: null,
        };

        expect(toolRunQueryArgsSchemaV1.safeParse(v1Args).success).toBe(true);
        expect(toolRunQueryArgsSchema.safeParse(v1Args).success).toBe(false);
    });

    it('normalizes V1 and V2 args to the same internal shape', () => {
        const v1Args = {
            ...baseArgs,
            customMetrics: null,
            tableCalculations: null,
            queryConfig: baseQueryConfig,
            filters: null,
        };
        const v2Args = {
            ...baseArgs,
            queryConfig: {
                ...baseQueryConfig,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
        };

        const v1Parsed = toolRunQueryArgsSchemaTransformed.parse(v1Args);
        const v2Parsed = toolRunQueryArgsSchemaTransformed.parse(v2Args);

        expect(v1Parsed).toMatchObject({
            title: baseArgs.title,
            description: baseArgs.description,
            customMetrics: null,
            tableCalculations: null,
            queryConfig: baseQueryConfig,
            chartConfig: null,
        });
        expect(v2Parsed).toMatchObject({
            title: baseArgs.title,
            description: baseArgs.description,
            customMetrics: null,
            tableCalculations: null,
            queryConfig: baseQueryConfig,
            chartConfig: null,
        });
    });
});
