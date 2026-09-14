import { DashboardsTableName } from '../database/entities/dashboards';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';

const activeChartOwnerSql = `(
  sq.space_id IN (
    SELECT s.space_id
    FROM ${SpaceTableName} s
    JOIN projects p ON p.project_id = s.project_id
    WHERE p.project_uuid = :projectUuid AND s.deleted_at IS NULL
  )
  OR (
    sq.space_id IS NULL AND sq.dashboard_uuid IN (
      SELECT d.dashboard_uuid
      FROM ${DashboardsTableName} d
      JOIN ${SpaceTableName} s ON s.space_id = d.space_id AND s.deleted_at IS NULL
      JOIN projects p ON p.project_id = s.project_id
      WHERE p.project_uuid = :projectUuid AND d.deleted_at IS NULL
    )
  )
)`;

export const usersInProjectSql = () => `
SELECT
  DISTINCT ON (users.user_uuid) user_uuid,
  COALESCE(project_memberships.role, project_group_access.role, organization_memberships.role) as role
from users
  left join emails on emails.user_id = users.user_id
  LEFT JOIN organization_memberships ON users.user_id  =  organization_memberships.user_id
    AND organization_memberships.organization_id IN (
      SELECT organization_id FROM organizations WHERE organization_uuid = :organizationUuid
    )
  LEFT JOIN organizations ON organization_memberships.organization_id = organizations.organization_id
  LEFT JOIN project_memberships ON project_memberships.user_id = users.user_id
    AND project_memberships.project_id IN (
      SELECT project_id FROM projects WHERE project_uuid = :projectUuid
    )
  LEFT JOIN projects on project_memberships.project_id = projects.project_id
  LEFT JOIN group_memberships ON group_memberships.user_id = users.user_id
  LEFT JOIN project_group_access ON project_group_access.group_uuid = group_memberships.group_uuid
    AND project_group_access.project_uuid = :projectUuid
WHERE
  emails.is_primary = true
  AND users.is_internal = false
  AND (
      ((organization_memberships.role != 'member'
        OR organization_memberships.role_uuid IS NOT NULL)
        AND organization_uuid = :organizationUuid)
  OR
      (projects.project_uuid = :projectUuid)
  OR (
    project_group_access.project_uuid = :projectUuid
  ))
`;

export const numberWeeklyQueryingUsersSql = () => `
select
  100 * COUNT(DISTINCT(user_uuid)) / NULLIF(cardinality(CAST(:userUuids AS uuid[])), 0) AS count
from analytics_chart_views
  left join ${SavedChartsTableName} sq on sq.saved_query_uuid = analytics_chart_views.chart_uuid AND sq.deleted_at IS NULL
WHERE user_uuid = ANY(CAST(:userUuids AS uuid[]))
  AND sq.project_uuid = :projectUuid
  AND ${activeChartOwnerSql}
  AND timestamp between NOW() - interval '7 days' and NOW()
`;

export const tableMostQueriesSql = () => `
select
  users.user_uuid,
  users.first_name,
  users.last_name,
  COUNT(analytics_chart_views.chart_uuid)
from analytics_chart_views
  LEFT JOIN users ON users.user_uuid = analytics_chart_views.user_uuid
  left join ${SavedChartsTableName} sq on sq.saved_query_uuid = analytics_chart_views.chart_uuid AND sq.deleted_at IS NULL
WHERE users.user_uuid = ANY(CAST(:userUuids AS uuid[]))
  AND sq.project_uuid = :projectUuid
  AND ${activeChartOwnerSql}
  AND timestamp between NOW() - interval '7 days' and NOW()
GROUP BY users.user_uuid,
  users.first_name,
  users.last_name
ORDER BY COUNT(analytics_chart_views.user_uuid) DESC

`;

