import { MetricType } from '@lightdash/common';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const contentInventoryMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_content',
        type: MetricType.COUNT,
        column: 'content_id',
        description:
            'Items in the latest inventory snapshot, including zero-event and soft-deleted items. Filter Is deleted to exclude removed content.',
    },
];
