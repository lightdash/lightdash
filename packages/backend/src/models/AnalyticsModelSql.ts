export const usersInProjectSql = (
    projectUuid: string,
    organizationUuid: string,
) => `
SELECT 
  DISTINCT ON (users.user_uuid) user_uuid,
  COALESCE(project_memberships.role, project_group_access.role, organization_memberships.role) as role
from users 
  left join emails on emails.user_id = users.user_id
  LEFT JOIN organization_memberships ON users.user_id  =  organization_memberships.user_id
  LEFT JOIN organizations ON organization_memberships.organization_id = organizations.organization_id
  LEFT JOIN project_memberships ON project_memberships.user_id = users.user_id
  LEFT JOIN projects on project_memberships.project_id = projects.project_id
  LEFT JOIN group_memberships ON group_memberships.user_id = users.user_id
  LEFT JOIN project_group_access ON project_group_access.group_uuid = group_memberships.group_uuid
WHERE 
  emails.is_primary = true 
  AND ( 
      (organization_memberships.role != 'member'
        AND organization_uuid = '${organizationUuid}')
  OR 
      (projects.project_uuid = '${projectUuid}')
  OR (
    project_group_access.project_uuid = '${projectUuid}'
  ))
`;

export const numberWeeklyQueryingUsersSql = (
    userUuids: string[],
    projectUuid: string,
) => `
select 
  100 * COUNT(DISTINCT(user_uuid)) / ${userUuids.length} AS count
from analytics_chart_views
  left join saved_queries sq on sq.saved_query_uuid = analytics_chart_views.chart_uuid
  left join spaces s on s.space_id  = sq.space_id 
  left join projects on projects.project_id = s.project_id
WHERE user_uuid in ('${userUuids.join(`','`)}') 
  AND projects.project_uuid = '${projectUuid}'
  AND timestamp between NOW() - interval '7 days' and NOW()
`;

export const tableMostQueriesSql = (
    userUuids: string[],
    projectUuid: string,
) => `
select 
  users.user_uuid, 
  users.first_name, 
  users.last_name, 
  COUNT(analytics_chart_views.chart_uuid)
from analytics_chart_views
  LEFT JOIN users ON users.user_uuid = analytics_chart_views.user_uuid
  left join saved_queries sq on sq.saved_query_uuid = analytics_chart_views.chart_uuid
  left join spaces s on s.space_id  = sq.space_id 
  left join projects on projects.project_id = s.project_id
WHERE users.user_uuid in ('${userUuids.join(`','`)}') 
  AND projects.project_uuid = '${projectUuid}'
  AND timestamp between NOW() - interval '7 days' and NOW()
GROUP BY users.user_uuid, 
  users.first_name, 
  users.last_name
ORDER BY COUNT(analytics_chart_views.user_uuid) DESC

`;

export const tableMostCreatedChartsSql = (
    userUuids: string[],
    projectUuid: string,
) => `
select 
  users.user_uuid, 
  users.first_name,
  users.last_name, 
  COUNT(saved_queries_versions.updated_by_user_uuid)
from saved_queries_versions
  LEFT JOIN users ON users.user_uuid = saved_queries_versions.updated_by_user_uuid
  left join saved_queries sq on sq.saved_query_id = saved_queries_versions.saved_query_id
  left join spaces s on s.space_id  = sq.space_id 
  left join projects on projects.project_id = s.project_id
WHERE users.user_uuid in ('${userUuids.join(`','`)}') 
  AND projects.project_uuid = '${projectUuid}'
  AND saved_queries_versions.created_at between NOW() - interval '7 days' and NOW()
GROUP BY 
  users.user_uuid, 
  users.first_name, 
  users.last_name
ORDER BY COUNT(saved_queries_versions.updated_by_user_uuid) DESC
limit 10
`;

export const tableNoQueriesSql = (userUuids: string[], projectUuid: string) => `
select 
  users.user_uuid, 
  MIN(users.first_name) as first_name, 
  MIN(users.last_name) as last_name,
  EXTRACT(DAY FROM  NOW() - COALESCE(MAX(analytics_chart_views.timestamp), MAX(users.created_at) ))   as count 
from users
  LEFT JOIN analytics_chart_views ON users.user_uuid = analytics_chart_views.user_uuid
  left join saved_queries sq on sq.saved_query_uuid = analytics_chart_views.chart_uuid
  left join spaces s on s.space_id  = sq.space_id 
  left join projects on projects.project_id = s.project_id
WHERE users.user_uuid in ('${userUuids.join(
    `','`,
)}') AND users.first_name <> '' 
  AND 
  (
    ( 
      projects.project_uuid = '${projectUuid}'
      AND analytics_chart_views.timestamp <> null
      AND analytics_chart_views.timestamp < NOW() - interval '90 days'
    )
    OR 
    (
      analytics_chart_views.timestamp is null 
      AND users.created_at < NOW() - interval '90 days'
    )
  )
GROUP BY users.user_uuid

`;

const dateUserViewsGrid = (userUuids: string[], projectUuid: string) => `
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
  where users.created_at  < d.date and users.user_uuid in ('${userUuids.join(
      `','`,
  )}')
),
query_executed AS (
  SELECT
    timestamp::date AS date,
    user_uuid,
    COUNT(DISTINCT(chart_uuid)) AS num_queries_executed
  FROM analytics_chart_views acv  -- this is a table with one row per query executed
    left join saved_queries sq on sq.saved_query_uuid = acv.chart_uuid
    left join spaces s on s.space_id  = sq.space_id 
    left join projects on projects.project_id = s.project_id
  WHERE  projects.project_uuid = '${projectUuid}'
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
export const chartWeeklyQueryingUsersSql = (
    userUuids: string[],
    projectUuid: string,
) => `
${dateUserViewsGrid(userUuids, projectUuid)}
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

