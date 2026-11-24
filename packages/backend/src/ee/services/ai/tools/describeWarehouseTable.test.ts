import {
    DimensionType,
    METRIC_VIEW_TABLE_TYPE,
    PartitionGranularity,
    PartitionType,
    toolDescribeWarehouseTableOutputSchema,
    WarehouseTableType,
    WarehouseTypes,
    type TablePartitioning,
    type ToolDescribeWarehouseTableOutput,
    type WarehouseTableMetadata,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDescribeWarehouseTable } from './describeWarehouseTable';

const describeWith = async (
    partitioning: TablePartitioning | null,
    warehouseType = WarehouseTypes.BIGQUERY,
    metadata: WarehouseTableMetadata | null = null,
) => {
    const tool = getDescribeWarehouseTable({
        describeWarehouseTable: async () => ({
            columns: [
                { name: 'order_id', type: 'string', nativeType: null },
                { name: 'created_at', type: 'timestamp', nativeType: null },
            ],
            resolvedSchema: 'analytics',
            resolvedDatabase: 'example-project',
            partitioning,
            metadata,
            warehouseType,
        }),
    });
    const output = await tool.execute!(
        { table: 'fact_orders' },
        { toolCallId: 'test', messages: [], context: {} },
    );
    return toolDescribeWarehouseTableOutputSchema.parse(output);
};

const dayPartitioned: TablePartitioning = {
    partitionColumn: {
        field: 'created_at',
        partitionType: PartitionType.DATE,
    },
    granularity: PartitionGranularity.DAY,
    requiresPartitionFilter: false,
};

describe('describeWarehouseTable partitioning', () => {
    it('states the partition column and how to filter it above the columns', async () => {
        const output = await describeWith(dayPartitioned);

        expect(output.result).toBe(
            [
                'Columns for `example-project.analytics.fact_orders` (2):',
                'Partitioned by `created_at` (DAY). Filter `created_at` directly against constant bounds (literals, or CURRENT_DATE()/CURRENT_TIMESTAMP() expressions) so BigQuery reads only the partitions you need; queries without that filter run but read and bill every partition.',
                '  - order_id: string',
                '  - created_at: timestamp',
            ].join('\n'),
        );
        expect(output.structuredContent).toMatchObject({
            partitioning: dayPartitioned,
        });
    });

    it('says when queries without a partition filter fail', async () => {
        const output = await describeWith({
            partitionColumn: {
                field: '_PARTITIONTIME',
                partitionType: PartitionType.DATE,
            },
            granularity: PartitionGranularity.HOUR,
            requiresPartitionFilter: true,
        });

        expect(output.result).toContain(
            'Partitioned by `_PARTITIONTIME` (HOUR). Filter `_PARTITIONTIME` directly against constant bounds (literals, or CURRENT_DATE()/CURRENT_TIMESTAMP() expressions) so BigQuery reads only the partitions you need; queries without that filter fail.',
        );
    });

    it('describes integer-range partitions', async () => {
        const output = await describeWith({
            partitionColumn: {
                field: 'customer_id',
                partitionType: PartitionType.RANGE,
            },
            granularity: null,
            requiresPartitionFilter: false,
        });

        expect(output.result).toContain(
            'Partitioned by `customer_id` (integer ranges). Filter `customer_id` directly against constant bounds (integer literals) so BigQuery reads only the partitions you need; queries without that filter run but read and bill every partition.',
        );
    });

    it('states only the fact on warehouses without filter guidance', async () => {
        const output = await describeWith(
            dayPartitioned,
            WarehouseTypes.DATABRICKS,
        );

        expect(output.result.split('\n')[1]).toBe(
            'Partitioned by `created_at` (DAY).',
        );
    });

    it('adds nothing for an unpartitioned table', async () => {
        const output = await describeWith(null);

        expect(output.result).toBe(
            [
                'Columns for `example-project.analytics.fact_orders` (2):',
                '  - order_id: string',
                '  - created_at: timestamp',
            ].join('\n'),
        );
        expect(output.structuredContent).toMatchObject({ partitioning: null });
    });
});

