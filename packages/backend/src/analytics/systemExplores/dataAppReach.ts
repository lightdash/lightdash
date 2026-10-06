import {
    DATA_APP_VIZ_TEMPLATE,
    FilterOperator,
    MetricType,
} from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const dataAppReachColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'app_id',
        'app_name',
        'project_name',
        'space_name',
        'user_id',
        'creator_id',
        'view_id',
        'view_context',
        'render_status',
        'adoption_status',
        'consumer_id',
        'returning_consumer_id',
        'mature_app_id',
        'adopted_app_id',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    ...[
        'event_ts',
        'launched_at',
        'first_non_builder_view_at',
        'snapshot_at',
    ].map((name) => ({ name, type: 'TIMESTAMP' as const })),
    ...['version', 'launch_to_first_consumer_seconds'].map((name) => ({
        name,
        type: 'BIGINT' as const,
    })),
    ...[
        'is_builder',
        'is_reload',
        'is_qualifying',
        'is_deleted',
        'is_shared',
        'is_preview_project',
    ].map((name) => ({ name, type: 'BOOLEAN' as const })),
];

// Windows precede Explore filters: filtering a week cannot invent a first visit.
export const dataAppReachSql = `(WITH events AS (
    SELECT * FROM data_app_reach_events
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY org_id, project_id, app_id, user_id, event_id ORDER BY event_ts
    ) = 1
), launches AS (
    SELECT org_id, project_id, app_id, MIN(event_ts) AS launched_at
    FROM events WHERE stage = 'launched' GROUP BY org_id, project_id, app_id
), view_outcomes AS (
    SELECT org_id, project_id, app_id, user_id, view_id, version,
        BOOL_OR(stage = 'sdk_ready') AS sdk_ready,
        BOOL_OR(stage = 'render_error') AS render_error
    FROM events WHERE view_id IS NOT NULL
    GROUP BY org_id, project_id, app_id, user_id, view_id, version
), loads AS (
    SELECT e.*, CASE WHEN o.render_error THEN 'Runtime error observed'
        WHEN e.outcome = 'failed' THEN 'HTML load failed'
        WHEN e.outcome = 'aborted' THEN 'HTML load aborted'
        WHEN o.sdk_ready THEN 'SDK started'
        ELSE 'Render outcome unknown' END AS render_status,
        e.outcome = 'served' AND o.sdk_ready AND NOT o.render_error
            AND e.view_context IN ('standalone', 'dashboard')
            AND e.is_shared AND NOT e.is_preview_project
            AND NOT e.is_reload AND e.user_id IS NOT NULL AS is_qualifying
    FROM events e JOIN view_outcomes o ON e.org_id = o.org_id AND e.project_id = o.project_id
        AND e.app_id = o.app_id AND e.user_id IS NOT DISTINCT FROM o.user_id
        AND e.view_id = o.view_id AND e.version = o.version
    WHERE e.stage = 'load'
), consumers AS (
    SELECT *, CASE WHEN is_qualifying AND is_builder = false THEN user_id END AS consumer_id,
        MIN(CASE WHEN is_qualifying AND is_builder = false THEN date_trunc('day', event_ts) END)
            OVER (PARTITION BY org_id, project_id, app_id, user_id) AS first_consumer_day
    FROM loads
), first_consumers AS (
    SELECT c.org_id, c.project_id, c.app_id, MIN(c.event_ts) AS first_non_builder_view_at
    FROM consumers c LEFT JOIN launches l USING (org_id, project_id, app_id)
    WHERE c.consumer_id IS NOT NULL AND (l.launched_at IS NULL OR c.event_ts >= l.launched_at)
    GROUP BY c.org_id, c.project_id, c.app_id
), inventory AS (
    SELECT * FROM lightdash_content WHERE content_type = 'data_app'
        AND COALESCE(app_template, '') <> '${DATA_APP_VIZ_TEMPLATE}'
), app_ids AS (
    SELECT org_id, project_id, app_id FROM events
    UNION SELECT org_id, project_id, content_id FROM inventory
), freshness AS (
    SELECT org_id, MIN(date_trunc('day', snapshot_at)) AS observed_through
    FROM inventory GROUP BY org_id
), apps AS (
    SELECT ids.*, COALESCE(i.content_name, ids.app_id) AS app_name,
        i.project_name, i.space_name, i.snapshot_at, i.is_deleted, l.launched_at,
        f.first_non_builder_view_at,
        CASE WHEN l.launched_at IS NULL THEN 'Launch unknown'
            WHEN fresh.observed_through IS NULL OR l.launched_at + INTERVAL 7 DAY > LEAST(fresh.observed_through, CURRENT_DATE)
                THEN 'Pending: seven-day window incomplete'
            WHEN f.first_non_builder_view_at >= l.launched_at
                AND f.first_non_builder_view_at < l.launched_at + INTERVAL 7 DAY
                THEN 'Non-builder adoption observed within seven days'
            ELSE 'No non-builder adoption observed within seven days' END AS adoption_status,
        CASE WHEN l.launched_at + INTERVAL 7 DAY <= LEAST(fresh.observed_through, CURRENT_DATE)
            AND fresh.observed_through IS NOT NULL THEN ids.app_id END AS mature_app_id,
        CASE WHEN f.first_non_builder_view_at >= l.launched_at
            THEN date_diff('second', l.launched_at, f.first_non_builder_view_at) END AS launch_to_first_consumer_seconds
    FROM app_ids ids
    LEFT JOIN inventory i ON ids.org_id = i.org_id AND ids.project_id = i.project_id AND ids.app_id = i.content_id
    LEFT JOIN launches l ON ids.org_id = l.org_id AND ids.project_id = l.project_id AND ids.app_id = l.app_id
    LEFT JOIN first_consumers f ON ids.org_id = f.org_id AND ids.project_id = f.project_id AND ids.app_id = f.app_id
    LEFT JOIN freshness fresh ON ids.org_id = fresh.org_id
)
SELECT a.*, v.user_id, v.creator_id, v.is_shared, v.is_preview_project, v.view_id, v.version, v.event_ts, v.view_context, v.render_status,
    v.is_builder, v.is_reload, v.is_qualifying, v.consumer_id,
    CASE WHEN v.consumer_id IS NOT NULL AND date_trunc('day', v.event_ts) > v.first_consumer_day
        THEN v.consumer_id END AS returning_consumer_id,
    CASE WHEN a.mature_app_id IS NOT NULL AND a.adoption_status = 'Non-builder adoption observed within seven days'
        THEN a.app_id END AS adopted_app_id
FROM apps a LEFT JOIN consumers v USING (org_id, project_id, app_id))`;

