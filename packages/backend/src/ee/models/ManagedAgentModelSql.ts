import { DashboardsTableName } from '../../database/entities/dashboards';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';

export type InactiveUserActivitySource =
    | 'chart_view'
    | 'dashboard_view'
    | 'query';

export type OrphanedContentOwnerStatus = 'deactivated' | 'left_org';

export type UnusedAgentReason =
    | 'never_used'
    | 'no_recent_use'
    | 'only_failed_sessions'
    | 'low_traffic';

export type UnusedAgentRoutingSignal =
    | 'router_disabled'
    | 'never_a_candidate'
    | 'candidate_never_suggested'
    | 'suggested_never_chosen'
    | 'routed';

/**
 * Parameters: member_uuids, project_uuid, member_uuids, project_uuid,
 * member_uuids, project_uuid, member_uuids, inactive_days, inactive_days,
 * limit
 */
export const inactiveUsersSql = () => `
WITH activity AS (
  SELECT cv.user_uuid, cv.timestamp, 'chart_view' AS source
  FROM analytics_chart_views cv
  JOIN ${SavedChartsTableName} sq ON sq.saved_query_uuid = cv.chart_uuid AND sq.deleted_at IS NULL
  JOIN ${SpaceTableName} s ON s.space_id = sq.space_id AND s.deleted_at IS NULL
  JOIN projects p ON p.project_id = s.project_id
  WHERE cv.user_uuid = ANY(string_to_array(?, ',')::uuid[]) AND p.project_uuid = ?

  UNION ALL

  SELECT dv.user_uuid, dv.timestamp, 'dashboard_view' AS source
  FROM analytics_dashboard_views dv
  JOIN ${DashboardsTableName} d ON d.dashboard_uuid = dv.dashboard_uuid AND d.deleted_at IS NULL
  JOIN ${SpaceTableName} s ON s.space_id = d.space_id AND s.deleted_at IS NULL
  JOIN projects p ON p.project_id = s.project_id
  WHERE dv.user_uuid = ANY(string_to_array(?, ',')::uuid[]) AND p.project_uuid = ?

  UNION ALL

  SELECT qh.created_by_user_uuid AS user_uuid, qh.created_at AS timestamp, 'query' AS source
  FROM query_history qh
  WHERE qh.created_by_user_uuid = ANY(string_to_array(?, ',')::uuid[]) AND qh.project_uuid = ?
),
latest AS (
  SELECT DISTINCT ON (user_uuid) user_uuid, timestamp, source
  FROM activity
  ORDER BY user_uuid, timestamp DESC
)
SELECT
  u.user_uuid,
  u.first_name || ' ' || u.last_name AS user_name,
  e.email,
  latest.timestamp AS last_active_at,
  latest.source AS last_active_source
FROM users u
  LEFT JOIN emails e ON e.user_id = u.user_id AND e.is_primary = true
  LEFT JOIN latest ON latest.user_uuid = u.user_uuid
WHERE u.user_uuid = ANY(string_to_array(?, ',')::uuid[])
  AND u.is_active = true
  AND u.is_internal = false
  AND (
    -- Never-active users only count as inactive once their account has
    -- existed for the full window; a user invited yesterday is not inactive
    (
      latest.timestamp IS NULL
      AND u.created_at < now() - make_interval(days => ?)
    )
    OR latest.timestamp < now() - make_interval(days => ?)
  )
ORDER BY latest.timestamp ASC NULLS FIRST
LIMIT ?;
`;

/**
 * Owner attribution matches the stale-content queries: a chart's last version
 * author, a dashboard's first version author. An owner is orphaned when their
 * account is deactivated or they no longer hold a membership in the org.
 *
 * Parameters: organization_uuid, project_uuid, project_uuid, limit
 */
