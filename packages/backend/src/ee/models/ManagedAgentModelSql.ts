import { DashboardsTableName } from '../../database/entities/dashboards';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';

export type InactiveUserActivitySource =
    | 'chart_view'
    | 'dashboard_view'
    | 'query';

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