describe('describeWarehouseTable', () => {
    it('shows the native type next to columns whose type it disambiguates', async () => {
        const tool = getDescribeWarehouseTable({
            describeWarehouseTable: async () => ({
                columns: [
                    {
                        name: 'created_at_local',
                        type: 'timestamp',
                        nativeType: 'DATETIME',
                    },
                    {
                        name: 'departure_at',
                        type: 'timestamp',
                        nativeType: 'TIMESTAMP',
                    },
                    {
                        name: 'pickup_time',
                        type: 'timestamp',
                        nativeType: 'TIME',
                    },
                    { name: 'name', type: 'string', nativeType: null },
                ],
                resolvedSchema: 'travel',
                resolvedDatabase: 'analytics',
                partitioning: null,
                metadata: null,
                warehouseType: WarehouseTypes.BIGQUERY,
            }),
        });

        const output = (await tool.execute!(
            { table: 'trips' },
            { toolCallId: 'test', messages: [], context: {} },
        )) as ToolDescribeWarehouseTableOutput;

        expect(output.result).toBe(
            [
                'Columns for `analytics.travel.trips` (4):',
                '  - created_at_local: timestamp (DATETIME)',
                '  - departure_at: timestamp (TIMESTAMP)',
                '  - pickup_time: timestamp (TIME)',
                '  - name: string',
            ].join('\n'),
        );
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('returns a schema-valid error when the lookup fails', async () => {
        const tool = getDescribeWarehouseTable({
            describeWarehouseTable: async () => {
                throw new Error('table not found');
            },
        });

        const output = (await tool.execute!(
            { table: 'trips' },
            { toolCallId: 'test', messages: [], context: {} },
        )) as ToolDescribeWarehouseTableOutput;

        expect(output.metadata.status).toBe('error');
        expect(
            toolDescribeWarehouseTableOutputSchema.safeParse(output).success,
        ).toBe(true);
    });
});

describe('describeWarehouseTable metadata', () => {
    it('adds the table type and comments next to the columns', async () => {
        const metadata: WarehouseTableMetadata = {
            tableType: WarehouseTableType.TABLE,
            comment: 'One row per order',
            columns: [
                {
                    name: 'order_id',
                    type: DimensionType.STRING,
                    comment: 'Order key',
                    isMeasure: false,
                },
                {
                    name: 'created_at',
                    type: DimensionType.TIMESTAMP,
                    comment: null,
                    isMeasure: false,
                },
            ],
            definition: null,
        };

        const output = await describeWith(
            null,
            WarehouseTypes.DATABRICKS,
            metadata,
        );

        expect(output.result).toBe(
            [
                'Columns for `example-project.analytics.fact_orders` (2):',
                'Table type: table',
                'Table comment: One row per order',
                '  - order_id: string. Comment: Order key',
                '  - created_at: timestamp',
            ].join('\n'),
        );
        expect(output.structuredContent).toMatchObject({ metadata });
    });

    it('marks measures and shows a metric view definition', async () => {
        const output = await describeWith(null, WarehouseTypes.DATABRICKS, {
            tableType: METRIC_VIEW_TABLE_TYPE,
            comment: null,
            columns: [
                {
                    name: 'order_id',
                    type: DimensionType.STRING,
                    comment: null,
                    isMeasure: true,
                },
                {
                    name: 'created_at',
                    type: DimensionType.TIMESTAMP,
                    comment: null,
                    isMeasure: false,
                },
            ],
            definition: {
                text: 'version: 1.1\nsource: <catalog>.<schema>.<table>',
                truncated: false,
            },
        });

        expect(output.result).toBe(
            [
                'Columns for `example-project.analytics.fact_orders` (2):',
                'Table type: metric view',
                '  - order_id: string. Measure',
                '  - created_at: timestamp',
                'Metric view definition:',
                'version: 1.1',
                'source: <catalog>.<schema>.<table>',
            ].join('\n'),
        );
    });

    it('returns no metadata where the warehouse does not describe tables', async () => {
        const output = await describeWith(null);

        expect(output.result).not.toContain('Table type');
        expect(output.structuredContent).toMatchObject({ metadata: null });
    });
});
