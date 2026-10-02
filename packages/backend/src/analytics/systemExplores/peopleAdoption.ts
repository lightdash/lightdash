import { FilterOperator, MetricType } from '@lightdash/common';
import { peopleMembershipColumns } from '../eventStream/peopleMembership';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const peopleAdoptionColumns: CompactedStreamColumn[] = [
    ...peopleMembershipColumns,
    ...['project_id', 'scope', 'activity_status', 'capture_coverage'].map(
        (name) => ({ name, type: 'VARCHAR' as const }),
    ),
    ...[
        'activity_through',
        'first_observed_activity_at',
        'last_observed_activity_at',
        'last_inferred_activity_at',
        'last_system_activity_at',
        'last_unknown_activity_at',
        'first_observed_week',
    ].map((name) => ({ name, type: 'TIMESTAMP' as const })),
    ...['active_days_30d', 'days_since_last_activity'].map((name) => ({
        name,
        type: 'BIGINT' as const,
    })),
    ...[
        'active_1d',
        'active_7d',
        'active_30d',
        'agent_active_7d',
        'agent_active_30d',
        'returning_7d',
        'lapsed_30d',
        'no_observed_activity',
    ].map((name) => ({ name, type: 'BOOLEAN' as const })),
];

// Current-population adoption: one row per organization/person, even with many
// projects, groups or duplicate events. Fixed trailing windows share the same
// current eligible denominator. No daily ratios or distincts are added together.
export const peopleAdoptionSql = `(WITH population AS (
    SELECT * FROM lightdash_people
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, user_id ORDER BY snapshot_at DESC) = 1
), cutoffs AS (
    SELECT org_id, date_trunc('day', MAX(snapshot_at)) AS cutoff FROM population GROUP BY org_id
), activity AS (
    SELECT org_id, user_id, event_ts,
        CASE WHEN is_qualifying AND actor_type = 'user' THEN 'human' ELSE 'unknown' END AS kind,
        false AS agent_request
    FROM content_views
    UNION ALL
    SELECT org_id, user_id, event_ts,
        CASE WHEN workload_origin IN ('scheduled', 'autorefresh') OR scheduler_id IS NOT NULL
                  OR initiating_actor_type IN ('system', 'service_account') THEN 'system'
             WHEN workload_origin = 'interactive' AND initiating_actor_type = 'user' THEN 'human'
             WHEN workload_origin IN ('mcp', 'app') AND initiating_actor_type = 'user' THEN 'inferred'
             ELSE 'unknown' END, false
    FROM query_events
    UNION ALL
    SELECT org_id, user_id, event_ts,
        CASE WHEN surface IN ('web_app', 'slack') THEN 'human' ELSE 'unknown' END, true
    FROM agent_request_events WHERE stage = 'created' AND prompt_id IS NOT NULL
    UNION ALL
    SELECT org_id, user_id, event_ts, 'inferred', false
    FROM data_app_events WHERE event_name IN ('data_app.view', 'data_app.created', 'data_app.iterated', 'data_app.uploaded', 'data_app.duplicated')
    UNION ALL
    SELECT org_id, user_id, event_ts, 'inferred', false
    FROM mcp_tool_calls WHERE actor_type = 'user'
), days AS (
    SELECT a.org_id, a.user_id, date_trunc('day', a.event_ts) AS activity_day,
        MIN(CASE WHEN kind = 'human' THEN event_ts END) AS first_human,
        MAX(CASE WHEN kind = 'human' THEN event_ts END) AS last_human,
        MAX(CASE WHEN kind = 'inferred' THEN event_ts END) AS last_inferred,
        MAX(CASE WHEN kind = 'system' THEN event_ts END) AS last_system,
        MAX(CASE WHEN kind = 'unknown' THEN event_ts END) AS last_unknown,
        BOOL_OR(kind = 'human' AND agent_request) AS agent_request
    FROM activity a JOIN cutoffs c ON a.org_id = c.org_id
    WHERE NULLIF(a.user_id, '') IS NOT NULL AND a.event_ts < c.cutoff
    GROUP BY a.org_id, a.user_id, date_trunc('day', a.event_ts)
), history AS (
    SELECT d.org_id, d.user_id,
        MIN(first_human) AS first_observed_activity_at, MAX(last_human) AS last_observed_activity_at,
        MAX(last_inferred) AS last_inferred_activity_at, MAX(last_system) AS last_system_activity_at,
        MAX(last_unknown) AS last_unknown_activity_at,
        COUNT(*) FILTER (WHERE last_human IS NOT NULL AND activity_day >= c.cutoff - INTERVAL 30 DAY)::BIGINT AS active_days_30d,
        BOOL_OR(agent_request AND activity_day >= c.cutoff - INTERVAL 7 DAY) AS agent_active_7d,
        BOOL_OR(agent_request AND activity_day >= c.cutoff - INTERVAL 30 DAY) AS agent_active_30d
    FROM days d JOIN cutoffs c ON d.org_id = c.org_id GROUP BY d.org_id, d.user_id
), joined AS (
    SELECT p.*, NULL::VARCHAR AS project_id, 'Organization' AS scope,
        c.cutoff - INTERVAL 1 DAY AS activity_through,
        h.first_observed_activity_at, h.last_observed_activity_at,
        h.last_inferred_activity_at, h.last_system_activity_at, h.last_unknown_activity_at,
        date_trunc('week', h.first_observed_activity_at) AS first_observed_week,
        COALESCE(h.active_days_30d, 0)::BIGINT AS active_days_30d,
        date_diff('day', h.last_observed_activity_at, c.cutoff - INTERVAL 1 DAY)::BIGINT AS days_since_last_activity,
        COALESCE(h.last_observed_activity_at >= c.cutoff - INTERVAL 1 DAY, false) AS active_1d,
        COALESCE(h.last_observed_activity_at >= c.cutoff - INTERVAL 7 DAY, false) AS active_7d,
        COALESCE(h.last_observed_activity_at >= c.cutoff - INTERVAL 30 DAY, false) AS active_30d,
        COALESCE(h.agent_active_7d, false) AS agent_active_7d,
        COALESCE(h.agent_active_30d, false) AS agent_active_30d,
        COALESCE(h.first_observed_activity_at < c.cutoff - INTERVAL 7 DAY
            AND h.last_observed_activity_at >= c.cutoff - INTERVAL 7 DAY, false) AS returning_7d,
        COALESCE(h.last_observed_activity_at < c.cutoff - INTERVAL 30 DAY, false) AS lapsed_30d,
        h.last_observed_activity_at IS NULL AS no_observed_activity
    FROM population p JOIN cutoffs c ON p.org_id = c.org_id
    LEFT JOIN history h ON p.org_id = h.org_id AND p.user_id = h.user_id
)
SELECT *, CASE WHEN NOT is_eligible THEN 'Not currently eligible'
    WHEN active_7d THEN 'Active in last 7 closed days'
    WHEN active_30d THEN 'Active in last 30 closed days'
    WHEN lapsed_30d THEN 'Previously observed; inactive for 30 days'
    ELSE 'No qualifying activity observed' END AS activity_status,
    'Observed closed-day activity only; capture may be incomplete. App loads/builds and MCP are inferred, not confirmed human activity. Membership is current, not historical eligibility.' AS capture_coverage
FROM joined)`;

