import {
    PartitionGranularity,
    PartitionType,
    toolDescribeWarehouseTableOutputSchema,
    WarehouseTypes,
    type TablePartitioning,
    type ToolDescribeWarehouseTableOutput,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDescribeWarehouseTable } from './describeWarehouseTable';

const describeWith = async (
    partitioning: TablePartitioning | null,
    warehouseType = WarehouseTypes.BIGQUERY,
) => {
    const tool = getDescribeWarehouseTable({
        describeWarehouseTable: async () => ({
            columns: [
                { name: 'ride_id', type: 'string', nativeType: null },
                { name: 'created_at_utc', type: 'timestamp', nativeType: null },
            ],
            resolvedSchema: 'rides',
            resolvedDatabase: 'acme-prod',
            partitioning,
            warehouseType,
        }),
    });
    const output = await tool.execute!(
        { table: 'fact_ride_request' },
        { toolCallId: 'test', messages: [], context: {} },
    );
    return toolDescribeWarehouseTableOutputSchema.parse(output);
};

const dayPartitioned: TablePartitioning = {
    partitionColumn: {
        field: 'created_at_utc',
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
                'Columns for `acme-prod.rides.fact_ride_request` (2):',
                'Partitioned by `created_at_utc` (DAY). Filter `created_at_utc` directly against constant bounds (literals, or CURRENT_DATE()/CURRENT_TIMESTAMP() expressions) so BigQuery reads only the partitions you need; without that filter it reads and bills every partition.',
                '  - ride_id: string',
                '  - created_at_utc: timestamp',
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
            'Partitioned by `_PARTITIONTIME` (HOUR). This table requires a partition filter: queries without one fail. Filter `_PARTITIONTIME` directly',
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
            'Partitioned by `customer_id` (integer ranges). Filter `customer_id` directly against constant bounds (integer literals) so BigQuery reads only the partitions you need; without that filter it reads and bills every partition.',
        );
    });

    it('states only the fact on warehouses without filter guidance', async () => {
        const output = await describeWith(
            dayPartitioned,
            WarehouseTypes.DATABRICKS,
        );

        expect(output.result.split('\n')[1]).toBe(
            'Partitioned by `created_at_utc` (DAY).',
        );
    });

    it('adds nothing for an unpartitioned table', async () => {
        const output = await describeWith(null);

        expect(output.result).toBe(
            [
                'Columns for `acme-prod.rides.fact_ride_request` (2):',
                '  - ride_id: string',
                '  - created_at_utc: timestamp',
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