export const orphanedContentSql = () => `
WITH orphaned_owner AS (
  SELECT
    u.user_uuid,
    u.first_name || ' ' || u.last_name AS owner_name,
    CASE WHEN u.is_active = false THEN 'deactivated' ELSE 'left_org' END AS owner_status
  FROM users u
    LEFT JOIN organization_memberships om ON om.user_id = u.user_id
    LEFT JOIN organizations o ON o.organization_id = om.organization_id AND o.organization_uuid = ?
  WHERE u.is_internal = false
  GROUP BY u.user_uuid, u.first_name, u.last_name, u.is_active
  HAVING u.is_active = false OR COUNT(o.organization_id) = 0
)
SELECT
  'chart' AS content_type,
  sq.saved_query_uuid AS content_uuid,
  sq.name AS content_name,
  s.space_uuid,
  oo.user_uuid AS owner_user_uuid,
  oo.owner_name,
  oo.owner_status,
  (
    SELECT MAX(cv.timestamp)
    FROM analytics_chart_views cv
    WHERE cv.chart_uuid = sq.saved_query_uuid
  ) AS last_viewed_at
FROM ${SavedChartsTableName} sq
  JOIN orphaned_owner oo ON oo.user_uuid = sq.last_version_updated_by_user_uuid
  JOIN ${SpaceTableName} s ON s.space_id = sq.space_id AND s.deleted_at IS NULL
  JOIN projects p ON p.project_id = s.project_id
WHERE p.project_uuid = ?
  AND sq.deleted_at IS NULL

UNION ALL

SELECT
  'dashboard' AS content_type,
  d.dashboard_uuid AS content_uuid,
  d.name AS content_name,
  s.space_uuid,
  oo.user_uuid AS owner_user_uuid,
  oo.owner_name,
  oo.owner_status,
  (
    SELECT MAX(dv.timestamp)
    FROM analytics_dashboard_views dv
    WHERE dv.dashboard_uuid = d.dashboard_uuid
  ) AS last_viewed_at
FROM ${DashboardsTableName} d
  JOIN LATERAL (
    SELECT dver.updated_by_user_uuid
    FROM dashboard_versions dver
    WHERE dver.dashboard_id = d.dashboard_id
    ORDER BY dver.created_at ASC
    LIMIT 1
  ) first_version ON true
  JOIN orphaned_owner oo ON oo.user_uuid = first_version.updated_by_user_uuid
  JOIN ${SpaceTableName} s ON s.space_id = d.space_id AND s.deleted_at IS NULL
  JOIN projects p ON p.project_id = s.project_id
WHERE p.project_uuid = ?
  AND d.deleted_at IS NULL

ORDER BY owner_user_uuid, content_name
LIMIT ?;
`;

/**
 * Traffic is measured in prompts, not threads: an opened conversation that was
 * never asked anything is not use. Agents younger than the window are excluded
 * because they have not had the chance to earn traffic yet.
 *
 * Parameters: window_days, min_prompts, project_uuid, organization_uuid,
 * project_uuid, limit
 */
