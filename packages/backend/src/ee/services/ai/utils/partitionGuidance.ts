import {
    PartitionType,
    WarehouseTypes,
    type TablePartitioning,
} from '@lightdash/common';

const CONSTANT_BOUNDS: Record<PartitionType, string> = {
    [PartitionType.DATE]:
        'literals, or CURRENT_DATE()/CURRENT_TIMESTAMP() expressions',
    [PartitionType.RANGE]: 'integer literals',
};

// Only warehouses that bill or prune by partition get a filter instruction.
const FILTER_GUIDANCE: Partial<
    Record<
        WarehouseTypes,
        (column: string, bounds: string, required: boolean) => string
    >
> = {
    [WarehouseTypes.BIGQUERY]: (column, bounds, required) =>
        `Filter \`${column}\` directly against constant bounds (${bounds}) so BigQuery reads only the partitions you need; queries without that filter ${
            required ? 'fail' : 'run but read and bill every partition'
        }.`,
};

export const formatPartitioning = (
    {
        partitionColumn,
        granularity,
        requiresPartitionFilter,
    }: TablePartitioning,
    warehouseType: WarehouseTypes,
): string => {
    const { field, partitionType } = partitionColumn;
    const unit =
        partitionType === PartitionType.RANGE ? 'integer ranges' : granularity;
    const sentences = [
        `Partitioned by \`${field}\`${unit ? ` (${unit})` : ''}.`,
    ];
    const guidance = FILTER_GUIDANCE[warehouseType];
    if (guidance) {
        sentences.push(
            guidance(
                field,
                CONSTANT_BOUNDS[partitionType],
                requiresPartitionFilter,
            ),
        );
    } else if (requiresPartitionFilter) {
        sentences.push(
            'This table requires a partition filter: queries without one fail.',
        );
    }
    return sentences.join(' ');
};
