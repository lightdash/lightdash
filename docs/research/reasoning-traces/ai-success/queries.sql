-- AI-success spike: warehouse pulls (BigQuery, run with `bq query --use_legacy_sql=false --format=csv --max_rows=200000`).
-- All aggregate to one row per prompt / project / agent / organisation. No prompt text is pulled.

-- prompts.csv
WITH u AS (SELECT * FROM `lightdash-analytics.analytics.ai_agent_usage` WHERE event_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)),
tools AS (SELECT prompt_id, ANY_VALUE(thread_id) thread_id, ANY_VALUE(organization_id) organization_id, ANY_VALUE(project_id) project_id, ANY_VALUE(ai_agent_id) ai_agent_id, ANY_VALUE(user_id) user_id, MIN(event_at) ts, COUNT(*) n_tools, COUNT(DISTINCT tool_name) n_distinct_tools, STRING_AGG(tool_name, '>' ORDER BY event_at) tool_seq FROM u WHERE event_name='lightdash_server_ai_agent_tool_call' AND prompt_id IS NOT NULL GROUP BY 1),
tok AS (SELECT prompt_id, ANY_VALUE(thread_id) thread_id, ANY_VALUE(organization_id) organization_id, ANY_VALUE(project_id) project_id, ANY_VALUE(ai_agent_id) ai_agent_id, ANY_VALUE(user_id) user_id, MIN(event_at) ts, ARRAY_AGG(model ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] model, ARRAY_AGG(provider ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] provider, ARRAY_AGG(key_management ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] key_management, ARRAY_AGG(feature ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] feature, SUM(total_tokens) total_tokens, SUM(reasoning_tokens) reasoning_tokens, SUM(cost_usd) cost_usd, COUNT(*) llm_calls FROM `lightdash-analytics.analytics.ai_token_usage` WHERE event_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY) AND prompt_id IS NOT NULL GROUP BY 1),
base AS (SELECT COALESCE(t.prompt_id,k.prompt_id) prompt_id, COALESCE(t.thread_id,k.thread_id) thread_id, COALESCE(t.organization_id,k.organization_id) organization_id, COALESCE(t.project_id,k.project_id) project_id, COALESCE(t.ai_agent_id,k.ai_agent_id) ai_agent_id, COALESCE(t.user_id,k.user_id) user_id, COALESCE(t.ts,k.ts) ts, t.n_tools, t.n_distinct_tools, t.tool_seq, k.model, k.provider, k.key_management, k.feature, k.total_tokens, k.reasoning_tokens, k.cost_usd, k.llm_calls FROM tools t FULL OUTER JOIN tok k ON t.prompt_id=k.prompt_id),
fb AS (SELECT message_id, MAX(human_score) max_score, MIN(human_score) min_score, ANY_VALUE(feedback_context) feedback_context FROM u WHERE event_family='agent_feedback' GROUP BY 1),
ch AS (SELECT message_id, COUNTIF(event_name LIKE '%chart_created') chart_created, COUNTIF(event_name LIKE '%chart_explored') chart_explored FROM u WHERE event_family='agent_chart_action' GROUP BY 1),
th AS (SELECT thread_id, ANY_VALUE(prompt_context) prompt_context, LOGICAL_OR(has_pinned_context) has_pinned_context, MAX(pinned_context_count) pinned_context_count, COUNT(*) thread_prompts, MIN(event_at) thread_start FROM u WHERE event_name='lightdash_server_ai_agent_prompt_created' GROUP BY 1)
SELECT b.*, fb.max_score, fb.min_score, fb.feedback_context, ch.chart_created, ch.chart_explored, th.prompt_context, th.has_pinned_context, th.pinned_context_count, th.thread_prompts, th.thread_start,
       ROW_NUMBER() OVER (PARTITION BY b.thread_id ORDER BY b.ts) prompt_index, COUNT(*) OVER (PARTITION BY b.thread_id) prompts_in_thread_observed, LEAD(b.ts) OVER (PARTITION BY b.thread_id ORDER BY b.ts) next_prompt_ts
FROM base b LEFT JOIN fb ON fb.message_id=b.prompt_id LEFT JOIN ch ON ch.message_id=b.prompt_id LEFT JOIN th ON th.thread_id=b.thread_id;

-- projects.csv
WITH pc AS (SELECT project_id, models_count, metrics_count, formatted_fields_count, urls_count, dbt_source_count, models_with_errors_count, models_with_group_label_count, additional_dimensions_count, warehouse_type, project_type, timestamp, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY timestamp DESC) rn FROM `lightdash-raw-events.lightdash_deployments_prod.lightdash_server_project_compiled` WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 181 DAY))
SELECT pc.project_id, p.organization_id, models_count, metrics_count, formatted_fields_count, urls_count, dbt_source_count, models_with_errors_count, models_with_group_label_count, additional_dimensions_count, COALESCE(p.warehouse_type_latest, pc.warehouse_type) warehouse_type, pc.project_type
FROM pc LEFT JOIN `lightdash-analytics.analytics.projects` p ON p.project_id = pc.project_id WHERE rn=1;

-- agents.csv
SELECT ai_agent_id, ANY_VALUE(organization_id) organization_id, ANY_VALUE(project_id) project_id,
       ARRAY_AGG(tags_count IGNORE NULLS ORDER BY event_at DESC LIMIT 1)[SAFE_OFFSET(0)] tags_count,
       ARRAY_AGG(integrations_count IGNORE NULLS ORDER BY event_at DESC LIMIT 1)[SAFE_OFFSET(0)] integrations_count,
       COUNTIF(event_family='agent_memory' AND event_name LIKE '%memory_generated') memory_generated,
       COUNTIF(event_name LIKE '%memory_cited') memory_cited,
       MIN(IF(event_name='lightdash_server_ai_agent_created', event_at, NULL)) created_at
FROM `lightdash-analytics.analytics.ai_agent_usage` WHERE event_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY) AND ai_agent_id IS NOT NULL GROUP BY 1;

-- orgs.csv
SELECT organization_id, organization_type, is_paying, tier, users_num, is_shared_cloud_org, days_since_organization_created, query_executed_num_total, saved_charts_created_num_total
FROM `lightdash-analytics.analytics.organizations`;