export const tableMostCreatedChartsSql = () => `
select
  users.user_uuid,
  users.first_name,
  users.last_name,
  COUNT(saved_queries_versions.updated_by_user_uuid)
from saved_queries_versions
  LEFT JOIN users ON users.user_uuid = saved_queries_versions.updated_by_user_uuid
  left join ${SavedChartsTableName} sq on sq.saved_query_id = saved_queries_versions.saved_query_id AND sq.deleted_at IS NULL
WHERE users.user_uuid = ANY(CAST(:userUuids AS uuid[]))
  AND sq.project_uuid = :projectUuid
  AND ${activeChartOwnerSql}
  AND saved_queries_versions.created_at between NOW() - interval '7 days' and NOW()
GROUP BY
  users.user_uuid,
  users.first_name,
  users.last_name
ORDER BY COUNT(saved_queries_versions.updated_by_user_uuid) DESC
limit 10
`;

export const tableNoQueriesSql = () => `
WITH last_chart_views AS (
  SELECT acv.user_uuid, MAX(acv.timestamp) AS last_viewed_at
  FROM analytics_chart_views acv
  JOIN ${SavedChartsTableName} sq ON sq.saved_query_uuid = acv.chart_uuid AND sq.deleted_at IS NULL
  WHERE acv.user_uuid = ANY(CAST(:userUuids AS uuid[]))
    AND sq.project_uuid = :projectUuid
    AND ${activeChartOwnerSql}
  GROUP BY acv.user_uuid
)
SELECT
  u.user_uuid,
  u.first_name,
  u.last_name,
  EXTRACT(DAY FROM NOW() - COALESCE(v.last_viewed_at, u.created_at)) AS count
FROM users u
LEFT JOIN last_chart_views v ON v.user_uuid = u.user_uuid
WHERE u.user_uuid = ANY(CAST(:userUuids AS uuid[]))
  AND u.first_name <> ''
  AND COALESCE(v.last_viewed_at, u.created_at) < NOW() - interval '90 days'
`;

const dateUserViewsGrid = () => `
WITH date_grid AS (
  SELECT
    date
  FROM
    generate_series(CURRENT_DATE - interval '42 days', CURRENT_DATE, '1 day'::interval) date
),
users_date_grid AS (
  SELECT
    d.date as date,
    users.user_uuid
  FROM (SELECT * FROM date_grid) AS d
    cross join users
  where users.created_at  < d.date and users.user_uuid = ANY(CAST(:userUuids AS uuid[]))
),
query_executed AS (
  SELECT
    timestamp::date AS date,
    user_uuid,
    COUNT(DISTINCT(chart_uuid)) AS num_queries_executed
  FROM analytics_chart_views acv  -- this is a table with one row per query executed
    left join ${SavedChartsTableName} sq on sq.saved_query_uuid = acv.chart_uuid AND sq.deleted_at IS NULL
  WHERE  sq.project_uuid = :projectUuid
    AND ${activeChartOwnerSql}
    AND acv.timestamp >= CURRENT_DATE - interval '42 days'
    AND acv.user_uuid = ANY(CAST(:userUuids AS uuid[]))
  GROUP BY 1, 2
),
stg AS (
  SELECT
    grid.date,
    grid.user_uuid,
    SUM(query_executed.num_queries_executed) OVER(PARTITION BY grid.user_uuid ORDER BY grid.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS num_queries_7d_rolling
  FROM users_date_grid AS grid
  LEFT JOIN query_executed ON query_executed.user_uuid = grid.user_uuid AND query_executed.date = grid.date::date
)`;
export const chartWeeklyQueryingUsersSql = () => `
${dateUserViewsGrid()}
SELECT
  date,
  COUNT(DISTINCT(
    case WHEN num_queries_7d_rolling > 0 THEN
      user_uuid
    else
      NULL
    end
    )) AS num_7d_active_users,
  100 * COUNT(DISTINCT(
    case WHEN num_queries_7d_rolling > 0 THEN
    user_uuid
    else
    NULL
    end
    )) / COUNT(DISTINCT(user_uuid)) AS percent_7d_active_users
FROM stg
group by date
order by date desc
`;

