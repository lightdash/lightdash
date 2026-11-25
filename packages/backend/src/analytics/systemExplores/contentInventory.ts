import { MetricType } from '@lightdash/common';
import type { SystemMetricDefinition } from './systemStreamMetrics';

// The Analytics project holds Lightdash's own dashboards and charts, not content its admins made. The
// inventory snapshot marks it with the project type ANALYTICS, and every model of the customer's content
// reads the inventory through this, so it is never listed, counted or put up for review.
export const analyticsProjectType = 'ANALYTICS';
// Written with <> and IS NULL: the query engine refuses any SQL where FROM is followed by a quoted
// string, which it reads as a file path, and IS DISTINCT FROM 'ANALYTICS' is exactly that.
export const customerContentSql = `(SELECT * FROM lightdash_content WHERE (project_type IS NULL OR project_type <> '${analyticsProjectType}'))`;

// The inventory with one extra row for every day, for each project and type of content that exists.
// The extra rows have no content, so they count as zero, and a chart of content created by day gets a
// point for a day on which nothing was created instead of a gap.
export const contentCreatedByDaySql = `(SELECT * FROM ${customerContentSql}
UNION ALL BY NAME
SELECT kinds.org_id, kinds.project_id, kinds.project_name, kinds.project_type, kinds.content_type,
    days.day AS created_at
FROM (
    SELECT DISTINCT org_id, project_id, project_name, project_type, content_type FROM ${customerContentSql}
) kinds
JOIN (
    SELECT org_id, unnest(generate_series(
        date_trunc('day', min(created_at)), date_trunc('day', CURRENT_DATE::TIMESTAMP), INTERVAL 1 DAY
    )) AS day
    FROM ${customerContentSql} WHERE created_at IS NOT NULL GROUP BY org_id
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
