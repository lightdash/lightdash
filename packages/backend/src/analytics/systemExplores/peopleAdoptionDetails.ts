import { MetricType } from '@lightdash/common';
import { peopleMembershipColumns } from '../eventStream/peopleMembership';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const adoptionMembershipColumns = peopleMembershipColumns.filter(
    ({ name }) =>
        [
            'user_id',
            'is_active',
            'group_ids',
            'group_names',
            'organization_role',
        ].includes(name),
);

export const adoptionDetailColumns: CompactedStreamColumn[] = [
    ...adoptionMembershipColumns,
    { name: 'parts_used', type: 'BIGINT' },
    { name: 'last_seen', type: 'VARCHAR' },
    { name: 'flow_bits', type: 'BIGINT' },
];

export const adoptionMembershipMetric: SystemMetricDefinition = {
    name: 'total_members',
    type: MetricType.COUNT_DISTINCT,
    column: 'user_id',
    description:
        'Current non-system organization memberships. Filter Is active to exclude deactivated accounts.',
};

export const currentPeopleSql = `(
    SELECT * FROM lightdash_people
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, user_id ORDER BY snapshot_at DESC) = 1
)`;

export const peopleAdoptionDetailsSql = `(WITH people AS ${currentPeopleSql}, cutoffs AS (
    SELECT org_id, DATE_TRUNC('day', MAX(snapshot_at)) AS cutoff FROM people GROUP BY org_id
), activity AS (
    SELECT org_id, user_id, event_ts, true AS counts_for_recency,
        CASE WHEN content_type = 'dashboard' THEN 1
             WHEN content_type IN ('chart', 'sql_chart') THEN 2
             ELSE 0 END AS part_bit
    FROM content_views
    WHERE is_qualifying AND actor_type = 'user'
    UNION ALL
    SELECT org_id, user_id, event_ts, true,
        CASE WHEN workload_origin = 'interactive' AND context IN ('exploreView', 'metricsExplorer', 'sqlRunner') THEN 4 ELSE 0 END
    FROM query_events
    WHERE workload_origin IN ('interactive', 'mcp', 'app')
      AND initiating_actor_type IN ('registered_user', 'user') AND scheduler_id IS NULL
    UNION ALL
    SELECT org_id, user_id, event_ts, true, 8
    FROM agent_request_events
    WHERE stage = 'created' AND prompt_id IS NOT NULL AND surface IN ('web_app', 'slack')
    UNION ALL
    SELECT org_id, user_id, event_ts, true, 16
    FROM mcp_tool_calls WHERE actor_type = 'user'
    UNION ALL
    SELECT org_id, user_id, event_ts, true,
        CASE WHEN event_name = 'data_app.view' THEN 32
             WHEN event_name IN ('data_app.created', 'data_app.iterated', 'data_app.uploaded') THEN 64
             ELSE 0 END
    FROM data_app_events
    WHERE event_name IN ('data_app.view', 'data_app.created', 'data_app.iterated', 'data_app.uploaded', 'data_app.duplicated')
    UNION ALL
    SELECT org_id, user_id, event_ts, false, 128
    FROM export_events
    WHERE event_name = 'download_results.completed'
      AND COALESCE(context, '') NOT IN ('scheduledDelivery', 'alert')
), rollup AS (
    SELECT a.org_id, a.user_id,
        DATE_DIFF('day', MAX(event_ts) FILTER (WHERE counts_for_recency), c.cutoff - INTERVAL 1 DAY) AS days_since_seen,
        BIT_OR(part_bit) FILTER (WHERE event_ts >= c.cutoff - INTERVAL 30 DAY) AS parts_used,
        (CASE WHEN BOOL_OR(part_bit <> 0 AND event_ts >= c.cutoff - INTERVAL 28 DAY) THEN 1 ELSE 0 END
         + CASE WHEN BOOL_OR(part_bit <> 0 AND event_ts >= c.cutoff - INTERVAL 56 DAY
                                      AND event_ts < c.cutoff - INTERVAL 28 DAY) THEN 2 ELSE 0 END
         + CASE WHEN BOOL_OR(part_bit <> 0 AND event_ts < c.cutoff - INTERVAL 56 DAY) THEN 4 ELSE 0 END) AS flow_bits
    FROM activity a JOIN cutoffs c ON a.org_id = c.org_id
    WHERE NULLIF(a.user_id, '') IS NOT NULL AND a.event_ts < c.cutoff
    GROUP BY a.org_id, a.user_id, c.cutoff
)
SELECT p.*, COALESCE(r.parts_used, 0)::BIGINT AS parts_used, COALESCE(r.flow_bits, 0)::BIGINT AS flow_bits,
    CASE WHEN r.days_since_seen IS NULL THEN 'never'
        WHEN r.days_since_seen < 7 THEN 'd7'
        WHEN r.days_since_seen < 30 THEN 'd30'
        ELSE 'older' END AS last_seen
FROM people p LEFT JOIN rollup r ON p.org_id = r.org_id AND p.user_id = r.user_id)`;