export const chartWeeklyAverageQueriesSql = () => `
${dateUserViewsGrid()}
SELECT
  date,
  ROUND(AVG(num_queries_7d_rolling), 2) AS average_number_of_weekly_queries_per_user
FROM stg
group by date
order by date desc

`;

export const chartViewsSql = () => `
SELECT
  count(chart_uuid) as count,
  chart_uuid as uuid,
  sq.slug,
  sq.name
FROM analytics_chart_views
  left join ${SavedChartsTableName} sq on sq.saved_query_uuid  = chart_uuid AND sq.deleted_at IS NULL
where sq.project_uuid = :projectUuid
  AND ${activeChartOwnerSql}
group by chart_uuid, sq.slug, sq.name
order by count(chart_uuid) desc
limit 20
`;

export const dashboardViewsSql = () => `
SELECT
  count(dv.dashboard_uuid) as count,
  dv.dashboard_uuid as uuid,
  d.slug,
  d.name
FROM analytics_dashboard_views dv
  left join ${DashboardsTableName} d  on d.dashboard_uuid  = dv.dashboard_uuid AND d.deleted_at IS NULL
  left join ${SpaceTableName} s on s.space_id = d.space_id AND s.deleted_at IS NULL
  left join projects on projects.project_id = s.project_id
where projects.project_uuid = :projectUuid
group by dv.dashboard_uuid, d.slug, d.name
order by count(dv.dashboard_uuid) desc
limit 20
`;

export const userMostViewedDashboardSql = () => `
WITH RankedResults AS (
  SELECT
      u.user_uuid,
      u.first_name,
      u.last_name,
      d.dashboard_uuid,
      d.slug AS dashboard_slug,
      d."name" AS dashboard_name,
      COUNT(dv.dashboard_uuid) AS dashboard_count,
      ROW_NUMBER() OVER (PARTITION BY u.user_uuid ORDER BY COUNT(dv.dashboard_uuid) DESC, d.dashboard_uuid) AS rank
  FROM analytics_dashboard_views dv
  LEFT JOIN users u ON u.user_uuid = dv.user_uuid
  LEFT JOIN ${DashboardsTableName} d ON dv.dashboard_uuid = d.dashboard_uuid AND d.deleted_at IS NULL
  left join ${SpaceTableName} s on s.space_id = d.space_id AND s.deleted_at IS NULL
  left join projects on projects.project_id = s.project_id
  WHERE projects.project_uuid = :projectUuid
    AND u.user_uuid IS NOT NULL
  GROUP BY u.user_uuid, u.first_name, u.last_name, d.dashboard_uuid, d.slug, d."name"
)
SELECT
  user_uuid,
  first_name,
  last_name,
  dashboard_uuid,
  dashboard_slug,
  dashboard_name,
  dashboard_count as count
FROM RankedResults
WHERE rank = 1;
`;