const countPeople = (
    name: string,
    column: string,
    description: string,
): SystemMetricDefinition => ({
    name,
    type: MetricType.COUNT_DISTINCT,
    column: 'user_id',
    description,
    filters: [
        {
            id: name,
            target: { fieldRef: column },
            operator: FilterOperator.EQUALS,
            values: [true],
        },
    ],
});

export const peopleAdoptionMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_members',
        type: MetricType.COUNT_DISTINCT,
        column: 'user_id',
        description:
            'Current non-system organization memberships, including inactive and pending-setup accounts. Not a count of seats or employees.',
    },
    countPeople(
        'eligible_people',
        'is_eligible',
        'Active, setup-complete members in the latest snapshot. Role and group filters apply to numerator and denominator; groups do not imply HR teams.',
    ),
    ...['1d', '7d', '30d'].map((window) => ({
        ...countPeople(
            `active_people_${window}`,
            `active_${window}`,
            `Currently eligible people with confirmed human activity in the last ${window} closed UTC days before the snapshot. Inferred and unknown activity is excluded.`,
        ),
        filters: [
            {
                id: 'eligible',
                target: { fieldRef: 'is_eligible' },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
            {
                id: 'active',
                target: { fieldRef: `active_${window}` },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
        ],
    })),
    ...[
        ['returning_people_7d', 'returning_7d'],
        ['lapsed_people_30d', 'lapsed_30d'],
        ['people_without_observed_activity', 'no_observed_activity'],
        ['agent_users_7d', 'agent_active_7d'],
        ['agent_users_30d', 'agent_active_30d'],
    ].map(([name, column]) => ({
        ...countPeople(
            name,
            column,
            'Currently eligible members matching this observed activity classification. No observed activity is not evidence of never having used Lightdash.',
        ),
        filters: [
            {
                id: 'eligible',
                target: { fieldRef: 'is_eligible' },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
            {
                id: name,
                target: { fieldRef: column },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
        ],
    })),
];