export const chartWeeklyAverageQueriesSql = (
    userUuids: string[],
    projectUuid: string,
) => `
${dateUserViewsGrid(userUuids, projectUuid)}
SELECT
  date, 
  ROUND(AVG(num_queries_7d_rolling), 2) AS average_number_of_weekly_queries_per_user
FROM stg
group by date
order by date desc

`;

export const chartViewsSql = (projectUuid: string) => `
SELECT  
  count(chart_uuid) as count, 
  chart_uuid as uuid, 
  sq.name
FROM public.analytics_chart_views
  left join saved_queries sq on sq.saved_query_uuid  = chart_uuid 
  left join spaces s on s.space_id  = sq.space_id 
  left join projects on projects.project_id = s.project_id
where projects.project_uuid = '${projectUuid}'
group by chart_uuid, sq.name
order by count(chart_uuid) desc
limit 20
`;

export const dashboardViewsSql = (projectUuid: string) => `
SELECT  
  count(dv.dashboard_uuid) as count, 
  dv.dashboard_uuid as uuid, 
  d.name
FROM public.analytics_dashboard_views dv
  left join dashboards d  on d.dashboard_uuid  = dv.dashboard_uuid 
  left join spaces s on s.space_id  = d.space_id 
  left join projects on projects.project_id = s.project_id
where projects.project_uuid = '${projectUuid}'
group by dv.dashboard_uuid, d.name
order by count(dv.dashboard_uuid) desc
limit 20
`;

export const userMostViewedDashboardSql = (projectUuid: string) => `
WITH RankedResults AS (
  SELECT
      u.user_uuid,
      u.first_name,
      u.last_name,
      d."name" AS dashboard_name,
      COUNT(dv.dashboard_uuid) AS dashboard_count,
      ROW_NUMBER() OVER (PARTITION BY u.first_name ORDER BY COUNT(dv.dashboard_uuid) DESC) AS rank
  FROM public.analytics_dashboard_views dv
  LEFT JOIN users u ON u.user_uuid = dv.user_uuid
  LEFT JOIN dashboards d ON dv.dashboard_uuid = d.dashboard_uuid
  left join spaces s on s.space_id  = d.space_id 
  left join projects on projects.project_id = s.project_id
  WHERE projects.project_uuid = '${projectUuid}' 
    AND u.user_uuid IS NOT NULL
  GROUP BY u.user_uuid, u.first_name, u.last_name, d."name"
)
SELECT
  user_uuid, 
  first_name,
  last_name,
  dashboard_name,
  dashboard_count as count
FROM RankedResults
WHERE rank = 1;
`;

/**
 * Parameters: project_uuid
 */
export const unusedChartsSql = () => `
SELECT 
  sq.name as content_name,
  sq.created_at,
  sq.saved_query_uuid as content_uuid,
  'chart' as content_type,
  sq.last_version_updated_by_user_uuid as created_by_user_uuid,
  COALESCE(cu.first_name || ' ' || cu.last_name, '') as created_by_user_name,
  MAX(cv.timestamp) as last_viewed_at,
  COUNT(cv.chart_uuid) as views_count,
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
FROM saved_queries sq
LEFT JOIN users cu ON cu.user_uuid = sq.last_version_updated_by_user_uuid
LEFT JOIN spaces s ON s.space_id = sq.space_id
LEFT JOIN projects p ON p.project_id = s.project_id
LEFT JOIN analytics_chart_views cv ON cv.chart_uuid = sq.saved_query_uuid
WHERE p.project_uuid = ?
GROUP BY 
  sq.name, 
  sq.created_at,
  sq.saved_query_uuid, 
  sq.last_version_updated_by_user_uuid,
  cu.first_name,
  cu.last_name
ORDER BY 
  MAX(cv.timestamp) ASC NULLS FIRST,
  COUNT(cv.chart_uuid) ASC,
  sq.created_at ASC
LIMIT 10;
`;

/**
 * Parameters: project_uuid
 */
export const unusedDashboardsSql = () => `
SELECT 
  d.name as content_name,
  d.created_at,
  d.dashboard_uuid as content_uuid,
  'dashboard' as content_type,
  first_version.updated_by_user_uuid as created_by_user_uuid,
  COALESCE(cu.first_name || ' ' || cu.last_name, '') as created_by_user_name,
  MAX(adv.timestamp) as last_viewed_at,
  COUNT(adv.dashboard_uuid) as views_count,
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
FROM dashboards d
LEFT JOIN (
  SELECT DISTINCT ON (dashboard_id) 
    dashboard_id, 
    updated_by_user_uuid
  FROM dashboard_versions 
  ORDER BY dashboard_id, created_at ASC
) first_version ON first_version.dashboard_id = d.dashboard_id
LEFT JOIN users cu ON cu.user_uuid = first_version.updated_by_user_uuid
LEFT JOIN spaces s ON s.space_id = d.space_id
LEFT JOIN projects p ON p.project_id = s.project_id
LEFT JOIN analytics_dashboard_views adv ON adv.dashboard_uuid = d.dashboard_uuid
WHERE p.project_uuid = ?
GROUP BY 
  d.name, 
  d.created_at,
  d.dashboard_uuid, 
  first_version.updated_by_user_uuid,
  cu.first_name,
  cu.last_name
ORDER BY 
  MAX(adv.timestamp) ASC NULLS FIRST,
  COUNT(adv.dashboard_uuid) ASC,
  d.created_at ASC
LIMIT 10;
`;
