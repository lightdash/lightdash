import { MetricType } from '@lightdash/common';
import type { SystemMetricDefinition } from './systemStreamMetrics';

// The inventory with one extra row for every day, for each project and type of content that exists.
// The extra rows have no content, so they count as zero, and a chart of content created by day gets a
// point for a day on which nothing was created instead of a gap.
export const contentCreatedByDaySql = `(SELECT * FROM lightdash_content
UNION ALL BY NAME
SELECT kinds.org_id, kinds.project_id, kinds.project_name, kinds.project_type, kinds.content_type,
    days.day AS created_at
FROM (
    SELECT DISTINCT org_id, project_id, project_name, project_type, content_type FROM lightdash_content
) kinds
JOIN (
    SELECT org_id, unnest(generate_series(
        date_trunc('day', min(created_at)), date_trunc('day', CURRENT_DATE::TIMESTAMP), INTERVAL 1 DAY
    )) AS day
    FROM lightdash_content WHERE created_at IS NOT NULL GROUP BY org_id
) days ON days.org_id = kinds.org_id)`;

export const contentInventoryMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_content',
        type: MetricType.COUNT,
        column: 'content_id',
        description:
            'Items in the latest inventory snapshot, including zero-event and soft-deleted items. Filter Is deleted to exclude removed content.',
    },
];