export const dataAppReachMetrics: SystemMetricDefinition[] = [
    {
        name: 'captured_loads',
        type: MetricType.COUNT,
        column: 'view_id',
        description:
            'Distinct captured navigation attempts, including previews, reloads and failed loads. This is separate from the existing raw HTML-load metric.',
    },
    {
        name: 'total_apps',
        type: MetricType.COUNT_DISTINCT,
        column: 'app_id',
        description:
            'Apps in the latest inventory or captured reach events, including apps with no captured views. Missing history does not prove no use.',
    },
    {
        name: 'qualifying_views',
        type: MetricType.COUNT,
        column: 'view_id',
        filters: [
            {
                id: 'qualified',
                target: { fieldRef: 'is_qualifying' },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
        ],
        description:
            'Identified standalone/dashboard loads with SDK startup observed and no reported runtime error. Excludes reloads, builder surfaces, embeds and preview projects; not proof that a person read the app.',
    },
    {
        name: 'distinct_consumers',
        type: MetricType.COUNT_DISTINCT,
        column: 'consumer_id',
        description:
            'Distinct identified non-builders with qualifying views in the selected period. Builder identity is captured at token creation; unknown identities are excluded.',
    },
    {
        name: 'returning_consumers',
        type: MetricType.COUNT_DISTINCT,
        column: 'returning_consumer_id',
        description:
            'Consumers returning on a later UTC day than their first captured qualifying view of that app.',
    },
    {
        name: 'mature_launched_apps',
        type: MetricType.COUNT_DISTINCT,
        column: 'mature_app_id',
        description:
            'Captured launches whose seven-day window ends before the latest inventory snapshot closed day. Capture gaps can still affect observed adoption.',
    },
    {
        name: 'apps_adopted_within_seven_days',
        type: MetricType.COUNT_DISTINCT,
        column: 'adopted_app_id',
        description:
            'Mature launched apps with a captured non-builder view within the first seven days.',
    },
    {
        name: 'last_viewed_at',
        type: MetricType.MAX,
        column: 'event_ts',
        filters: [
            {
                id: 'qualified_last',
                target: { fieldRef: 'is_qualifying' },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
        ],
    },
];
