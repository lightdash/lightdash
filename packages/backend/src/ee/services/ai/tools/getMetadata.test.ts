import {
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    type Explore,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import { executeGetMetadata, getGetMetadata } from './getMetadata';

// A description that enumerates valid filter values, longer than the old 240
// cap. This is the exact pattern that used to be silently cut off, leaving the
// agent unable to see (and therefore filter on) the later values.
const longDescription = `Allowed values: ${Array.from(
    { length: 40 },
    (_, i) => `'value_${i}'`,
).join(', ')}.`;

const makeExplore = (overrides: {
    baseTableDescription?: string;
    fieldDescription?: string;
    requiredFilters?: ModelRequiredFilterRule[];
}): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'sales',
    label: 'Sales',
    tags: [],
    spotlight: { visibility: 'show', categories: [] },
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'test_db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: overrides.baseTableDescription,
            requiredFilters: overrides.requiredFilters,
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.status',
                    tablesReferences: ['orders'],
                    description: overrides.fieldDescription,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
});

type ExecuteResult = { result: string; metadata: { status: string } };

const execute = async (
    explore: Explore,
    requests: Parameters<
        NonNullable<ReturnType<typeof getGetMetadata>['execute']>
    >[0]['requests'],
): Promise<ExecuteResult> => {
    const tool = getGetMetadata({ availableExplores: [explore] });
    const result = await tool.execute!(
        { requests },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
    return result as ExecuteResult;
};

describe('getMetadata description truncation', () => {
    it('returns a long field description in full (above the old 240 cap)', async () => {
        expect(longDescription.length).toBeGreaterThan(240);

        const explore = makeExplore({ fieldDescription: longDescription });
        const result = await execute(explore, [
            {
                type: 'field',
                fields: [{ exploreId: 'sales', fieldId: 'orders_status' }],
            },
        ]);

        expect(result.metadata).toEqual({ status: 'success' });
        // The full enumerated list must be present — including the last value,
        // which the old 240-char cap dropped.
        expect(result.result).toContain(`description: ${longDescription}`);
        expect(result.result).toContain("'value_39'");
    });

    it('keeps the explore-level summary terse (caps the base table description)', async () => {
        const explore = makeExplore({ baseTableDescription: longDescription });
        const result = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);

        expect(result.metadata).toEqual({ status: 'success' });
        const descriptionLine = result.result
            .split('\n')
            .find((line) => line.includes('description:'));
        expect(descriptionLine).toBeDefined();
        // Explore summaries stay compact: the description is capped at 240 chars.
        expect(descriptionLine).not.toContain("'value_39'");
    });
});

describe('getMetadata group AI hints', () => {
    it('resolves group hints only when rendering a field for the agent', async () => {
        const explore = makeExplore({});
        explore.tables.orders.groupDetails = {
            settlements: {
                label: 'Settlements',
                aiHint: 'Use for zephyr settlement questions.',
            },
        };
        explore.tables.orders.dimensions.status.groups = ['settlements'];

        const result = await execute(explore, [
            {
                type: 'field',
                fields: [{ exploreId: 'sales', fieldId: 'orders_status' }],
            },
        ]);

        expect(result.result).toContain(
            'hint: Use for zephyr settlement questions.',
        );
    });

    it('ignores malformed explore, field, and group hints', async () => {
        const explore = makeExplore({});
        explore.aiHint = { invalid: true } as unknown as string[];
        explore.tables.orders.dimensions.status.aiHint = [
            'Valid field hint.',
            { Formula: 'clicks + keys' },
        ] as unknown as string[];
        explore.tables.orders.dimensions.status.groups = ['settlements'];
        explore.tables.orders.groupDetails = {
            settlements: {
                label: 'Settlements',
                aiHint: { invalid: true } as unknown as string[],
            },
        };

        const exploreResult = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);
        const fieldResult = await execute(explore, [
            {
                type: 'field',
                fields: [{ exploreId: 'sales', fieldId: 'orders_status' }],
            },
        ]);

        expect(exploreResult.metadata).toEqual({ status: 'success' });
        expect(exploreResult.result).not.toContain('[object Object]');
        expect(fieldResult.metadata).toEqual({ status: 'success' });
        expect(fieldResult.result).toContain('hint: Valid field hint.');
        expect(fieldResult.result).not.toContain('[object Object]');
    });
});

