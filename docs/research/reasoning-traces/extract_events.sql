-- Reasoning-trace spike: pull every human-attributable "step" for one organisation
-- into a single typed event stream, ready for sessionisation.
--
-- Run against a Lightdash application database (a read replica is fine):
--   psql "$DATABASE_URL" -v org_uuid="'<organization_uuid>'" -v days=30 \
--        -At -F $'\t' -f extract_events.sql > events.tsv
--
-- Output columns (tab separated, one row per event, ordered by user then time):
--   user_uuid, email, project_uuid, ts, kind, context, explore, ref_uuid, payload(json)
--
-- kinds:
--   query        query_history row (explore run, chart view, dashboard tile, SQL runner,
--                underlying data, MCP, ...). Scheduled and autocomplete contexts excluded.
--   chart_save   a new saved chart version
--   dash_save    a new dashboard version
--   chart_view   analytics_chart_views row
--   dash_view    analytics_dashboard_views row
--   ai_prompt    a human prompt to the AI agent, with the agent's metric query if any

WITH params AS (
    SELECT :org_uuid::uuid AS org_uuid,
           now() - (:days::int * interval '1 day') AS since
),
humans AS (
    SELECT u.user_uuid, e.email
    FROM users u
    JOIN emails e ON e.user_id = u.user_id AND e.is_primary
),
org_projects AS (
    SELECT p.project_uuid, p.project_id
    FROM projects p
    JOIN organizations o ON o.organization_id = p.organization_id
    JOIN params ON o.organization_uuid = params.org_uuid
    WHERE p.project_type = 'DEFAULT'
),
query_events AS (
    SELECT
        q.created_by_user_uuid AS user_uuid,
        q.project_uuid,
        q.created_at AS ts,
        'query' AS kind,
        q.context::text AS context,
        q.metric_query->>'exploreName' AS explore,
        COALESCE(q.request_parameters->>'chartUuid',
                 q.request_parameters->>'dashboardUuid',
                 q.request_parameters->>'savedSqlUuid') AS ref_uuid,
        jsonb_build_object(
            'query_uuid', q.query_uuid,
            'status', q.status,
            'dimensions', q.metric_query->'dimensions',
            'metrics', q.metric_query->'metrics',
            'filters', q.metric_query->'filters',
            'sorts', q.metric_query->'sorts',
            'limit', q.metric_query->'limit',
            'additionalMetrics', COALESCE((SELECT jsonb_agg(m->>'name')
                FROM jsonb_array_elements(COALESCE(q.metric_query->'additionalMetrics', '[]'::jsonb)) m), '[]'::jsonb),
            'customDimensions', COALESCE((SELECT jsonb_agg(d->>'name')
                FROM jsonb_array_elements(COALESCE(q.metric_query->'customDimensions', '[]'::jsonb)) d), '[]'::jsonb),
            'tableCalculations', COALESCE((SELECT jsonb_agg(t->>'name')
                FROM jsonb_array_elements(COALESCE(q.metric_query->'tableCalculations', '[]'::jsonb)) t), '[]'::jsonb),
            'rows', q.total_row_count,
            'ms', q.warehouse_execution_time_ms,
            'error', left(q.error, 200)
        ) AS payload
    FROM query_history q
    JOIN params ON q.organization_uuid = params.org_uuid
    WHERE q.created_at >= params.since
      AND q.created_by_user_uuid IS NOT NULL
      AND COALESCE(q.created_by_actor_type, 'session') IN ('session', 'pat', 'oauth')
      AND q.context NOT IN (
          'filterAutocomplete', 'alert', 'scheduledDelivery', 'scheduledGsheetsChart',
          'scheduledGsheetsDashboard', 'scheduledGsheetsSqlChart', 'scheduledChart',
          'scheduledDashboard', 'preAggregateMaterialization', 'autorefreshedDashboard'
      )
),
chart_saves AS (
    SELECT
        v.updated_by_user_uuid AS user_uuid,
        sq.project_uuid,
        v.created_at AS ts,
        'chart_save' AS kind,
        'chartSave' AS context,
        v.explore_name AS explore,
        sq.saved_query_uuid::text AS ref_uuid,
        jsonb_build_object(
            'chart_name', sq.name,
            'chart_type', v.chart_type,
            'is_first_version', (v.saved_queries_version_id = (
                SELECT min(saved_queries_version_id) FROM saved_queries_versions
                WHERE saved_query_id = sq.saved_query_id)),
            'dimensions', COALESCE((SELECT jsonb_agg(f.name ORDER BY f."order")
                FROM saved_queries_version_fields f
                WHERE f.saved_queries_version_id = v.saved_queries_version_id
                  AND f.field_type = 'dimension'), '[]'::jsonb),
            'metrics', COALESCE((SELECT jsonb_agg(f.name ORDER BY f."order")
                FROM saved_queries_version_fields f
                WHERE f.saved_queries_version_id = v.saved_queries_version_id
                  AND f.field_type = 'metric'), '[]'::jsonb),
            'filters', v.filters
        ) AS payload
    FROM saved_queries_versions v
    JOIN saved_queries sq ON sq.saved_query_id = v.saved_query_id
    JOIN org_projects op ON op.project_uuid = sq.project_uuid
    JOIN params ON true
    WHERE v.created_at >= params.since AND v.updated_by_user_uuid IS NOT NULL
),
dash_saves AS (
    SELECT
        dv.updated_by_user_uuid AS user_uuid,
        op.project_uuid,
        dv.created_at AS ts,
        'dash_save' AS kind,
        'dashboardSave' AS context,
        NULL::text AS explore,
        d.dashboard_uuid::text AS ref_uuid,
        jsonb_build_object('dashboard_name', d.name) AS payload
    FROM dashboard_versions dv
    JOIN dashboards d ON d.dashboard_id = dv.dashboard_id
    JOIN spaces s ON s.space_id = d.space_id
    JOIN org_projects op ON op.project_id = s.project_id
    JOIN params ON true
    WHERE dv.created_at >= params.since AND dv.updated_by_user_uuid IS NOT NULL
),
chart_views AS (
    SELECT
        cv.user_uuid,
        sq.project_uuid,
        cv.timestamp AS ts,
        'chart_view' AS kind,
        'chartView' AS context,
        NULL::text AS explore,
        cv.chart_uuid::text AS ref_uuid,
        jsonb_build_object('chart_name', sq.name) AS payload
    FROM analytics_chart_views cv
    JOIN saved_queries sq ON sq.saved_query_uuid = cv.chart_uuid
    JOIN org_projects op ON op.project_uuid = sq.project_uuid
    JOIN params ON true
    WHERE cv.timestamp >= params.since AND cv.user_uuid IS NOT NULL
),
dash_views AS (
    SELECT
        dv.user_uuid,
        op.project_uuid,
        dv.timestamp AS ts,
        'dash_view' AS kind,
        'dashboardView' AS context,
        NULL::text AS explore,
        dv.dashboard_uuid::text AS ref_uuid,
        jsonb_build_object('dashboard_name', d.name) AS payload
    FROM analytics_dashboard_views dv
    JOIN dashboards d ON d.dashboard_uuid = dv.dashboard_uuid
    JOIN spaces s ON s.space_id = d.space_id
    JOIN org_projects op ON op.project_id = s.project_id
    JOIN params ON true
    WHERE dv.timestamp >= params.since AND dv.user_uuid IS NOT NULL
),
ai_prompts AS (
    SELECT
        p.created_by_user_uuid AS user_uuid,
        t.project_uuid,
        p.created_at AS ts,
        'ai_prompt' AS kind,
        'ai' AS context,
        p.metric_query->>'exploreName' AS explore,
        t.ai_thread_uuid::text AS ref_uuid,
        jsonb_build_object(
            'prompt', left(p.prompt, 400),
            'thread_title', t.title,
            'created_from', t.created_from,
            'human_score', p.human_score,
            'human_feedback', left(p.human_feedback, 200),
            'dimensions', p.metric_query->'dimensions',
            'metrics', p.metric_query->'metrics',
            'filters', p.metric_query->'filters',
            'answered', (p.response IS NOT NULL AND p.error_message IS NULL)
        ) AS payload
    FROM ai_prompt p
    JOIN ai_thread t ON t.ai_thread_uuid = p.ai_thread_uuid
    JOIN params ON t.organization_uuid = params.org_uuid
    WHERE p.created_at >= params.since
      AND p.created_by_user_uuid IS NOT NULL
      AND NOT p.hidden
),
all_events AS (
    SELECT * FROM query_events
    UNION ALL SELECT * FROM chart_saves
    UNION ALL SELECT * FROM dash_saves
    UNION ALL SELECT * FROM chart_views
    UNION ALL SELECT * FROM dash_views
    UNION ALL SELECT * FROM ai_prompts
)
SELECT
    e.user_uuid,
    h.email,
    e.project_uuid,
    to_char(e.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts,
    e.kind,
    e.context,
    e.explore,
    e.ref_uuid,
    e.payload::text
FROM all_events e
JOIN humans h ON h.user_uuid = e.user_uuid
ORDER BY e.user_uuid, e.ts;
