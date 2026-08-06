import { DashboardsTableName } from '../../database/entities/dashboards';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';

export type InactiveUserActivitySource =
    | 'chart_view'
    | 'dashboard_view'
    | 'query';

export type OrphanedContentOwnerStatus = 'deactivated' | 'left_org';

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