export const viewsRawDataSql = () => `
WITH view_events AS (
  SELECT
    'chart'::text AS type,
    date_trunc('second', cv.timestamp) AS viewed_at,
    sq.saved_query_uuid AS uuid,
    cv.user_uuid
  FROM analytics_chart_views cv
    JOIN ${SavedChartsTableName} sq ON sq.saved_query_uuid = cv.chart_uuid AND sq.deleted_at IS NULL
  WHERE sq.project_uuid = :projectUuid AND ${activeChartOwnerSql}
  UNION
  SELECT
    'dashboard'::text,
    date_trunc('second', dv.timestamp),
    d.dashboard_uuid,
    dv.user_uuid
  FROM analytics_dashboard_views dv
    JOIN ${DashboardsTableName} d ON d.dashboard_uuid = dv.dashboard_uuid AND d.deleted_at IS NULL
    JOIN ${SpaceTableName} s ON s.space_id = d.space_id
    JOIN projects p ON p.project_id = s.project_id
  WHERE p.project_uuid = :projectUuid AND s.deleted_at IS NULL
), limited_events AS MATERIALIZED (
  SELECT * FROM view_events ORDER BY viewed_at DESC LIMIT 100000
)
SELECT
  e.type,
  to_char(e.viewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp,
  e.uuid,
  CASE WHEN e.type = 'chart' THEN sq.name ELSE d.name END AS name,
  u.user_uuid,
  u.first_name AS user_first_name,
  u.last_name AS user_last_name,
  CASE WHEN e.type = 'chart' THEN chart_space.name ELSE dashboard_space.name END AS space_name
FROM limited_events e
  LEFT JOIN users u ON u.user_uuid = e.user_uuid
  LEFT JOIN ${SavedChartsTableName} sq ON e.type = 'chart' AND sq.saved_query_uuid = e.uuid AND sq.deleted_at IS NULL
  LEFT JOIN ${DashboardsTableName} owner ON owner.dashboard_uuid = sq.dashboard_uuid
    AND owner.deleted_at IS NULL
  LEFT JOIN ${SpaceTableName} chart_space ON chart_space.space_id = COALESCE(sq.space_id, owner.space_id) AND chart_space.deleted_at IS NULL
  LEFT JOIN ${DashboardsTableName} d ON e.type = 'dashboard' AND d.dashboard_uuid = e.uuid AND d.deleted_at IS NULL
  LEFT JOIN ${SpaceTableName} dashboard_space ON dashboard_space.space_id = d.space_id AND dashboard_space.deleted_at IS NULL
ORDER BY timestamp DESC
`;

/**
 * Parameters: project_uuid, staleness_days, staleness_days, protect_recent_days, limit
 */
export const unusedChartsSql = () => `
SELECT
  sq.name as content_name,
  sq.created_at,
  sq.saved_query_uuid as content_uuid,
  s.space_uuid,
  'chart' as content_type,
  sq.last_version_updated_by_user_uuid as created_by_user_uuid,
  COALESCE(cu.first_name || ' ' || cu.last_name, '') as created_by_user_name,
  MAX(cv.timestamp) as last_viewed_at,
  COUNT(cv.chart_uuid) as views_count,
  CASE WHEN MAX(cv.timestamp) IS NULL THEN 'never_viewed' ELSE 'not_viewed_recently' END as reason,
  (
    SELECT acv.user_uuid
    FROM analytics_chart_views acv
    WHERE acv.chart_uuid = sq.saved_query_uuid
    ORDER BY acv.timestamp DESC
    LIMIT 1
  ) as last_viewed_by_user_uuid,
  (
    SELECT u.first_name || ' ' || u.last_name
    FROM analytics_chart_views acv
    LEFT JOIN users u ON u.user_uuid = acv.user_uuid
    WHERE acv.chart_uuid = sq.saved_query_uuid
    ORDER BY acv.timestamp DESC
    LIMIT 1
  ) as last_viewed_by_user_name
FROM ${SavedChartsTableName} sq
LEFT JOIN users cu ON cu.user_uuid = sq.last_version_updated_by_user_uuid
LEFT JOIN ${SpaceTableName} s ON s.space_id = sq.space_id
LEFT JOIN projects p ON p.project_id = s.project_id
LEFT JOIN analytics_chart_views cv ON cv.chart_uuid = sq.saved_query_uuid
WHERE p.project_uuid = ?
  AND sq.deleted_at IS NULL
  AND s.deleted_at IS NULL
GROUP BY
  sq.name,
  sq.created_at,
  sq.saved_query_uuid,
  sq.saved_query_id,
  s.space_uuid,
  sq.last_version_updated_by_user_uuid,
  cu.first_name,
  cu.last_name
HAVING
  (
    MAX(cv.timestamp) < now() - make_interval(days => ?)
    -- Never-viewed content only counts as stale once it has existed for the
    -- full staleness window; the protect window alone is not enough
    OR (
      MAX(cv.timestamp) IS NULL
      AND sq.created_at < now() - make_interval(days => ?)
    )
  )
  AND GREATEST(
    sq.created_at,
    COALESCE((SELECT MAX(v.created_at) FROM saved_queries_versions v WHERE v.saved_query_id = sq.saved_query_id), sq.created_at)
  ) < now() - make_interval(days => ?)
ORDER BY
  MAX(cv.timestamp) ASC NULLS FIRST,
  COUNT(cv.chart_uuid) ASC,
  sq.created_at ASC
LIMIT ?;
`;