export const unusedAgentsSql = () => `
WITH params AS (
  SELECT
    now() - make_interval(days => ?) AS window_start,
    ?::int AS min_prompts
),
agents AS (
  SELECT a.ai_agent_uuid, a.name, a.created_at, a.admin_only
  FROM ai_agent a, params
  WHERE a.project_uuid = ?
    AND a.is_system = false
    AND a.created_at <= params.window_start
),
router_enabled AS (
  SELECT EXISTS (
    SELECT 1
    FROM ai_router r
    WHERE r.organization_uuid = ?
      AND r.enabled = true
      AND ?::uuid = ANY(r.project_uuids)
  ) AS enabled
),
activity AS (
  SELECT
    t.agent_uuid,
    COUNT(DISTINCT t.ai_thread_uuid) AS total_threads,
    COUNT(DISTINCT t.ai_thread_uuid) FILTER (
      WHERE t.created_at >= params.window_start
    ) AS recent_threads,
    COUNT(p.ai_prompt_uuid) AS total_prompts,
    COUNT(p.ai_prompt_uuid) FILTER (
      WHERE p.created_at >= params.window_start
    ) AS recent_prompts,
    COUNT(p.ai_prompt_uuid) FILTER (
      WHERE p.created_at >= params.window_start
        AND p.responded_at IS NOT NULL
        AND p.error_message IS NULL
    ) AS recent_answered,
    COUNT(DISTINCT p.created_by_user_uuid) FILTER (
      WHERE p.created_at >= params.window_start
    ) AS recent_askers,
    MAX(p.created_at) AS last_used_at
  FROM ai_thread t
    JOIN agents a ON a.ai_agent_uuid = t.agent_uuid
    LEFT JOIN ai_prompt p ON p.ai_thread_uuid = t.ai_thread_uuid
    CROSS JOIN params
  GROUP BY t.agent_uuid
),
routing AS (
  SELECT
    a.ai_agent_uuid AS agent_uuid,
    COUNT(rd.ai_router_decision_uuid) FILTER (
      WHERE a.ai_agent_uuid = ANY(rd.candidate_agent_uuids)
    ) AS candidate_count,
    COUNT(rd.ai_router_decision_uuid) FILTER (
      WHERE rd.suggested_agent_uuid = a.ai_agent_uuid
    ) AS suggested_count,
    COUNT(rd.ai_router_decision_uuid) FILTER (
      WHERE rd.chosen_agent_uuid = a.ai_agent_uuid
    ) AS chosen_count
  FROM agents a
    CROSS JOIN params
    LEFT JOIN ai_router_decision rd
      ON rd.created_at >= params.window_start
      AND (
        rd.suggested_agent_uuid = a.ai_agent_uuid
        OR rd.chosen_agent_uuid = a.ai_agent_uuid
        OR a.ai_agent_uuid = ANY(rd.candidate_agent_uuids)
      )
  GROUP BY a.ai_agent_uuid
)
SELECT
  a.ai_agent_uuid AS agent_uuid,
  a.name AS agent_name,
  a.created_at,
  a.admin_only,
  COALESCE(act.total_threads, 0) AS total_threads,
  COALESCE(act.recent_threads, 0) AS recent_threads,
  COALESCE(act.total_prompts, 0) AS total_prompts,
  COALESCE(act.recent_prompts, 0) AS recent_prompts,
  COALESCE(act.recent_answered, 0) AS recent_answered,
  COALESCE(act.recent_askers, 0) AS recent_askers,
  act.last_used_at,
  CASE
    WHEN COALESCE(act.total_prompts, 0) = 0 THEN 'never_used'
    WHEN COALESCE(act.recent_prompts, 0) = 0 THEN 'no_recent_use'
    WHEN COALESCE(act.recent_answered, 0) = 0 THEN 'only_failed_sessions'
    ELSE 'low_traffic'
  END AS reason,
  CASE
    WHEN NOT (SELECT enabled FROM router_enabled) THEN 'router_disabled'
    WHEN COALESCE(r.candidate_count, 0) = 0 THEN 'never_a_candidate'
    WHEN COALESCE(r.suggested_count, 0) = 0 THEN 'candidate_never_suggested'
    WHEN COALESCE(r.chosen_count, 0) = 0 THEN 'suggested_never_chosen'
    ELSE 'routed'
  END AS routing_signal,
  COALESCE(r.candidate_count, 0) AS routed_candidate_count,
  COALESCE(r.suggested_count, 0) AS routed_suggested_count,
  COALESCE(r.chosen_count, 0) AS routed_chosen_count
FROM agents a
  CROSS JOIN params
  LEFT JOIN activity act ON act.agent_uuid = a.ai_agent_uuid
  LEFT JOIN routing r ON r.agent_uuid = a.ai_agent_uuid
WHERE COALESCE(act.recent_prompts, 0) < params.min_prompts
  OR (
    COALESCE(act.recent_prompts, 0) > 0
    AND COALESCE(act.recent_answered, 0) = 0
  )
ORDER BY COALESCE(act.recent_prompts, 0) ASC, a.created_at ASC
LIMIT ?;
`;

/**
 * Warehouse-cost ranking of explores over the window. Only queries that
 * actually hit the warehouse count (cache hits have no execution time), and
 * queries already served by a pre-aggregate are counted separately so an
 * explore that is fully covered stops looking like a candidate.
 *
 * Parameters: window_days, min_queries, project_uuid, limit
 */
export const preAggCandidateExploresSql = () => `
WITH params AS (
  SELECT
    now() - make_interval(days => ?) AS window_start,
    ?::int AS min_queries
),
runs AS (
  SELECT
    qh.metric_query->>'exploreName' AS explore_name,
    qh.warehouse_execution_time_ms AS execution_ms,
    qh.pre_aggregate_compiled_sql IS NOT NULL AS preagg_hit,
    qh.created_by_user_uuid,
    qh.context
  FROM query_history qh
    CROSS JOIN params
  WHERE qh.project_uuid = ?
    AND qh.created_at >= params.window_start
    AND qh.status = 'ready'
    AND qh.error IS NULL
    AND qh.metric_query->>'exploreName' IS NOT NULL
    AND qh.warehouse_execution_time_ms > 0
)
SELECT
  r.explore_name,
  COUNT(*) AS query_count,
  COUNT(DISTINCT r.created_by_user_uuid) AS distinct_users,
  SUM(r.execution_ms) AS total_execution_ms,
  ROUND(AVG(r.execution_ms)) AS avg_execution_ms,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY r.execution_ms)::numeric) AS p95_execution_ms,
  COUNT(*) FILTER (WHERE r.preagg_hit) AS preagg_hit_count,
  (
    SELECT jsonb_object_agg(c.context, c.context_count)
    FROM (
      SELECT context, COUNT(*) AS context_count
      FROM runs r2
      WHERE r2.explore_name = r.explore_name
      GROUP BY context
    ) c
  ) AS context_counts
FROM runs r
  CROSS JOIN params
GROUP BY r.explore_name, params.min_queries
HAVING COUNT(*) FILTER (WHERE NOT r.preagg_hit) >= params.min_queries
ORDER BY SUM(r.execution_ms) DESC
LIMIT ?;
`;