describe('getMetadata explore field listing', () => {
    // The explore summary must list the base table's field ids directly: when
    // field discovery (grep/FTS) misbehaves, this is the agent's ground-truth
    // escape hatch before claiming a field doesn't exist. Pointing back at
    // grepFields ("use grepFields to list them") was circular.
    it('lists base-table field ids in the explore summary', async () => {
        const explore = makeExplore({});
        const result = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);

        expect(result.metadata).toEqual({ status: 'success' });
        expect(result.result).toContain('orders_status');
        expect(result.result).not.toContain('use grepFields to list them');
    });

    it('does not list hidden fields', async () => {
        const explore = makeExplore({});
        explore.tables.orders.dimensions.secret = {
            ...explore.tables.orders.dimensions.status,
            name: 'secret',
            label: 'Secret',
            hidden: true,
        };
        const result = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);
        expect(result.result).not.toContain('orders_secret');
    });

    it('does not return hidden fields when requested directly', async () => {
        const explore = makeExplore({});
        explore.tables.orders.dimensions.secret = {
            ...explore.tables.orders.dimensions.status,
            name: 'secret',
            label: 'Secret',
            hidden: true,
        };

        const result = await execute(explore, [
            {
                type: 'field',
                fields: [{ exploreId: 'sales', fieldId: 'orders_secret' }],
            },
        ]);

        expect(result.metadata).toEqual({ status: 'success' });
        expect(result.result).toBe(
            'Field "orders_secret" not found in explore "sales".',
        );
    });

    it('truncates very wide base tables with a "+N more" marker', async () => {
        const explore = makeExplore({});
        for (let i = 0; i < 150; i += 1) {
            explore.tables.orders.dimensions[`attr_${i}`] = {
                ...explore.tables.orders.dimensions.status,
                name: `attr_${i}`,
                label: `Attr ${i}`,
            };
        }
        const result = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);
        expect(result.result).toMatch(/\+\d+ more \(grepFields lists them\)/);
    });

    it('shows required and suggested filters distinctly', async () => {
        const explore = makeExplore({
            requiredFilters: [
                {
                    id: 'required-filter',
                    target: { fieldRef: 'created_at' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [90],
                    required: true,
                },
                {
                    id: 'default-filter',
                    target: { fieldRef: 'status' },
                    operator: FilterOperator.EQUALS,
                    values: ['active'],
                    required: false,
                },
            ],
        });
        const result = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);

        expect(result.result).toContain('⚠ table filters:');
        expect(result.result).toContain(
            'required orders_created_at inThePast [90]',
        );
        expect(result.result).toContain(
            'suggested orders_status equals ["active"]',
        );
        expect(result.result).not.toContain('must be applied');
    });
});

describe('getMetadata default time dimensions', () => {
    it('shows the metric resolved model-level defaultTimeDimension', async () => {
        const explore = makeExplore({});
        explore.tables.orders.defaultTimeDimension = {
            field: 'created_at',
            interval: TimeFrames.MONTH,
        };
        explore.tables.orders.metrics.revenue = {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'revenue',
            label: 'Revenue',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'SUM(${TABLE}.revenue)',
            hidden: false,
            compiledSql: 'SUM(orders.revenue)',
            tablesReferences: ['orders'],
        };

        const result = await execute(explore, [
            {
                type: 'field',
                fields: [{ exploreId: 'sales', fieldId: 'orders_revenue' }],
            },
        ]);

        expect(result.result).toContain(
            'default_time_dimension: orders_created_at',
        );
        expect(result.result).toContain(
            'default_time_dimension_granularity: orders_created_at_month',
        );

        const structured = executeGetMetadata(
            {
                requests: [
                    {
                        type: 'field',
                        fields: [
                            {
                                exploreId: 'sales',
                                fieldId: 'orders_revenue',
                            },
                        ],
                    },
                ],
            },
            { availableExplores: [explore] },
        );
        expect(structured.structuredContent.fields[0]).toMatchObject({
            status: 'found',
            defaultTimeDimension: 'orders_created_at',
            defaultTimeDimensionGranularity: 'orders_created_at_month',
        });
    });
});