/**
 * Parameters: project_uuid, staleness_days, staleness_days, protect_recent_days, limit
 */
export const unusedDashboardsSql = () => `
SELECT
  d.name as content_name,
  d.created_at,
  d.dashboard_uuid as content_uuid,
  s.space_uuid,
  'dashboard' as content_type,
  first_version.updated_by_user_uuid as created_by_user_uuid,
  COALESCE(cu.first_name || ' ' || cu.last_name, '') as created_by_user_name,
  MAX(adv.timestamp) as last_viewed_at,
  COUNT(adv.dashboard_uuid) as views_count,
  CASE WHEN MAX(adv.timestamp) IS NULL THEN 'never_viewed' ELSE 'not_viewed_recently' END as reason,
  (
    SELECT adv2.user_uuid
    FROM analytics_dashboard_views adv2
    WHERE adv2.dashboard_uuid = d.dashboard_uuid
    ORDER BY adv2.timestamp DESC
    LIMIT 1
  ) as last_viewed_by_user_uuid,
  (
    SELECT u.first_name || ' ' || u.last_name
    FROM analytics_dashboard_views adv2
    LEFT JOIN users u ON u.user_uuid = adv2.user_uuid
    WHERE adv2.dashboard_uuid = d.dashboard_uuid
    ORDER BY adv2.timestamp DESC
    LIMIT 1
  ) as last_viewed_by_user_name
FROM ${DashboardsTableName} d
LEFT JOIN (
  SELECT DISTINCT ON (dashboard_id)
    dashboard_id,
    updated_by_user_uuid
  FROM dashboard_versions
  ORDER BY dashboard_id, created_at ASC
) first_version ON first_version.dashboard_id = d.dashboard_id
LEFT JOIN users cu ON cu.user_uuid = first_version.updated_by_user_uuid
LEFT JOIN ${SpaceTableName} s ON s.space_id = d.space_id
LEFT JOIN projects p ON p.project_id = s.project_id
LEFT JOIN analytics_dashboard_views adv ON adv.dashboard_uuid = d.dashboard_uuid
WHERE p.project_uuid = ?
  AND d.deleted_at IS NULL
  AND s.deleted_at IS NULL
GROUP BY
  d.name,
  d.created_at,
  d.dashboard_uuid,
  d.dashboard_id,
  s.space_uuid,
  first_version.updated_by_user_uuid,
  cu.first_name,
  cu.last_name
HAVING
  (
    MAX(adv.timestamp) < now() - make_interval(days => ?)
    -- Never-viewed content only counts as stale once it has existed for the
    -- full staleness window; the protect window alone is not enough
    OR (
      MAX(adv.timestamp) IS NULL
      AND d.created_at < now() - make_interval(days => ?)
    )
  )
  AND GREATEST(
    d.created_at,
    COALESCE((SELECT MAX(dv.created_at) FROM dashboard_versions dv WHERE dv.dashboard_id = d.dashboard_id), d.created_at)
  ) < now() - make_interval(days => ?)
ORDER BY
  MAX(adv.timestamp) ASC NULLS FIRST,
  COUNT(adv.dashboard_uuid) ASC,
  d.created_at ASC
LIMIT ?;
`;