/**
 * Most common (dimensions, metrics) combinations per explore, so a proposed
 * pre-aggregate can cover the shapes users actually run instead of the union
 * of everything. Shapes using table calculations, custom metrics, or custom
 * dimensions can never hit a pre-aggregate, so they are marked rather than
 * silently mixed in.
 *
 * Parameters: window_days, project_uuid, explore_names_csv, shapes_per_explore
 */
export const preAggQueryShapesSql = () => `
WITH params AS (
  SELECT now() - make_interval(days => ?) AS window_start
),
shapes AS (
  SELECT
    qh.metric_query->>'exploreName' AS explore_name,
    (
      SELECT COALESCE(jsonb_agg(d ORDER BY d), '[]'::jsonb)
      FROM jsonb_array_elements_text(qh.metric_query->'dimensions') d
    ) AS dimension_field_ids,
    (
      SELECT COALESCE(jsonb_agg(m ORDER BY m), '[]'::jsonb)
      FROM jsonb_array_elements_text(qh.metric_query->'metrics') m
    ) AS metric_field_ids,
    (
      COALESCE(jsonb_array_length(qh.metric_query->'tableCalculations'), 0) > 0
      OR COALESCE(jsonb_array_length(qh.metric_query->'additionalMetrics'), 0) > 0
      OR COALESCE(jsonb_array_length(qh.metric_query->'customDimensions'), 0) > 0
    ) AS has_custom_fields,
    jsonb_path_query_array(
      COALESCE(qh.metric_query->'filters', '{}'::jsonb), '$.**.fieldId'
    ) AS filter_field_ids,
    qh.warehouse_execution_time_ms AS execution_ms
  FROM query_history qh
    CROSS JOIN params
  WHERE qh.project_uuid = ?
    AND qh.created_at >= params.window_start
    AND qh.status = 'ready'
    AND qh.error IS NULL
    AND qh.metric_query->>'exploreName' = ANY(string_to_array(?, ','))
    AND qh.warehouse_execution_time_ms > 0
    AND qh.pre_aggregate_compiled_sql IS NULL
),
grouped AS (
  SELECT
    explore_name,
    dimension_field_ids,
    metric_field_ids,
    has_custom_fields,
    jsonb_agg(DISTINCT filter_field_ids) AS filter_field_id_sets,
    COUNT(*) AS query_count,
    ROUND(AVG(execution_ms)) AS avg_execution_ms,
    SUM(execution_ms) AS total_execution_ms,
    ROW_NUMBER() OVER (
      PARTITION BY explore_name
      ORDER BY COUNT(*) DESC, SUM(execution_ms) DESC
    ) AS shape_rank
  FROM shapes
  GROUP BY explore_name, dimension_field_ids, metric_field_ids, has_custom_fields
)
SELECT
  explore_name,
  dimension_field_ids,
  metric_field_ids,
  has_custom_fields,
  filter_field_id_sets,
  query_count,
  avg_execution_ms,
  total_execution_ms
FROM grouped
WHERE shape_rank <= ?
ORDER BY explore_name, query_count DESC;
`;

/**
 * Hit/miss counts per explore and miss reason from the pre-aggregate match
 * log. Distinguishes "no pre-aggregate defined" from "defined but keeps
 * missing", which call for different fixes.
 *
 * Parameters: window_days, project_uuid
 */
export const preAggMissStatsSql = () => `
WITH params AS (
  SELECT (now() - make_interval(days => ?))::date AS window_start
)
SELECT
  s.explore_name,
  s.miss_reason,
  SUM(s.hit_count) AS hit_count,
  SUM(s.miss_count) AS miss_count
FROM pre_aggregate_daily_stats s
  CROSS JOIN params
WHERE s.project_uuid = ?
  AND s.date >= params.window_start
GROUP BY s.explore_name, s.miss_reason
ORDER BY s.explore_name, SUM(s.miss_count) DESC;
`;
