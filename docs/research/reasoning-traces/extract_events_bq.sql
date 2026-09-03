-- Reasoning-trace spike, telemetry variant: same event stream as extract_events.sql
-- but built from the product-analytics warehouse (BigQuery) instead of the
-- application database. Use this when you only have the analytics project.
--
-- Differences from the application-DB extract, because telemetry is thinner:
--   * query steps carry the explore name and field COUNTS, not field ids, so the
--     step-by-step diff is "+1 dimension, +1 filter" rather than named fields;
--   * agent prompts carry no prompt text, only thread/agent ids;
--   * chart saves carry title and type but not the explore;
--   * dashboard tile queries, metrics-explorer previews, chart views and
--     dashboard views are collapsed to one event per user/object/minute;
--   * 'api', 'cli', 'embed', totals and scheduled contexts are excluded.
-- Emails are replaced by a short hash of the user id.
--
-- Placeholders: {org_uuid}, {days}. Output columns match extract_events.sql.
WITH params AS (
  SELECT '{org_uuid}' AS org_uuid, TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY) AS since
),
org_projects AS (
  SELECT p.project_id AS project_uuid FROM `lightdash-analytics.analytics.projects` p JOIN params ON p.organization_id = params.org_uuid
),
raw_q AS (
  SELECT q.* FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_query_executed` q
  JOIN params ON q.organization_id = params.org_uuid
  WHERE q._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days}+1 DAY)
    AND q.timestamp >= params.since AND q.user_id IS NOT NULL
    AND q.context_app_mode IN ('default','cloud_beta')
    AND q.context NOT IN ('filterAutocomplete','alert','scheduledDelivery','scheduledGsheetsChart','scheduledGsheetsDashboard','scheduledGsheetsSqlChart','scheduledChart','scheduledDashboard','preAggregateMaterialization','autorefreshedDashboard','embed','api','cli','calculateTotal','calculateSubtotal')
  QUALIFY ROW_NUMBER() OVER (PARTITION BY q.id ORDER BY q.loaded_at DESC) = 1
),
query_events AS (
  -- dashboard tiles and metrics-explorer previews collapse to one event per minute
  SELECT user_id, project_id, MIN(timestamp) AS ts, 'query' AS kind, context, explore_name AS explore,
         COALESCE(dashboard_id, chart_id) AS ref_uuid,
         TO_JSON_STRING(STRUCT(COUNT(*) AS n, ANY_VALUE(dashboard_id) AS dashboard_id, ANY_VALUE(chart_id) AS chart_id,
                               MAX(dimensions_count) AS dims, MAX(metrics_count) AS mets, MAX(filters_count) AS filters)) AS payload
  FROM raw_q WHERE context IN ('dashboardView','metricsExplorer')
  GROUP BY user_id, project_id, context, explore_name, COALESCE(dashboard_id, chart_id), TIMESTAMP_TRUNC(timestamp, MINUTE)
  UNION ALL
  SELECT user_id, project_id, timestamp, 'query', context, explore_name, COALESCE(chart_id, dashboard_id, sql_chart_id),
         TO_JSON_STRING(STRUCT(dimensions_count AS dims, metrics_count AS mets, filters_count AS filters, sorts_count AS sorts,
                               table_calculations_count AS tc, additional_metrics_count AS addl, num_custom_sql_dimensions AS custom_sql,
                               cache_metadata_cache_hit AS cache_hit, _limit AS lim, chart_id, dashboard_id))
  FROM raw_q WHERE context NOT IN ('dashboardView','metricsExplorer')
),
chart_saves AS (
  SELECT v.user_id, v.project_id, v.timestamp, 'chart_save', 'chartSave', CAST(NULL AS STRING), v.saved_query_id,
         TO_JSON_STRING(STRUCT(v.title AS chart_name, v.chart_type, v.dimensions_count AS dims, v.metrics_count AS mets, v.filters_count AS filters,
                               (c.saved_query_id IS NOT NULL) AS is_first_version))
  FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_saved_chart_version_created` v
  JOIN org_projects op ON op.project_uuid = v.project_id JOIN params ON TRUE
  LEFT JOIN (SELECT saved_query_id, MIN(timestamp) t FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_saved_chart_created`
              WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days}+1 DAY) GROUP BY 1) c
    ON c.saved_query_id = v.saved_query_id AND ABS(TIMESTAMP_DIFF(c.t, v.timestamp, SECOND)) < 5
  WHERE v._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days}+1 DAY)
    AND v.timestamp >= params.since AND v.user_id IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY v.id ORDER BY v.loaded_at DESC) = 1
),
dash_saves AS (
  SELECT v.user_id, v.project_id, v.timestamp, 'dash_save', 'dashboardSave', CAST(NULL AS STRING), v.dashboard_id,
         TO_JSON_STRING(STRUCT(v.title AS dashboard_name, v.tiles_count AS tiles))
  FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_dashboard_version_created` v
  JOIN org_projects op ON op.project_uuid = v.project_id JOIN params ON TRUE
  WHERE v._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days}+1 DAY)
    AND v.timestamp >= params.since AND v.user_id IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY v.id ORDER BY v.loaded_at DESC) = 1
),
chart_views AS (
  -- one event per user/project/minute: dashboard tiles fire one view per chart
  SELECT user_id, project_id, MIN(timestamp), 'chart_view', 'chartView', CAST(NULL AS STRING), MIN(saved_chart_id),
         TO_JSON_STRING(STRUCT(STRING_AGG(DISTINCT saved_chart_name, ' | ' LIMIT 4) AS chart_name, COUNT(*) AS n, COUNT(DISTINCT saved_chart_id) AS charts))
  FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_saved_chart_view` v JOIN params ON v.organization_id = params.org_uuid
  WHERE v._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days}+1 DAY)
    AND v.timestamp >= params.since AND v.user_id IS NOT NULL
  GROUP BY user_id, project_id, TIMESTAMP_TRUNC(timestamp, MINUTE)
),
dash_views AS (
  SELECT user_id, project_id, MIN(timestamp), 'dash_view', 'dashboardView', CAST(NULL AS STRING), dashboard_id,
         TO_JSON_STRING(STRUCT(ANY_VALUE(dashboard_name) AS dashboard_name, COUNT(*) AS n))
  FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_dashboard_view` v JOIN params ON v.organization_id = params.org_uuid
  WHERE v._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days}+1 DAY)
    AND v.timestamp >= params.since AND v.user_id IS NOT NULL
  GROUP BY user_id, project_id, dashboard_id, TIMESTAMP_TRUNC(timestamp, MINUTE)
),
ai_prompts AS (
  SELECT a.user_id, a.project_id, a.event_at, 'ai_prompt', 'ai', CAST(NULL AS STRING), a.thread_id,
         TO_JSON_STRING(STRUCT(a.ai_agent_id AS agent, a.prompt_context AS surface, a.has_pinned_context AS pinned))
  FROM `lightdash-analytics.analytics.ai_agent_prompts` a JOIN params ON a.organization_id = params.org_uuid
  WHERE a.event_at >= params.since AND a.user_id IS NOT NULL
),
events AS (
  SELECT * FROM query_events UNION ALL SELECT * FROM chart_saves UNION ALL SELECT * FROM dash_saves
  UNION ALL SELECT * FROM chart_views UNION ALL SELECT * FROM dash_views UNION ALL SELECT * FROM ai_prompts
),
flat AS (
  SELECT SUBSTR(TO_HEX(SHA256(user_id)), 1, 10) AS user_uuid,
         SUBSTR(TO_HEX(SHA256(user_id)), 1, 10) AS email,
         project_id AS project_uuid,
         FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ts) AS ts,
         kind, context, explore, ref_uuid, payload
  FROM events
)
-- Packed for a row-capped client (MCP run_sql returns at most 1000 rows): one row
-- per user/project/day holding that day's events as a JSON array. unpack_events.py
-- turns the result back into the flat TSV that sessionise.py reads.
SELECT ROW_NUMBER() OVER (ORDER BY user_uuid, project_uuid, MIN(ts)) AS rn,
       user_uuid, project_uuid, SUBSTR(ts, 1, 10) AS day, COUNT(*) AS n,
       TO_JSON_STRING(ARRAY_AGG(STRUCT(ts, kind, context, explore, ref_uuid, payload) ORDER BY ts, kind)) AS events
FROM flat GROUP BY user_uuid, project_uuid, day
