import { MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const embedReachColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'event_id',
        'dashboard_id',
        'dashboard_name',
        'dashboard_label',
        'dashboard_key',
        'external_user_id',
        'viewer_key',
        'identity_coverage',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'event_ts', type: 'TIMESTAMP' },
];

export const embedReachSql = `(WITH loads AS (
    SELECT * FROM content_views
    WHERE event_name = 'embed_dashboard.viewed'
        AND actor_type = 'embed' AND view_context = 'embed'
        AND event_id IS NOT NULL AND content_id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY org_id, project_id, event_id ORDER BY ingested_at
    ) = 1
), named AS (
    SELECT *, FIRST_VALUE(content_name) OVER (
        PARTITION BY org_id, project_id, content_id
        ORDER BY event_ts DESC, event_id DESC
    ) AS latest_name FROM loads
)
SELECT org_id, project_id, event_id, event_ts,
    content_id AS dashboard_id,
    COALESCE(NULLIF(latest_name, ''), 'Untitled dashboard') AS dashboard_name,
    COALESCE(NULLIF(latest_name, ''), 'Untitled dashboard') || ' · ' || content_id AS dashboard_label,
    to_json([org_id, project_id, content_id])::VARCHAR AS dashboard_key,
    CASE WHEN NULLIF(TRIM(external_user_id), '') IS NOT NULL
        THEN external_user_id END AS external_user_id,
    CASE WHEN NULLIF(TRIM(external_user_id), '') IS NOT NULL
        THEN to_json([org_id, project_id, external_user_id])::VARCHAR END AS viewer_key,
    CASE WHEN NULLIF(TRIM(external_user_id), '') IS NOT NULL
        THEN 'Identified external viewer' ELSE 'No external viewer ID' END AS identity_coverage
FROM named)`;

export const embedReachMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_loads',
        type: MetricType.COUNT,
        column: 'event_id',
        description:
            'Observed successful authorized embedded dashboard fetches. Refetches count separately; child queries do not. Excludes previews and duplicate deliveries. Not billable loads or confirmed browser renders.',
    },
    {
        name: 'unique_viewers',
        type: MetricType.COUNT_DISTINCT,
        column: 'viewer_key',
        description:
            'Distinct explicit external viewer IDs, scoped to organization and project. Missing IDs and token issuers are excluded. These are customer-supplied identities, not verified people or tenants.',
    },
    {
        name: 'unique_dashboards',
        type: MetricType.COUNT_DISTINCT,
        column: 'dashboard_key',
        description:
            'Distinct dashboards with an observed embedded fetch in the selected period. Absence does not prove that a dashboard is not embedded.',
    },
];
