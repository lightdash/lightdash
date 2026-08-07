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
 * member_uuids, project_uuid, member_uuids, inactive_days, limit
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
    latest.timestamp IS NULL
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
