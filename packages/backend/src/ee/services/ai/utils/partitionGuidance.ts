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
    Record<WarehouseTypes, (column: string, bounds: string) => string>
> = {
    [WarehouseTypes.BIGQUERY]: (column, bounds) =>
        `Filter \`${column}\` directly against constant bounds (${bounds}) so BigQuery reads only the partitions you need; without that filter it reads and bills every partition.`,
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
    if (requiresPartitionFilter) {
        sentences.push(
            'This table requires a partition filter: queries without one fail.',
        );
    }
    const guidance = FILTER_GUIDANCE[warehouseType];
    if (guidance) {
        sentences.push(guidance(field, CONSTANT_BOUNDS[partitionType]));
    }
    return sentences.join(' ');
};
