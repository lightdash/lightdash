import { MetricType } from '@lightdash/common';
import { embedViewEventsColumns } from '../eventStream/embedViewEventsStream';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const embedViewExploreColumns: CompactedStreamColumn[] = [
    ...embedViewEventsColumns.filter(
        ({ name }) => name !== 'embed_token_fingerprint',
    ),
    ...['viewer_key', 'tenant_key', 'viewer_coverage', 'tenant_coverage'].map(
        (name) => ({ name, type: 'VARCHAR' as const }),
    ),
];

export const embedViewExploreSql = `(
    SELECT * EXCLUDE (embed_token_fingerprint),
        CASE WHEN external_user_id IS NOT NULL THEN
            to_json([org_id, project_id, embed_tenant_attribute, embed_tenant_id, external_user_id])::VARCHAR
        END AS viewer_key,
        CASE WHEN embed_tenant_id IS NOT NULL THEN
            to_json([org_id, project_id, embed_tenant_attribute, embed_tenant_id])::VARCHAR
        END AS tenant_key,
        CASE WHEN external_user_id IS NOT NULL THEN 'Identified external viewer'
             WHEN embed_token_fingerprint IS NOT NULL THEN 'Anonymous (token only)'
             ELSE 'Unknown viewer' END AS viewer_coverage,
        CASE WHEN embed_tenant_id IS NOT NULL THEN 'Identified tenant'
             ELSE 'Unknown tenant' END AS tenant_coverage
    FROM embed_view_events
    WHERE event_id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, event_id ORDER BY ingested_at) = 1
)`;

export const embedViewExploreMetrics: SystemMetricDefinition[] = [
    {
        name: 'loads',
        type: MetricType.COUNT,
        column: 'event_id',
        description:
            'Successful authorized embedded dashboard fetches. A reload that fetches the dashboard again counts separately. Duplicate deliveries, tile queries, cache hits and filter-only changes are not loads.',
    },
    {
        name: 'distinct_external_viewers',
        type: MetricType.COUNT_DISTINCT,
        column: 'viewer_key',
        description:
            'Distinct explicit external viewer IDs within project and tenant namespace. Anonymous viewers are not counted. Identified viewers without a tenant are counted in a separate unknown-tenant namespace.',
    },
    {
        name: 'distinct_tenants',
        type: MetricType.COUNT_DISTINCT,
        column: 'tenant_key',
        description:
            'Distinct explicitly attributed tenants within project and tenant attribute. Unknown tenants are not counted.',
    },
];
