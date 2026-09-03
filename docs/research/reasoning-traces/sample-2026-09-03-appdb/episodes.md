# Analysis episodes · 50 of 1708 · gap 20 min · Lightdash internal organisation, 30 days to 2026-09-03, application database

User ids are a 10-character hash. Customer and prospect names in prompts and titles are replaced by [customer]. Filter values are not extracted, only fields and operators.

## Episode 1 · ebf5bfc5ab · 2026-08-05 19:43Z · 6 min · 20 steps · exploration, no save

- `19:43:59` metricsExplorer · linear_customer_requests — starts: metrics linear_customer_requests_important_requests | by linear_customer_requests_created_at_month | where linear_customer_requests_created_at_day inBetween; linear_customer_requests_created_at_day inBetween (2 queries; 2 rows)
- `19:43:59` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `19:44:17` asks agent: “any events on homepage-related stuff?”
- `19:44:57` ai · pages — +metric pages_total_page_views, pages_unique_visitors; -metric organizations_daily_total_queries_executed; +dimension pages_page_path; -dimension organizations_daily_date_month; +filter pages_page_path include; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort pages_total_page_views desc (11 rows)
- `19:46:06` exploreView · events — +metric events_total_events; -metric pages_total_page_views, pages_unique_visitors; -dimension pages_page_path; +filter events_event_name include, events_event_at inThePast; -filter pages_page_path include (ERROR Bigquery warehouse error: bytesBilledLimitExceeded - Query exceeded limit for by)
- `19:46:06` exploreView · events — sort events_total_events desc (ERROR Bigquery warehouse error: bytesBilledLimitExceeded - Query exceeded limit for by)
- `19:46:10` exploreView · events — +metric events_total_events_fast (ERROR Bigquery warehouse error: bytesBilledLimitExceeded - Query exceeded limit for by)
- `19:46:11` exploreView · events — -metric events_total_events (ERROR Bigquery warehouse error: bytesBilledLimitExceeded - Query exceeded limit for by)
- `19:46:14` exploreView · events — re-run, same shape (1 rows)
- `19:46:14` exploreView · events — re-run, same shape (1 rows)
- `19:46:14` exploreView · events — re-run, same shape (1 rows)
- `19:46:14` exploreView · events — re-run, same shape (ERROR Bigquery warehouse error: bytesBilledLimitExceeded - Query exceeded limit for by)
- `19:46:15` exploreView · events — re-run, same shape (1 rows)
- `19:46:15` exploreView · events — re-run, same shape (1 rows)
- `19:46:15` exploreView · events — re-run, same shape (1 rows)
- `19:46:39` exploreView · events — +dimension organizations_organization_name (22 rows)
- `19:48:16` asks agent: “this is what i meant sorry, <https://analytics.lightdash.cloud/projects/352eeb91-6881-43a1-aa8b-0c69328ab0f6/tables/events?create_saved_chart_version=%7B%22tableName%22%3A%22events%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22events%22%2C%22dimensions%22%3A%5B%22organizations_organization_name%22%5D%2C%22metrics%22%3A%5B%22events_total_events_fast%22%5D%2C%22filters%22%3A%7B%22dimensions%22%”
- `19:48:31` ai · events — sort events_total_events_fast desc (22 rows)
- `19:49:25` asks agent: “wow ok who and when”
- `19:49:39` ai · events — -metric events_total_events_fast; +dimension events_event_at, users_full_name, users_email; sort events_event_at desc (25 rows)

## Episode 2 · ebf5bfc5ab · 2026-08-06 08:30Z · 0 min · 2 steps · exploration, no save

- `08:30:25` exploreView · events — starts: metrics events_total_events_fast | by organizations_organization_name | where events_event_name include; events_event_at inThePast (27 rows)
- `08:30:25` exploreView · events — sort events_total_events_fast desc (27 rows)

## Episode 3 · ebf5bfc5ab · 2026-08-06 09:54Z · 11 min · 25 steps · exploration, no save

- `09:54:21` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `09:54:21` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `09:54:47` exploreView · organizations — -metric linear_customer_requests_important_requests; +dimension organizations_organization_created_at_day; -dimension linear_customer_requests_created_at_month; +filter organizations_organization_name include; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween (7 rows)
- `09:54:47` exploreView · organizations — sort organizations_organization_created_at_day desc (7 rows)
- `09:54:49` exploreView · organizations — +dimension organizations_organization_type (7 rows)
- `09:54:58` exploreView · organizations — re-run, same shape (7 rows)
- `09:55:06` exploreView · organizations — +dimension custom_roles_creation_type (7 rows)
- `09:55:19` exploreView · organizations — +dimension organizations_organization_id; -dimension custom_roles_creation_type (7 rows)
- `09:55:53` asks agent: “#

Organizations Organization created at day

Organizations Organization type

Organizations Organization id

12026-08-05∅469aedf3-8d66-4954-8ed1-6a61c3ba50f922026-07-13∅28b32d2c-db16-4252-aa47-97db3b0aa90532026-07-02self-hosted81fcffdf-6692-4959-970e-959907808c0942026-05-29∅7c68107c-1b3f-474e-af16-ae4761eac09a52026-04-10∅c5f9d9e1-fd1c-481c-9b58-e99d0611628362026-04-07∅d0b3aee1-5b19-4c74-83a7-c23f”
- `09:56:40` ai · organizations_daily — +metric organizations_daily_total_active_user_days; +dimension organizations_organization_name; -dimension organizations_organization_created_at_day, organizations_organization_type; +filter organizations_organization_id equals, organizations_daily_date inThePast; -filter organizations_organization_name include; sort organizations_daily_total_active_user_days desc (5 rows)
- `09:56:43` ai · organizations_daily — re-run, same shape (5 rows)
- `09:57:54` asks agent: “how can I figure out if it's a cloud vs self hosted account ?”
- `09:58:12` ai · organizations_daily — -metric organizations_daily_total_active_user_days; +dimension organizations_app_mode, organizations_organization_type (5 rows)
- `09:58:16` ai · organizations_daily — re-run, same shape (5 rows)
- `09:59:38` ai · organizations_daily — re-run, same shape (5 rows)
- `10:00:19` asks agent: “ok so wth can I do? I'm certain there's a data gap but can you help me?”
- `10:00:42` ai · organizations — +dimension organizations_organization_created_at_day, organizations_last_active_at_day, organizations_is_7d_active_organization_latest, organizations_users_num, organizations_is_paying, organizations_mrr; -filter organizations_daily_date inThePast (6 rows)
- `10:00:47` ai · organizations — re-run, same shape (6 rows)
- `10:01:20` ai · organizations — -dimension organizations_users_num, organizations_is_paying, organizations_mrr (1 rows)
- `10:02:36` asks agent: “where does app mode come from and what distinct values does it have?”
- `10:04:24` asks agent: “awesome, so whats your hunch on [customer]?”
- `10:04:41` ai · sales_accounts — +dimension sales_accounts_company_name, sales_accounts_lifecycle_status, sales_accounts_is_paying, sales_accounts_mrr, sales_accounts_estimated_mrr, sales_accounts_tier, sales_accounts_deployment_type, sales_accounts_users_count, sales_accounts_owner_name, sales_accounts_source_category, sales_accounts_created_at_day, sales_accounts_warehouse; -dimension organizations_organization_name, organizations_organization_id, organizations_app_mode, organizations_organization_type, organizations_organization_created_at_day, organizations_last_active_at_day, organizations_is_7d_active_organization_latest; +filter sales_accounts_company_name equals; -filter organizations_organization_id equals (1 rows)
- `10:04:44` ai · sales_accounts — re-run, same shape (1 rows)
- `10:04:59` ai · sales_accounts — +dimension sales_accounts_is_lost_deal, sales_accounts_lost_date_day, sales_accounts_lost_reasons, sales_accounts_lost_notes, sales_accounts_has_won_deal, sales_accounts_is_won_account, sales_accounts_last_meeting_at, sales_accounts_next_meeting_at, sales_accounts_lead_source; -dimension sales_accounts_lifecycle_status, sales_accounts_is_paying, sales_accounts_mrr, sales_accounts_estimated_mrr, sales_accounts_tier, sales_accounts_deployment_type, sales_accounts_users_count, sales_accounts_owner_name, sales_accounts_source_category, sales_accounts_created_at_day, sales_accounts_warehouse (1 rows)
- `10:05:39` ai · sales_accounts — re-run, same shape (1 rows)

## Episode 4 · f6344dd890 · 2026-08-06 15:08Z · 15 min · 6 steps · exploration, no save

- `15:08:38` exploreView · organizations — starts: metrics organizations_organization_id_count_distinct_of_organization_id, organization_id_count_distinct_of_organization_id | by organizations_organization_type (3 rows)
- `15:12:30` mcp.run_sql · sql_query_explorer — runs SQL (11 rows)
- `15:16:21` mcp.run_sql · sql_query_explorer — runs SQL (2 rows)
- `15:17:23` exploreView · chart_usage — starts: by organizations_app_mode (3 rows)
- `15:18:35` mcp.run_sql · sql_query_explorer — runs SQL (15 rows)
- `15:23:50` mcp.run_sql · sql_query_explorer — runs SQL (2 rows)

## Episode 5 · 14f763816f · 2026-08-06 15:12Z · 5 min · 2 steps · exploration, no save

- `15:12:21` exploreView · organizations — starts: metrics organizations_organization_id_count_distinct_of_organization_id, organization_id_count_distinct_of_organization_id | by organizations_organization_type (3 rows)
- `15:17:01` exploreView · dashboard_usage — -metric organizations_organization_id_count_distinct_of_organization_id, organization_id_count_distinct_of_organization_id; +dimension organizations_app_mode; -dimension organizations_organization_type (4 rows)

## Episode 6 · 14f763816f · 2026-08-06 20:16Z · 7 min · 18 steps · exploration, no save

- `20:16:06` asks agent: “compare to paying customer”
- `20:16:49` ai · organizations_daily — starts: metrics organizations_daily_count_unique_paying_organizations, organizations_daily_total_queries_executed, organizations_daily_total_active_user_days, organizations_daily_total_charts_created, organizations_daily_total_dashboards_created | where organizations_daily_date inThePast; organizations_is_paying equals (1 rows)
- `20:16:49` ai · organizations_daily — -metric organizations_daily_count_unique_paying_organizations; +dimension organizations_daily_organization_name; sort organizations_daily_total_queries_executed desc (156 rows)
- `20:18:45` metricsExplorer · organizations_daily — -metric organizations_daily_total_active_user_days, organizations_daily_total_charts_created, organizations_daily_total_dashboards_created; +dimension organizations_daily_date_month; -dimension organizations_daily_organization_name; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter organizations_daily_date inThePast, organizations_is_paying equals; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `20:18:45` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `20:19:10` asks agent: “tell me about [customer]'s usage overall. dont share private info about other customers”
- `20:20:07` ai · organizations_daily — -metric linear_customer_requests_important_requests; +dimension organizations_daily_organization_name, organizations_daily_date; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_organization_name equals; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date desc (10 rows)
- `20:20:12` ai · organizations_daily — re-run, same shape (10 rows)
- `20:20:20` ai · organizations_daily — +dimension organizations_daily_organization_id, organizations_daily_organization_created_date, organizations_daily_app_mode, organizations_daily_is_churned_latest; -dimension organizations_daily_date; +filter organizations_daily_date inThePast (3 rows)
- `20:20:35` ai · organizations_daily — +metric organizations_daily_total_queries_executed, organizations_daily_total_active_user_days, organizations_daily_total_dashboards_created, organizations_daily_total_charts_created, organizations_daily_total_projects_created, organizations_daily_total_members_added; -dimension organizations_daily_organization_created_date, organizations_daily_is_churned_latest; sort organizations_daily_total_queries_executed desc (3 rows)
- `20:20:39` exploreView · organizations — -metric organizations_daily_total_queries_executed, organizations_daily_total_active_user_days, organizations_daily_total_dashboards_created, organizations_daily_total_charts_created, organizations_daily_total_projects_created, organizations_daily_total_members_added; +dimension organizations_organization_name; -dimension organizations_daily_organization_name, organizations_daily_organization_id, organizations_daily_app_mode; +filter organizations_organization_name equals; -filter organizations_daily_organization_name equals, organizations_daily_date inThePast; sort organizations_organization_name (2 rows)
- `20:20:45` ai · organizations_daily — +metric organizations_daily_active_organizations_7d; +dimension organizations_daily_organization_name, organizations_daily_is_7d_active_latest, organizations_daily_is_churned_latest, organizations_daily_num_days_since_last_query_executed_latest, organizations_daily_app_version_latest; -dimension organizations_organization_name; +filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -filter organizations_organization_name equals (1 rows)
- `20:20:48` exploreView · organizations — -metric organizations_daily_active_organizations_7d; +dimension organizations_organization_name, organizations_users_num, organizations_query_executed_num_prev_7d, organizations_query_executed_num_total, organizations_saved_charts_created_num_total, organizations_dashboards_created_num_total, organizations_is_7d_active_organization_latest; -dimension organizations_daily_organization_name, organizations_daily_is_7d_active_latest, organizations_daily_is_churned_latest, organizations_daily_num_days_since_last_query_executed_latest, organizations_daily_app_version_latest; +filter organizations_organization_name equals; -filter organizations_daily_organization_id equals, organizations_daily_date inThePast; sort organizations_organization_name (3 rows)
- `20:20:49` ai · organizations_daily — +metric organizations_daily_total_queries_executed; +dimension organizations_daily_date_week; -dimension organizations_organization_name, organizations_users_num, organizations_query_executed_num_prev_7d, organizations_query_executed_num_total, organizations_saved_charts_created_num_total, organizations_dashboards_created_num_total, organizations_is_7d_active_organization_latest; +filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -filter organizations_organization_name equals; sort organizations_daily_date_week (14 rows)
- `20:21:35` exploreView · organizations — -metric organizations_daily_total_queries_executed; +dimension organizations_organization_name, organizations_users_num, organizations_query_executed_num_prev_7d, organizations_query_executed_num_total, organizations_saved_charts_created_num_total, organizations_dashboards_created_num_total, organizations_is_7d_active_organization_latest, organizations_app_version; -dimension organizations_daily_date_week; +filter organizations_organization_name equals; -filter organizations_daily_organization_id equals, organizations_daily_date inThePast; sort organizations_organization_name (3 rows)
- `20:21:53` exploreView · organizations — +dimension organizations_app_mode (3 rows)
- `20:22:40` exploreView · organizations_daily — +dimension organizations_daily_organization_name; -dimension organizations_organization_name, organizations_users_num, organizations_query_executed_num_prev_7d, organizations_query_executed_num_total, organizations_saved_charts_created_num_total, organizations_dashboards_created_num_total, organizations_is_7d_active_organization_latest, organizations_app_version, organizations_app_mode; +filter organizations_daily_date inThePast, organizations_daily_organization_name equals; -filter organizations_organization_name equals; sort organizations_daily_organization_name (2 rows)
- `20:23:10` exploreView · organizations_daily — +metric organizations_daily_total_spaces_created, organizations_daily_total_dashboards_created, organizations_daily_total_charts_created, organizations_daily_total_projects_created, organizations_daily_total_members_added, organizations_daily_total_queries_executed, organizations_daily_total_active_user_days, organizations_daily_sum_embedded_chart_views_num, organizations_daily_count_unique_activated_organizations, organizations_daily_count_unique_paying_organizations, organizations_daily_active_organizations_7d, organizations_daily_organizations; +dimension organizations_daily_spaces_created_num, organizations_daily_nested_spaces_created_num (4 rows)

## Episode 7 · a4fd0d4658 · 2026-08-10 11:53Z · 8 min · 6 steps · exploration, no save

- `11:53:45` asks agent: “give me ai_agent_eval.created and ai_agent_eval.run plotted together by month”
- `11:54:24` ai · events — starts: metrics ai_agent_usage_total_events | by ai_agent_usage_event_at_month, events_event_name | where events_event_name equals (2 rows)
- `11:54:44` ai · events — +metric events_total_events; -metric ai_agent_usage_total_events; -dimension ai_agent_usage_event_at_month; sort events_total_events desc (2 rows)
- `11:54:58` ai · events — +dimension events_event_at_month; sort events_event_at_month (24 rows)
- `12:01:32` exploreView · events — re-run, same shape (12 rows)
- `12:01:32` exploreView · events — re-run, same shape (24 rows)

## Episode 8 · a244f079f7 · 2026-08-10 22:48Z · 13 min · 4 steps · exploration, no save

- `22:48:42` metricsExplorer · dbt_orders — starts: metrics dbt_orders_average_of_basket_total | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (12 queries; 2 rows)
- `22:48:42` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total (4 queries; 2 rows)
- `23:01:32` exploreView · dbt_orders — -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_browser, dbt_orders_email; -dimension dbt_orders_order_date_month; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_browser (500 rows)
- `23:01:35` exploreView · dbt_orders — +metric dbt_orders_sum_of_basket_total (500 rows)

## Episode 9 · 41fbf7ad10 · 2026-08-11 08:59Z · 27 min · 51 steps · exploration, no save

- `08:59:48` metricsExplorer · dbt_orders — starts: metrics dbt_orders_sum_of_basket_total | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (6 queries; 2 rows)
- `08:59:48` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 2 rows)
- `09:14:36` metricsExplorer · dbt_support_requests — sort dbt_orders_order_date_month (2 queries; 5 rows)
- `09:14:36` metricsExplorer · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; sort dbt_orders_order_date_month desc (6 queries; 2 rows)
- `09:15:03` metricsExplorer · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_orders_average_of_basket_total; sort dbt_orders_order_date_month (6 queries; 13 rows)
- `09:15:03` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total; sort dbt_orders_order_date_month desc (2 queries; 2 rows)
- `09:15:21` views dashboard “🧭 KPI dashboard”
- `09:15:21` views chart “How many users were created each month? | How is the average order amount ($) trending each week?? | Monthly Product Count by Partner - Last 12 Months | What is our total profit?” (+16 more)
- `09:15:22` dashboardView · dbt_orders — +metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_week; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_week (21 queries; 14 rows)
- `09:16:05` views dashboard “🧭 KPI dashboard”
- `09:16:07` views chart “What is our average order value? | What is our monthly revenue? | How many users were created each month? | How is the average order amount ($) trending each week??” (+12 more)
- `09:16:36` asks agent: “Why are down 1% MoM”
- `09:16:49` ai · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; +dimension dbt_orders_order_date_month; -dimension dbt_orders_order_date_week; -filter dbt_orders_order_date_day inThePast; sort dbt_orders_order_date_month desc (25 rows)
- `09:17:24` ai · dbt_orders — +metric dbt_orders_count_distinct_order_id, dbt_orders_sum_of_basket_total; +dimension dbt_orders_browser; +filter dbt_orders_order_date_day inThePast (24 rows)
- `09:17:41` ai · dbt_orders — -dimension dbt_orders_browser; -filter dbt_orders_order_date_day inThePast (6 rows)
- `09:18:06` ai · dbt_orders — +dimension dbt_orders_browser; +filter dbt_orders_order_date_month equals; -filter dbt_orders_browser equals (14 rows)
- `09:18:08` asks agent: “What was our worst month in revenue this last year”
- `09:18:09` ai · dbt_orders — +dimension dbt_orders_referrer; -dimension dbt_orders_browser (12 rows)
- `09:18:17` ai · dbt_orders — -metric dbt_orders_average_of_basket_total, dbt_orders_count_distinct_order_id; -dimension dbt_orders_referrer; +filter dbt_orders_order_date_month inThePast; -filter dbt_orders_order_date_month equals; sort dbt_orders_sum_of_basket_total (5 rows)
- `09:18:19` ai · dbt_orders — re-run, same shape (5 rows)
- `09:18:27` ai · dbt_orders — sort dbt_orders_order_date_month (12 rows)
- `09:18:46` ai · dbt_orders — +metric dbt_orders_average_of_basket_total, dbt_orders_count_distinct_order_id; +dimension dbt_orders_referrer; +filter dbt_orders_order_date_month equals; -filter dbt_orders_order_date_month inThePast; sort dbt_orders_order_date_month desc (12 rows)
- `09:18:46` views dashboard “🧭 KPI dashboard”
- `09:19:18` ai · dbt_orders — re-run, same shape (12 rows)
- `09:19:20` views dashboard “🧭 KPI dashboard”
- `09:20:00` ai · dbt_orders — -metric dbt_orders_average_of_basket_total, dbt_orders_count_distinct_order_id; -dimension dbt_orders_referrer; +filter dbt_orders_order_date_month inThePast; -filter dbt_orders_order_date_month equals; sort dbt_orders_order_date_month (12 rows)
- `09:20:17` exploreView · dbt_orders — re-run, same shape (12 rows)
- `09:20:50` metricsExplorer · dbt_orders — +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; -filter dbt_orders_order_date_month inThePast; sort dbt_orders_order_date_month desc (6 queries; 2 rows)
- `09:20:50` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 2 rows)
- `09:21:16` views dashboard “🧭 KPI dashboard”
- `09:21:16` views chart “What is our average order value? | Monthly Product Count by Partner - Last 12 Months | How many users were created each month? | Weekly orders over the last 3 months” (+12 more)
- `09:21:17` dashboardView · dbt_orders — +metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_week; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_week (13 queries; 14 rows)
- `09:22:48` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; +dimension dbt_orders_order_date_month; -dimension dbt_orders_order_date_week; +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; -filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals; sort dbt_orders_order_date_month desc (2 queries; 2 rows)
- `09:22:48` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_support_requests_count_distinct_request_id; sort dbt_orders_order_date_month (6 queries; 13 rows)
- `09:23:02` chartView · dbt_support_requests — +metric dbt_support_requests_count_of_request_id; -metric dbt_orders_count_distinct_order_id; +dimension dbt_support_requests_reason, dbt_support_requests_request_date_week; -dimension dbt_orders_order_date_month; -filter dbt_orders_order_date_day inBetween; sort dbt_support_requests_request_date_week desc, dbt_support_requests_reason (99 rows)
- `09:23:02` views chart “What support request reasons are the most common by percentage?”
- `09:23:33` metricsExplorer · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_support_requests_count_of_request_id; +dimension dbt_orders_order_date_month; -dimension dbt_support_requests_reason, dbt_support_requests_request_date_week; +filter dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_month (6 queries; 13 rows)
- `09:23:33` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total; sort dbt_orders_order_date_month desc (2 queries; 2 rows)
- `09:24:55` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries; 2 rows)
- `09:24:55` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_support_requests_count_distinct_request_id (6 queries; 2 rows)
- `09:24:56` views dashboard “🧭 KPI dashboard”
- `09:24:57` views chart “What is our total profit? | Partner metrics overview | Revenue by Partner | What is our average order value?” (+12 more)
- `09:24:57` dashboardView · dbt_orders — +metric dbt_orders_count_distinct_user_id; +filter dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; +custom field average_orders_per_user (13 queries; 25 rows)
- `09:25:10` exploreView · dbt_orders — +metric dbt_orders_sum_of_profit; -metric dbt_orders_count_distinct_user_id, dbt_orders_count_distinct_order_id; +filter dbt_orders_basket_total greaterThan; -filter dbt_orders_browser equals; -custom field average_orders_per_user (25 rows)
- `09:25:24` metricsExplorer · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_orders_sum_of_profit; +filter dbt_orders_order_date_day inBetween; -filter dbt_orders_basket_total greaterThan; sort dbt_orders_order_date_month (6 queries; 13 rows)
- `09:25:24` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 5 rows)
- `09:26:09` metricsExplorer · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_support_requests_count_distinct_request_id (12 queries; 13 rows)
- `09:26:09` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total (4 queries; 5 rows)
- `09:26:44` ai · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; +filter dbt_orders_order_date_month inThePast; -filter dbt_orders_order_date_day inBetween (12 rows)
- `09:27:11` metricsExplorer · dbt_orders — +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; -filter dbt_orders_order_date_month inThePast; sort dbt_orders_order_date_month desc (6 queries; 2 rows)
- `09:27:12` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 2 rows)

## Episode 10 · 5452ad558d · 2026-08-11 10:12Z · 30 min · 61 steps · exploration→save

- `10:12:57` exploreView · deals — starts: by deals_stage (8 rows)
- `10:12:57` exploreView · deals — sort deals_stage (8 rows)
- `10:13:01` exploreView · deals — +metric deals_unique_deals (8 rows)
- `10:13:04` exploreView · deals — +metric deals_won_deals (8 rows)
- `10:13:07` exploreView · deals — +dimension deals_plan (14 rows)
- `10:13:10` exploreView · deals — +dimension deals_created_date_month (261 rows)
- `10:13:20` exploreView · deals — re-run, same shape (261 rows)
- `10:13:20` exploreView · deals — re-run, same shape (261 rows)
- `10:13:20` exploreView · deals — re-run, same shape (148 rows)
- `10:13:51` exploreView · deals — re-run, same shape (261 rows)
- `10:13:54` exploreView · deals — re-run, same shape (14 rows)
- `10:13:54` exploreView · deals — re-run, same shape (261 rows)
- `10:13:54` exploreView · deals — re-run, same shape (261 rows)
- `10:27:42` exploreView · deals — +metric deals_selected_kpi; -metric deals_unique_deals, deals_won_deals; -dimension deals_stage, deals_plan, deals_created_date_month (1 rows)
- `10:27:42` exploreView · deals — sort deals_selected_kpi desc (1 rows)
- `10:27:42` exploreView · deals — re-run, same shape (1 rows)
- `10:27:54` exploreView · deals — +dimension deals_created_date_month (26 rows)
- `10:28:11` creates chart “How does the Selected KPI trend across months?” (cartesian, deals)
- `10:28:12` chartView · deals — re-run, same shape (26 rows)
- `10:28:12` chartView · deals — re-run, same shape (26 rows)
- `10:28:12` views chart “How does the Selected KPI trend across months?”
- `10:29:52` asks agent: “what param options do i have for selected KPI?”
- `10:29:59` views chart “How does the Selected KPI trend across months?”
- `10:30:45` asks agent: “can we select deal count”
- `10:30:54` ai · deals — sort deals_created_date_month (26 rows)
- `10:31:17` ai · deals — +metric deals_unique_deals; -metric deals_selected_kpi (26 rows)
- `10:31:19` ai · deals — re-run, same shape (26 rows)
- `10:32:43` exploreView · deals — +metric deals_selected_kpi; -metric deals_unique_deals; sort deals_selected_kpi desc (26 rows)
- `10:33:37` ai · deals — +metric deals_unique_deals; -metric deals_selected_kpi; sort deals_created_date_month (26 rows)
- `10:34:07` exploreView · deals — re-run, same shape (26 rows)
- `10:34:37` chartView · deals — +metric deals_selected_kpi; -metric deals_unique_deals; sort deals_selected_kpi desc (26 rows)
- `10:34:37` views chart “How does the Selected KPI trend across months?”
- `10:34:38` chartView · deals — re-run, same shape (26 rows)
- `10:35:36` asks agent: “what values can I select from KPI metric param”
- `10:36:21` asks agent: “modify this chart so that deal count is selectred”
- `10:36:34` views chart “How does the Selected KPI trend across months?”
- `10:36:48` updates chart “How does the Selected KPI trend across months?” (cartesian, deals)
- `10:36:51` ai · deals — re-run, same shape (20 rows)
- `10:37:02` chartView · deals — re-run, same shape (26 rows)
- `10:37:02` chartView · deals — re-run, same shape (26 rows)
- `10:37:02` views chart “How does the Selected KPI trend across months?”
- `10:37:12` chartView · deals — re-run, same shape (26 rows)
- `10:37:38` exploreView · deals — re-run, same shape (26 rows)
- `10:39:35` exploreView · deals — re-run, same shape (26 rows)
- `10:39:41` exploreView · deals — -metric deals_selected_kpi (26 rows)
- `10:39:43` exploreView · deals — +metric deals_selected_kpi (26 rows)
- `10:39:43` exploreView · deals — re-run, same shape (26 rows)
- `10:39:47` updates chart “How does the Selected KPI trend across months?” (cartesian, deals)
- `10:39:47` chartView · deals — re-run, same shape (26 rows)
- `10:39:47` views chart “How does the Selected KPI trend across months?”
- `10:40:43` asks agent: “what values does the KPI metric have”
- `10:41:40` asks agent: “update this chart so that the selected parameter value is deal_count”
- `10:41:49` views chart “How does the Selected KPI trend across months?”
- `10:41:58` updates chart “How does the Selected KPI trend across months?” (cartesian, deals)
- `10:42:01` ai · deals — re-run, same shape (26 rows)
- `10:42:54` chartView · deals — re-run, same shape (26 rows)
- `10:42:54` views chart “How does the Selected KPI trend across months?”
- `10:42:55` chartView · deals — re-run, same shape (26 rows)
- `10:43:00` views chart “How does the Selected KPI trend across months?”
- `10:43:01` chartView · deals — re-run, same shape (26 rows)
- `10:43:01` chartView · deals — re-run, same shape (26 rows)

## Episode 11 · 5452ad558d · 2026-08-11 13:09Z · 16 min · 33 steps · exploration, no save

- `13:09:25` metricsExplorer · dbt_orders — starts: metrics dbt_orders_sum_of_basket_total | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (6 queries; 2 rows)
- `13:09:25` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 2 rows)
- `13:11:04` metricsExplorer · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_support_requests_count_distinct_request_id (6 queries; 2 rows)
- `13:11:04` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 2 rows)
- `13:12:17` exploreView · dbt_orders — -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_year; -dimension dbt_orders_order_date_month; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween (3 rows)
- `13:12:17` exploreView · dbt_orders — sort dbt_orders_order_date_year desc (3 rows)
- `13:12:20` exploreView · dbt_orders — +metric dbt_orders_count_of_order_id (3 rows)
- `13:12:27` exploreView · dbt_orders — +dimension dbt_orders_browser (21 rows)
- `13:13:04` exploreView · dbt_orders — re-run, same shape (21 rows)
- `13:13:04` exploreView · dbt_orders — re-run, same shape (3 rows)
- `13:13:04` exploreView · dbt_orders — re-run, same shape (21 rows)
- `13:14:08` asks agent: “give me order volume by borwser by year”
- `13:14:27` ai · dbt_orders — sort dbt_orders_order_date_year, dbt_orders_count_of_order_id desc (21 rows)
- `13:14:29` ai · dbt_orders — re-run, same shape (3 rows)
- `13:17:13` exploreView · dbt_orders — re-run, same shape (21 rows)
- `13:17:13` exploreView · dbt_orders — re-run, same shape (3 rows)
- `13:18:59` views dashboard “🧭 KPI dashboard”
- `13:18:59` views chart “How is the average order amount ($) trending each week??”
- `13:19:00` views dashboard “🧭 KPI dashboard”
- `13:19:00` views chart “What is our monthly revenue? | Revenue by Partner | Monthly Product Count by Partner - Last 12 Months | How many users were created each month?” (+12 more)
- `13:19:00` dashboardView · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_orders_count_of_order_id; +dimension dbt_orders_partner_name, dbt_orders_referrer; -dimension dbt_orders_browser, dbt_orders_order_date_year; +filter dbt_orders_browser equals; sort dbt_orders_sum_of_basket_total desc (26 queries; 9 rows)
- `13:20:07` views chart “What is our total profit? | How many users were created each month? | Weekly orders over the last 3 months | What is our average order value?” (+12 more)
- `13:20:07` views dashboard “🧭 KPI dashboard”
- `13:20:07` dashboardView · dbt_orders — +metric dbt_orders_sum_of_profit; -metric dbt_orders_sum_of_basket_total; +dimension dbt_orders_order_date_month; -dimension dbt_orders_partner_name, dbt_orders_referrer; +filter dbt_orders_basket_total greaterThan, dbt_orders_order_date_week equals; sort dbt_orders_order_date_month desc (26 queries; 2 rows)
- `13:21:16` views chart “Weekly orders over the last 3 months”
- `13:21:17` chartView · dbt_orders — +metric dbt_orders_count_of_order_id; +dimension dbt_orders_order_date_week; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast; -filter dbt_orders_basket_total greaterThan, dbt_orders_browser equals, dbt_orders_order_date_week equals; sort dbt_orders_order_date_week (14 rows)
- `13:22:11` views dashboard “🧭 KPI dashboard”
- `13:22:12` views chart “What is our average order value? | How many users were created each month? | Weekly orders over the last 3 months | What is our total profit?” (+12 more)
- `13:22:12` dashboardView · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; +dimension dbt_orders_order_date_month; -dimension dbt_orders_order_date_week; +filter dbt_orders_browser equals; -filter dbt_orders_order_date_day inThePast; sort dbt_orders_order_date_month desc (13 queries; 25 rows)
- `13:22:49` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_orders_average_of_basket_total; +filter dbt_orders_order_date_month inBetween; -filter dbt_orders_browser equals (2 queries; 13 rows)
- `13:24:44` views dashboard “🧭 KPI dashboard”
- `13:24:45` views chart “What is our average order value? | Weekly orders over the last 3 months | Partner metrics overview | What is our monthly revenue?” (+12 more)
- `13:25:20` exploreView · dbt_orders — +metric dbt_orders_sum_of_profit; -metric dbt_orders_count_distinct_order_id; +dimension dbt_orders_browser; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals, dbt_orders_order_date_week equals; -filter dbt_orders_order_date_month inBetween; sort dbt_orders_browser (2 rows)

## Episode 12 · 3181a3ed67 · 2026-08-12 21:32Z · 67 min · 114 steps · exploration→save

- `21:32:33` creates chart “What is the minimum call time by month?” (cartesian, activities)
- `21:32:37` views chart “What is the minimum call time by month?”
- `21:37:55` chartView · activities — starts: metrics activities_min_call_time | by activities_activity_timestamp_month, activities_sdr_name (197 rows)
- `21:37:55` views chart “What is the minimum call time by month?”
- `21:46:06` exploreView · deals — +metric deals_unique_deals; -metric activities_min_call_time; +dimension deals_stage; -dimension activities_activity_timestamp_month, activities_sdr_name; sort deals_stage (8 rows)
- `21:48:28` views dashboard “Comparison Dashboard”
- `21:48:28` views chart “How many unique deals were created each month? | Copy of How many unique deals were created each month?” (+1 more)
- `21:48:29` dashboardView · deals — +dimension deals_created_date_month; -dimension deals_stage; +filter deals_created_date_year equals, deals_stage equals; sort deals_unique_deals desc (2 queries; 10 rows)
- `21:50:50` exploreView · leads — +metric leads_unique_lead_count; -metric deals_unique_deals; +dimension leads_lead_status; -dimension deals_created_date_month; -filter deals_created_date_year equals, deals_stage equals; sort leads_lead_status (5 rows)
- `21:51:32` views dashboard “Plumly Sales”
- `21:51:33` creates chart “How many unique leads are in each stage of the sales funnel?” (data_app_viz, leads)
- `21:51:33` chartView · leads — re-run, same shape (5 rows)
- `21:51:33` views chart “How many unique leads are in each stage of the sales funnel? | Closed Won Value | Monthly Won Deals and Cumulative Deal Value | Pipeline Value” (+18 more)
- `21:51:36` dashboardView · deals — +metric deals_unique_deals, deals_total_amount; -metric leads_unique_lead_count; +dimension deals_created_date_month; -dimension leads_lead_status; +filter deals_stage equals, deals_created_date_month inThePast, accounts_industry equals; +custom field cumulative_deal_amount; sort deals_created_date_month (22 queries; 12 rows)
- `21:51:56` saves dashboard “Plumly Sales”
- `21:52:05` views chart “Top 10 Industries by Avg. Won Deal Value | Q3 Revenue YoY | How many unique deals were created each month? | Win Rate Basic Plan” (+17 more)
- `21:52:05` dashboardView · deals — -metric deals_unique_deals; +dimension deals_created_date_year; -dimension deals_created_date_month; -filter deals_stage equals; -custom field cumulative_deal_amount; sort deals_created_date_year desc (24 queries; 2 rows)
- `21:52:15` views dashboard “Plumly Sales”
- `21:52:26` saves dashboard “Plumly Sales”
- `21:52:47` exploreView · leads — +metric leads_unique_lead_count; -metric deals_total_amount; +dimension leads_lead_status; -dimension deals_created_date_year; -filter deals_created_date_month inThePast, accounts_industry equals; sort leads_lead_status (5 rows)
- `21:53:35` views dashboard “Plumly Sales”
- `21:53:36` creates chart “How many unique leads are in each stage of the sales funnel?” (data_app_viz, leads)
- `21:53:36` saves dashboard “Plumly Sales”
- `21:53:36` views chart “How many unique leads are in each stage of the sales funnel? | Monthly Won Deals and Cumulative Deal Value | Closed Won Value | Win Rate” (+4 more)
- `21:53:37` chartView · leads — re-run, same shape (5 rows)
- `21:53:42` dashboardView · deals — +metric deals_total_amount; -metric leads_unique_lead_count; +dimension deals_created_date_month; -dimension leads_lead_status; +filter deals_stage equals, deals_created_date_month inThePast, accounts_industry equals; sort deals_total_amount desc (5 queries; 12 rows)
- `21:54:01` views dashboard “Plumly Sales”
- `21:54:01` views chart “Win Rate Professional | Win Rate Basic Plan | Sales Funnel | Won Revenue by Segment” (+13 more)
- `21:54:09` dashboardView · deals — +metric deals_unique_deals; -metric deals_total_amount; +dimension deals_stage, deals_stage_order; -dimension deals_created_date_month; +filter deals_stage notEquals; -filter deals_stage equals; sort deals_stage_order desc (4 rows)
- `21:54:59` saves dashboard “Plumly Sales”
- `21:55:00` views chart “How many unique leads are in each stage of the sales funnel? | Pipeline Value | Top 10 Industries by Avg. Won Deal Value | Win Rate Basic Plan” (+17 more)
- `21:55:00` views dashboard “Plumly Sales”
- `21:55:00` dashboardView · deals — re-run, same shape (6 queries; 4 rows)
- `21:57:56` views chart “Sales Funnel | How many unique leads are in each stage of the sales funnel?” (+1 more)
- `21:57:59` views dashboard “Plumly Sales”
- `21:58:00` views chart “Top 10 Industries by Avg. Won Deal Value | Win Rate | Monthly Won Deals and Cumulative Deal Value | Win Rate Basic Plan” (+17 more)
- `21:58:30` saves dashboard “Plumly Sales”
- `21:58:30` views dashboard “Plumly Sales”
- `21:58:31` dashboardView · leads — +metric leads_unique_lead_count; -metric deals_unique_deals; +dimension leads_lead_status; -dimension deals_stage, deals_stage_order; -filter deals_stage notEquals, accounts_industry equals; sort leads_lead_status (5 queries; 5 rows)
- `21:58:35` exploreView · leads — -filter deals_created_date_month inThePast (5 rows)
- `21:59:04` views dashboard “Plumly Product Pulse Dashboard”
- `21:59:04` views chart “Top 5 Website Events | % of Users Opting IN/OUT of Marketing Over Time | Avg. Events per User by Segment | Deep Dive - Top Events” (+13 more)
- `21:59:05` dashboardView · tracks — +metric tracks_event_count, tracks_unique_user_count; -metric leads_unique_lead_count; +dimension tracks_name; -dimension leads_lead_status; +filter tracks_timestamp_day inThePast; +custom field events_per_user; sort tracks_event_count desc (14 queries; 5 rows)
- `21:59:10` views dashboard “Plumly Sales”
- `22:01:54` saves dashboard “Plumly Sales”
- `22:02:03` views dashboard “Plumly Sales”
- `22:02:04` views chart “Monthly Won Deals and Cumulative Deal Value | Closed Won Value | Win Rate | Pipeline Value” (+17 more)
- `22:02:04` dashboardView · deals — +metric deals_unique_deals, deals_total_amount; -metric tracks_event_count, tracks_unique_user_count; +dimension deals_created_date_month; -dimension tracks_name; +filter deals_stage equals, deals_created_date_month inThePast, accounts_industry equals; -filter tracks_timestamp_day inThePast; +custom field cumulative_deal_amount; -custom field events_per_user; sort deals_created_date_month (24 queries; 12 rows)
- `22:02:36` saves dashboard “Plumly Sales”
- `22:03:16` saves dashboard “Plumly Sales”
- `22:03:16` views dashboard “Plumly Sales”
- `22:03:17` views chart “Sales Funnel | Pipeline Value | Monthly Won Deals and Cumulative Deal Value | Closed Won Value” (+12 more)
- `22:03:17` dashboardView · deals — +metric deals_win_rate; -metric deals_unique_deals, deals_total_amount; +dimension deals_plan; +filter deals_plan equals; -filter deals_stage equals; -custom field cumulative_deal_amount; sort deals_created_date_month desc (9 queries; 12 rows)
- `22:03:38` exploreView · activities — +metric activities_total_activities; -metric deals_win_rate; +dimension activities_activity_type; -dimension deals_plan, deals_created_date_month; -filter deals_plan equals, deals_created_date_month inThePast, accounts_industry equals; sort activities_activity_type (6 rows)
- `22:04:05` exploreView · activities — +dimension activities_activity_timestamp_day (500 rows)
- `22:05:20` views dashboard “Plumly Sales”
- `22:05:21` creates chart “How do activity volumes trend across different activity types over the past 18 months?” (data_app_viz, activities)
- `22:05:21` saves dashboard “Plumly Sales”
- `22:05:21` chartView · activities — re-run, same shape (500 rows)
- `22:05:21` views chart “How do activity volumes trend across different activity types over the past 18 months? | Closed Won Value | Pipeline Value | Monthly Won Deals and Cumulative Deal Value” (+18 more)
- `22:05:25` dashboardView · activities — re-run, same shape (19 queries; 500 rows)
- `22:06:01` saves dashboard “Plumly Sales”
- `22:06:02` views dashboard “Plumly Sales”
- `22:06:02` views chart “Top 10 Industries by Avg. Won Deal Value | Closed Won Value | Won Revenue by Segment | Win Rate Basic Plan” (+18 more)
- `22:06:03` dashboardView · accounts — +metric deals_won_deals, deals_total_won_amount; -metric activities_total_activities; +dimension accounts_industry, accounts_segment; -dimension activities_activity_type, activities_activity_timestamp_day; +filter accounts_industry equals; sort deals_won_deals desc (5 queries; 6 rows)
- `22:06:20` exploreView · accounts — -metric deals_won_deals; -filter accounts_industry equals; sort deals_total_won_amount desc (3 rows)
- `22:09:50` views chart “Top 10 Industries by Avg. Won Deal Value | Win Rate Professional | Win Rate Basic Plan | Enterprise Win Rate” (+13 more)
- `22:09:51` dashboardView · deals — +metric deals_total_amount; -metric deals_total_won_amount; +dimension deals_created_date_month_name, deals_created_date_year; -dimension accounts_segment, accounts_industry; +filter deals_created_date_month inThePast, accounts_industry equals; sort deals_created_date_year desc (14 queries; 12 rows)
- `22:10:02` views chart “How do activity volumes trend across different activity types over the past 18 months? | Won Deals by Industry | Win Rate by Segment | Won Revenue by Segment” (+4 more)
- `22:13:47` views chart “Closed Won Value | How many unique leads are in each stage of the sales funnel? | Monthly Won Deals and Cumulative Deal Value | Pipeline Value” (+4 more)
- `22:14:10` views dashboard “Plumly Sales”
- `22:14:11` views chart “Q3 Revenue YoY | % of Revenue by Plan Monthly | Enterprise Win Rate | How many unique deals were created each month?” (+18 more)
- `22:14:12` dashboardView · leads — +metric leads_unique_lead_count; -metric deals_total_amount; +dimension leads_lead_status; -dimension deals_created_date_month_name, deals_created_date_year; -filter accounts_industry equals; sort leads_lead_status (15 queries; 5 rows)
- `22:17:51` updates chart “Avg. Deal Size by Segment” (cartesian, accounts)
- `22:17:51` updates chart “Win Rate by Segment” (cartesian, accounts)
- `22:17:51` updates chart “Won Deals by Industry” (cartesian, accounts)
- `22:17:52` updates chart “Won Revenue by Segment” (cartesian, accounts)
- `22:17:58` views dashboard “Plumly Sales”
- `22:17:59` views chart “Win Rate by Segment | Won Deals by Industry | How do activity volumes trend across different activity types over the past 18 months? | Won Revenue by Segment” (+4 more)
- `22:17:59` dashboardView · accounts — +metric deals_won_deals, deals_total_won_amount; -metric leads_unique_lead_count; +dimension accounts_industry, accounts_segment; -dimension leads_lead_status; +filter accounts_industry equals; -filter deals_created_date_month inThePast; sort deals_won_deals desc (5 queries; 6 rows)
- … 34 more steps

## Episode 13 · 2574ef047d · 2026-08-13 10:13Z · 2 min · 8 steps · exploration→save

- `10:13:16` exploreView · linear_customer_requests — starts: metrics linear_customer_requests_total_requests | by linear_customer_requests_created_at_month (12 rows)
- `10:13:16` exploreView · merge — +metric a_linear_customer_requests_total_requests, b_pylon_issues_total_issues, b_pylon_issues_closed_issues; -metric linear_customer_requests_total_requests; +dimension merge_join_key_0; -dimension linear_customer_requests_created_at_month (12 rows)
- `10:14:27` creates chart “How do customer requests compare to total and closed issues over time?” (cartesian, linear_customer_requests)
- `10:14:28` chartView · linear_customer_requests — +metric linear_customer_requests_total_requests; -metric a_linear_customer_requests_total_requests, b_pylon_issues_total_issues, b_pylon_issues_closed_issues; +dimension linear_customer_requests_created_at_month; -dimension merge_join_key_0; sort linear_customer_requests_created_at_month desc (12 rows)
- `10:14:28` exploreView · merge — +metric a_linear_customer_requests_total_requests, b_pylon_issues_total_issues, b_pylon_issues_closed_issues; -metric linear_customer_requests_total_requests; +dimension merge_join_key_0; -dimension linear_customer_requests_created_at_month (12 rows)
- `10:14:28` views chart “How do customer requests compare to total and closed issues over time?”
- `10:15:19` chartView · linear_customer_requests — +metric linear_customer_requests_total_requests; -metric a_linear_customer_requests_total_requests, b_pylon_issues_total_issues, b_pylon_issues_closed_issues; +dimension linear_customer_requests_created_at_month; -dimension merge_join_key_0; sort linear_customer_requests_created_at_month desc (12 rows)
- `10:15:19` views chart “How do customer requests compare to total and closed issues over time?”

## Episode 14 · 5452ad558d · 2026-08-13 13:19Z · 6 min · 30 steps · exploration→save

- `13:19:03` exploreView · deals — starts: metrics deals_selected_kpi (1 rows)
- `13:19:03` exploreView · deals — sort deals_selected_kpi desc (1 rows)
- `13:19:03` exploreView · deals — re-run, same shape (1 rows)
- `13:19:05` exploreView · deals — +dimension deals_stage (8 rows)
- `13:19:11` exploreView · deals — re-run, same shape (8 rows)
- `13:19:46` saves dashboard “Test params embed”
- `13:19:47` creates chart “What is the Selected KPI value across each deal stage?” (cartesian, deals)
- `13:19:47` saves dashboard “Test params embed”
- `13:19:47` chartView · deals — re-run, same shape (8 rows)
- `13:19:47` views chart “What is the Selected KPI value across each deal stage?”
- `13:19:48` chartView · deals — re-run, same shape (8 rows)
- `13:19:49` views dashboard “Test params embed”
- `13:19:50` dashboardView · deals — re-run, same shape (8 rows)
- `13:20:06` exploreView · deals — +metric deals_unique_deals; -metric deals_selected_kpi; -dimension deals_stage (1 rows)
- `13:20:06` exploreView · deals — sort deals_unique_deals desc (1 rows)
- `13:20:19` creates chart “How many unique deals are in the pipeline?” (big_number, deals)
- `13:20:19` views chart “What is the Selected KPI value across each deal stage? | How many unique deals are in the pipeline?” (+1 more)
- `13:20:20` dashboardView · deals — re-run, same shape (3 queries; 1 rows)
- `13:20:24` saves dashboard “Test params embed”
- `13:20:24` views dashboard “Test params embed”
- `13:21:59` views dashboard “Test params embed”
- `13:21:59` views chart “What is the Selected KPI value across each deal stage?”
- `13:21:59` dashboardView · deals — +metric deals_selected_kpi; -metric deals_unique_deals; +dimension deals_stage; sort deals_selected_kpi desc (8 rows)
- `13:22:03` views chart “How many unique deals are in the pipeline? | What is the Selected KPI value across each deal stage?” (+1 more)
- `13:22:03` dashboardView · deals — +metric deals_unique_deals; -metric deals_selected_kpi; -dimension deals_stage; sort deals_unique_deals desc (2 queries; 1 rows)
- `13:23:47` views dashboard “Test params embed”
- `13:23:47` views chart “What is the Selected KPI value across each deal stage?”
- `13:24:14` views chart “How many unique deals are in the pipeline? | What is the Selected KPI value across each deal stage?” (+1 more)
- `13:24:50` views dashboard “Test params embed”
- `13:25:31` views chart “What is the Selected KPI value across each deal stage? | How many unique deals are in the pipeline?” (+1 more)

## Episode 15 · 14f763816f · 2026-08-14 09:34Z · 55 min · 27 steps · exploration, no save

- `09:34:14` metricsExplorer · dbt_orders — starts: metrics dbt_orders_average_of_basket_total | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (6 queries; 2 rows)
- `09:34:14` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total (2 queries; 2 rows)
- `09:40:47` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_support_requests_count_distinct_request_id (6 queries; 2 rows)
- `09:40:47` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_distinct_order_id; sort dbt_orders_order_date_month (2 queries; 5 rows)
- `09:40:51` views dashboard “🧭 KPI dashboard”
- `09:40:51` views chart “Partner metrics overview | How is the average order amount ($) trending each week?? | What are the sales stats per partner, per month? | Monthly Product Count by Partner - Last 12 Months” (+12 more)
- `09:40:53` dashboardView · dbt_orders — +metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_week; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_week (13 queries; 14 rows)
- `09:41:23` views dashboard “🧭 KPI dashboard”
- `09:50:36` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `09:50:46` sqlRunner · sql_query_explorer — runs SQL (366 rows)
- `09:59:19` ai · dbt_orders — starts: metrics dbt_orders_count_distinct_order_id | by dbt_orders_order_date_month (4 rows)
- `09:59:19` ai · dbt_orders — +metric dbt_orders_average_of_basket_total; +dimension dbt_orders_order_date_day, dbt_orders_browser; -dimension dbt_orders_order_date_month; +filter dbt_orders_browser equals, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_day (22 rows)
- `09:59:19` ai · dbt_orders — +dimension dbt_orders_order_date_month, dbt_orders_referrer; -dimension dbt_orders_order_date_day, dbt_orders_browser; +filter dbt_orders_order_date_month equals; -filter dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_month desc (12 rows)
- `09:59:19` ai · dbt_orders — +metric dbt_orders_sum_of_basket_total; +dimension dbt_orders_browser; -dimension dbt_orders_referrer; +filter dbt_orders_order_date_month inThePast; -filter dbt_orders_order_date_month equals (6 rows)
- `09:59:19` ai · dbt_orders — -metric dbt_orders_sum_of_basket_total; -filter dbt_orders_browser equals (20 rows)
- `10:04:53` metricsExplorer · dbt_orders — -metric dbt_orders_count_distinct_order_id; -dimension dbt_orders_browser; +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; -filter dbt_orders_order_date_month inThePast (6 queries; 2 rows)
- `10:04:53` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total (2 queries; 2 rows)
- `10:19:34` metricsExplorer · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; sort dbt_orders_order_date_month (6 queries; 13 rows)
- `10:19:34` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total; sort dbt_orders_order_date_month desc (2 queries; 2 rows)
- `10:25:30` views dashboard “🧭 KPI dashboard”
- `10:25:33` views chart “What is our total profit? | What are the sales stats per partner, per month? | What is our average order value? | Revenue by Partner” (+12 more)
- `10:25:34` dashboardView · dbt_orders — +metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_week; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_week (13 queries; 14 rows)
- `10:29:17` metricsExplorer · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; +dimension dbt_orders_order_date_month; -dimension dbt_orders_order_date_week; +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; -filter dbt_orders_order_date_day inThePast, dbt_orders_browser equals; sort dbt_orders_order_date_month desc (6 queries; 2 rows)
- `10:29:17` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total (2 queries; 2 rows)
- `10:29:19` views dashboard “🧭 KPI dashboard”
- `10:29:20` views chart “What is our average order value? | Weekly orders over the last 3 months | How many users were created each month? | What are the sales stats per partner, per month?” (+12 more)
- `10:29:31` dashboardView · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_partner_name, dbt_orders_referrer; -dimension dbt_orders_order_date_month; +filter dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_sum_of_basket_total desc (14 queries; 9 rows)

## Episode 16 · f6344dd890 · 2026-08-14 10:32Z · 5 min · 7 steps · exploration, no save

- `10:32:38` metricsExplorer · linear_customer_requests — starts: metrics linear_customer_requests_important_requests | by linear_customer_requests_created_at_month | where linear_customer_requests_created_at_day inBetween; linear_customer_requests_created_at_day inBetween (2 queries; 2 rows)
- `10:32:38` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `10:33:01` exploreView · users — -metric organizations_daily_total_queries_executed; +dimension users_created_at_month; -dimension organizations_daily_date_month; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween (62 rows)
- `10:33:01` exploreView · users — sort users_created_at_month desc (62 rows)
- `10:33:08` exploreView · users — +metric users_count_active_users (62 rows)
- `10:33:56` exploreView · users — +dimension users_full_name (500 rows)
- `10:37:28` exploreView · merge — +metric a_users_count_active_users, b_charts_count_charts; -metric users_count_active_users; +dimension merge_join_key_0; -dimension users_created_at_month, users_full_name (62 rows)

## Episode 17 · e2d90289f5 · 2026-08-17 09:33Z · 18 min · 7 steps · exploration, no save

- `09:33:14` views chart “wobbley-wobble”
- `09:33:16` chartView · pylon_issues — starts: metrics pylon_issues_total_issues | by pylon_issues_created_at_month, pylon_issues_issue_category (90 rows)
- `09:34:18` viewUnderlyingData · pylon_issues — -metric pylon_issues_total_issues; +dimension pylon_issues_mrr, pylon_issues_link, pylon_issues_title, pylon_issues_number, pylon_issues_source, pylon_issues_created_at, pylon_issues_issue_state, pylon_issues_account_name, pylon_issues_assignee_name, pylon_issues_requester_name, pylon_issues_deployment_type, pylon_issues_resolution_time, pylon_issues_product_category, pylon_issues_number_of_touches, pylon_issues_first_response_time, pylon_issues_customer_tier_grouped, pylon_issues_created_in_business_hours, pylon_issues_total_hours_to_resolution, pylon_issues_business_hours_open_status, pylon_issues_business_hours_to_resolution, pylon_issues_total_mins_to_first_response, pylon_issues_business_hours_on_hold_status, pylon_issues_total_hours_to_first_response, pylon_issues_business_hours_in_progress_status, pylon_issues_business_hours_waiting_on_action_status, organizations_organization_name; -dimension pylon_issues_created_at_month; +filter pylon_issues_created_at_month equals, pylon_issues_issue_category equals (132 rows)
- `09:35:12` views chart “wobbley-wobble”
- `09:35:14` chartView · pylon_issues — re-run, same shape (90 rows)
- `09:37:27` viewUnderlyingData · pylon_issues — -metric pylon_issues_total_issues; +dimension pylon_issues_mrr, pylon_issues_link, pylon_issues_title, pylon_issues_number, pylon_issues_source, pylon_issues_created_at, pylon_issues_issue_state, pylon_issues_account_name, pylon_issues_assignee_name, pylon_issues_requester_name, pylon_issues_deployment_type, pylon_issues_resolution_time, pylon_issues_product_category, pylon_issues_number_of_touches, pylon_issues_first_response_time, pylon_issues_customer_tier_grouped, pylon_issues_created_in_business_hours, pylon_issues_total_hours_to_resolution, pylon_issues_business_hours_open_status, pylon_issues_business_hours_to_resolution, pylon_issues_total_mins_to_first_response, pylon_issues_business_hours_on_hold_status, pylon_issues_total_hours_to_first_response, pylon_issues_business_hours_in_progress_status, pylon_issues_business_hours_waiting_on_action_status, organizations_organization_name; -dimension pylon_issues_created_at_month; +filter pylon_issues_created_at_month equals, pylon_issues_issue_category equals (132 rows)
- `09:51:30` views chart “wobbley-wobble”

## Episode 18 · 5452ad558d · 2026-08-17 13:58Z · 0 min · 2 steps · exploration, no save

- `13:58:38` exploreView · dbt_orders — starts: metrics dbt_orders_count_distinct_user_id, dbt_orders_count_distinct_order_id | by dbt_orders_order_date_month | where dbt_orders_browser equals | custom average_orders_per_user (25 rows)
- `13:58:50` exploreView · dbt_orders — +metric dbt_orders_count_distinct_user_id__pop__month_1__20b2cv, count_distinct_user_id__pop__month_1__20b2cv (25 rows)

## Episode 19 · 5452ad558d · 2026-08-17 15:02Z · 0 min · 5 steps · exploration, no save

- `15:02:38` exploreView · dbt_orders — starts: by dbt_orders_is_sunday (2 rows)
- `15:02:38` exploreView · dbt_orders — +dimension dbt_orders_order_date_period (8 rows)
- `15:02:47` views dashboard “🧭 KPI dashboard”
- `15:02:47` views chart “How many users were created each month? | Weekly orders over the last 3 months | How is the average order amount ($) trending each week?? | What is our total profit?” (+21 more)
- `15:02:48` dashboardView · dbt_orders — +metric dbt_orders_sum_of_profit; +dimension dbt_orders_order_date_month; -dimension dbt_orders_is_sunday, dbt_orders_order_date_period; +filter dbt_orders_basket_total greaterThan; sort dbt_orders_order_date_month desc (22 queries; 25 rows)

## Episode 20 · 5452ad558d · 2026-08-17 15:33Z · 21 min · 25 steps · exploration, no save

- `15:33:26` exploreView · dbt_trips_daily — starts: metrics dbt_trips_daily_incident_rate (1 rows)
- `15:37:03` exploreView · dbt_trips_daily — -metric dbt_trips_daily_incident_rate; +dimension dbt_incidents_incident_date (8 rows)
- `15:38:39` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_order_date_day (14 rows)
- `15:40:18` exploreView · dbt_trips_daily — +metric dbt_trips_daily_trips_total; -dimension dbt_trips_daily_order_date_day (8 rows)
- `15:40:30` exploreView · dbt_trips_daily — +dimension dbt_incidents_incident_date_day (8 rows)
- `15:41:19` exploreView · dbt_trips_daily — +filter dbt_trips_daily_city_name equals (8 rows)
- `15:41:22` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `15:41:34` exploreView · dbt_trips_daily — +metric dbt_incidents_count_incidents (7 rows)
- `15:41:51` exploreView · dbt_trips_daily — -filter dbt_trips_daily_city_name equals (8 rows)
- `15:45:43` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_city_name (23 rows)
- `15:46:50` exploreView · dbt_trips_daily — +custom field total_trips_unsegmented_ (23 rows)
- `15:46:59` exploreView · dbt_trips_daily — -dimension dbt_trips_daily_city_name (8 rows)
- `15:48:12` exploreView · dbt_trips_daily — +custom field total_trips_deduplicated_; -custom field total_trips_unsegmented_ (ERROR Syntax error: OVER keyword must follow a function call at [13:33])
- `15:48:42` exploreView · dbt_trips_daily — +custom field total_trips_by_incident_date; -custom field total_trips_deduplicated_ (8 rows)
- `15:48:52` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_city_id (23 rows)
- `15:49:25` exploreView · dbt_trips_daily — +filter dbt_trips_daily_city_id equals (23 rows)
- `15:49:28` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `15:50:44` exploreView · dbt_trips_daily — -filter dbt_trips_daily_city_id equals; +custom field incident_rate (23 rows)
- `15:51:05` exploreView · dbt_trips_daily — +filter dbt_trips_daily_city_id equals (23 rows)
- `15:51:19` exploreView · dbt_trips_daily — re-run, same shape (8 rows)
- `15:53:25` exploreView · dbt_trips_daily — -filter dbt_trips_daily_city_id equals (23 rows)
- `15:53:25` exploreView · dbt_trips_daily — sort dbt_incidents_incident_date desc (23 rows)
- `15:53:46` exploreView · dbt_trips_daily — -metric dbt_trips_daily_trips_total, dbt_incidents_count_incidents; -dimension dbt_incidents_incident_date_day, dbt_trips_daily_city_id; -custom field total_trips_by_incident_date, incident_rate (8 rows)
- `15:53:46` exploreView · dbt_trips_daily — sort dbt_incidents_incident_date desc (8 rows)
- `15:53:58` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_order_date_day (14 rows)

## Episode 21 · 8789ac9708 · 2026-08-18 00:50Z · 26 min · 62 steps · exploration→save

- `00:50:24` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `00:50:24` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `00:50:49` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd; -metric linear_customer_requests_important_requests; -dimension linear_customer_requests_created_at_month; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween (1 rows)
- `00:50:49` exploreView · ai_token_usage — sort ai_token_usage_total_cost_usd desc (1 rows)
- `00:50:54` exploreView · ai_token_usage — +dimension ai_token_usage_event_at_week (7 rows)
- `00:51:20` exploreView · ai_agent_usage — +metric ai_agent_usage_count_prompts; -metric ai_token_usage_total_cost_usd; -dimension ai_token_usage_event_at_week (1 rows)
- `00:51:20` exploreView · ai_agent_usage — sort ai_agent_usage_count_prompts desc (1 rows)
- `00:51:25` exploreView · ai_agent_usage — +dimension ai_agent_usage_event_at_week (5 rows)
- `00:51:32` exploreView · ai_agent_usage — +filter ai_agent_usage_event_at inThePast (13 rows)
- `00:51:32` exploreView · ai_agent_usage — re-run, same shape (2 rows)
- `00:51:37` exploreView · ai_agent_usage — +filter ai_agent_usage_event_at_day equals; -filter ai_agent_usage_event_at inThePast (1 rows)
- `00:51:40` exploreView · ai_agent_usage — +filter ai_agent_usage_event_at_day inThePast; -filter ai_agent_usage_event_at_day equals (1 rows)
- `00:51:41` exploreView · ai_agent_usage — re-run, same shape (3 rows)
- `00:51:44` exploreView · ai_agent_usage — re-run, same shape (13 rows)
- `00:51:46` exploreView · ai_agent_usage — re-run, same shape (12 rows)
- `00:51:56` exploreView · ai_agent_usage — re-run, same shape (3 rows)
- `00:51:56` exploreView · ai_agent_usage — re-run, same shape (32 rows)
- `00:52:45` exploreView · ai_agent_usage — +metric ai_agent_usage_total_events (32 rows)
- `00:52:54` exploreView · ai_agent_usage — -metric ai_agent_usage_count_prompts (32 rows)
- `00:52:56` exploreView · ai_agent_usage — +dimension ai_agent_usage_event_family (213 rows)
- `00:53:04` exploreView · ai_agent_usage — re-run, same shape (213 rows)
- `00:53:04` exploreView · ai_agent_usage — re-run, same shape (32 rows)
- `00:53:04` exploreView · ai_agent_usage — re-run, same shape (213 rows)
- `01:06:26` views dashboard “[customer] Usage”
- `01:06:26` views chart “What is the weekly AI agent usage and overage cost for the past 12 weeks? | What are the monthly embedded chart views over the past 3 months?” (+1 more)
- `01:06:27` dashboardView · organizations_daily — +metric organizations_daily_sum_embedded_chart_views_num; -metric ai_agent_usage_total_events; +dimension organizations_daily_date_month; -dimension ai_agent_usage_event_at_week, ai_agent_usage_event_family; +filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -filter ai_agent_usage_event_at_day inThePast; +custom field embedded_chart_views_cost; sort organizations_daily_date_month (2 queries; 3 rows)
- `01:07:19` exploreView · ai_token_usage — -metric organizations_daily_sum_embedded_chart_views_num; +dimension ai_token_usage_event_at_week; -dimension organizations_daily_date_month; +filter organizations_organization_name equals, ai_token_usage_event_at inThePast; -filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -custom field embedded_chart_views_cost (7 rows)
- `01:07:19` exploreView · ai_token_usage — sort ai_token_usage_event_at_week desc (7 rows)
- `01:07:26` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd (7 rows)
- `01:07:42` exploreView · ai_token_usage — +dimension ai_token_usage_feature (46 rows)
- `01:07:48` exploreView · ai_token_usage — re-run, same shape (46 rows)
- `01:07:48` exploreView · ai_token_usage — re-run, same shape (7 rows)
- `01:07:48` exploreView · ai_token_usage — re-run, same shape (46 rows)
- `01:08:03` exploreView · ai_token_usage — re-run, same shape (7 rows)
- `01:08:03` exploreView · ai_token_usage — re-run, same shape (46 rows)
- `01:11:40` exploreView · ai_agent_usage — -metric ai_token_usage_total_cost_usd; +dimension ai_agent_usage_event_family; -dimension ai_token_usage_event_at_week, ai_token_usage_feature; -filter organizations_organization_name equals, ai_token_usage_event_at inThePast (9 rows)
- `01:11:40` exploreView · ai_agent_usage — sort ai_agent_usage_event_family (9 rows)
- `01:11:42` exploreView · ai_agent_usage — +dimension ai_agent_usage_event_at_week (41 rows)
- `01:11:45` exploreView · ai_agent_usage — +metric ai_agent_usage_total_events (41 rows)
- `01:13:12` creates chart “How do AI agent events trend over time by week?” (data_app_viz, ai_agent_usage)
- `01:13:13` chartView · ai_agent_usage — re-run, same shape (41 rows)
- `01:13:13` views chart “How do AI agent events trend over time by week?”
- `01:14:04` chartView · ai_agent_usage — re-run, same shape (41 rows)
- `01:14:04` views chart “How do AI agent events trend over time by week? | What are the monthly embedded chart views over the past 3 months? | What is the weekly AI agent usage and overage cost for the past 12 weeks?” (+2 more)
- `01:14:54` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric ai_agent_usage_total_events; +dimension linear_customer_requests_created_at_month; -dimension ai_agent_usage_event_family, ai_agent_usage_event_at_week; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `01:14:54` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `01:14:57` views dashboard “[customer] Usage”
- `01:14:58` dashboardView · organizations_daily — +metric organizations_daily_sum_embedded_chart_views_num; -metric organizations_daily_total_queries_executed; +filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; +custom field embedded_chart_views_cost; sort organizations_daily_date_month (2 queries; 3 rows)
- `01:15:09` exploreView · ai_token_usage — -metric organizations_daily_sum_embedded_chart_views_num; +dimension ai_token_usage_feature; -dimension organizations_daily_date_month; -filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -custom field embedded_chart_views_cost (20 rows)
- `01:15:09` exploreView · ai_token_usage — sort ai_token_usage_feature (20 rows)
- `01:15:14` exploreView · ai_token_usage — +dimension ai_token_usage_event_at_week (126 rows)
- `01:15:19` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd (126 rows)
- `01:15:27` exploreView · ai_token_usage — re-run, same shape (7 rows)
- `01:15:27` exploreView · ai_token_usage — re-run, same shape (126 rows)
- `01:15:27` exploreView · ai_token_usage — re-run, same shape (126 rows)
- `01:15:44` exploreView · ai_token_usage — re-run, same shape (7 rows)
- `01:15:44` exploreView · ai_token_usage — re-run, same shape (126 rows)
- `01:15:55` exploreView · ai_token_usage — +filter organizations_organization_name equals (7 rows)
- `01:15:59` exploreView · ai_token_usage — +filter ai_token_usage_event_at inThePast (7 rows)
- `01:16:04` exploreView · ai_token_usage — re-run, same shape (46 rows)
- `01:16:39` exploreView · ai_token_usage — re-run, same shape (46 rows)
- `01:16:39` exploreView · ai_token_usage — re-run, same shape (7 rows)

## Episode 22 · 41fbf7ad10 · 2026-08-18 09:46Z · 10 min · 17 steps · exploration, no save

- `09:46:38` exploreView · ai_token_usage — starts: metrics ai_token_usage_total_cost_usd | by ai_token_usage_feature, ai_token_usage_event_at_week | where organizations_organization_name equals; ai_token_usage_event_at inThePast (46 rows)
- `09:46:38` exploreView · ai_token_usage — re-run, same shape (7 rows)
- `09:48:13` exploreView · ai_token_usage — +dimension ai_token_usage_event_at_month; -dimension ai_token_usage_event_at_week (2 rows)
- `09:48:13` exploreView · ai_token_usage — re-run, same shape (20 rows)
- `09:50:12` exploreView · ai_token_usage — +dimension ai_token_usage_total_tokens (500 rows)
- `09:50:12` exploreView · ai_token_usage — re-run, same shape (500 rows)
- `09:50:26` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric ai_token_usage_total_cost_usd; +dimension linear_customer_requests_created_at_month; -dimension ai_token_usage_feature, ai_token_usage_event_at_month, ai_token_usage_total_tokens; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_organization_name equals, ai_token_usage_event_at inThePast; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `09:50:26` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `09:50:35` views dashboard “[customer] Usage”
- `09:50:35` views chart “What are the monthly embedded chart views over the past 3 months? | What is the weekly AI agent usage and overage cost for the past 12 weeks?” (+1 more)
- `09:50:36` dashboardView · organizations_daily — +metric organizations_daily_sum_embedded_chart_views_num; -metric organizations_daily_total_queries_executed; +filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; +custom field embedded_chart_views_cost; sort organizations_daily_date_month (2 queries; 3 rows)
- `09:51:49` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd; -metric organizations_daily_sum_embedded_chart_views_num; +dimension ai_token_usage_feature, ai_token_usage_event_at_week; -dimension organizations_daily_date_month; +filter organizations_organization_name equals, ai_token_usage_event_at inThePast; -filter organizations_daily_organization_id equals, organizations_daily_date inThePast; -custom field embedded_chart_views_cost; sort ai_token_usage_feature (7 rows)
- `09:51:49` exploreView · ai_token_usage — re-run, same shape (46 rows)
- `09:53:57` exploreView · ai_token_usage — +metric ai_token_usage_total_calls; -metric ai_token_usage_total_cost_usd; +dimension ai_token_usage_event_at_month; -dimension ai_token_usage_event_at_week (20 rows)
- `09:53:57` exploreView · ai_token_usage — re-run, same shape (20 rows)
- `09:56:16` exploreView · ai_token_usage — re-run, same shape (2 rows)
- `09:56:16` exploreView · ai_token_usage — re-run, same shape (20 rows)

## Episode 23 · 5452ad558d · 2026-08-18 14:16Z · 14 min · 9 steps · exploration, no save

- `14:16:38` exploreView · dbt_trips_daily — starts: metrics dbt_trips_daily_trips_total, dbt_incidents_count_incidents | by dbt_incidents_incident_date, dbt_incidents_incident_date_day, dbt_trips_daily_city_id | custom total_trips_by_incident_date, incident_rate (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:16:57` exploreView · dbt_trips_daily — re-run, same shape (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:17:26` exploreView · dbt_incidents — -metric dbt_trips_daily_trips_total, dbt_incidents_count_incidents; -dimension dbt_incidents_incident_date, dbt_trips_daily_city_id; -custom field total_trips_by_incident_date, incident_rate (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:17:26` exploreView · dbt_incidents — sort dbt_incidents_incident_date_day desc (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:18:03` exploreView · dbt_trips_daily — +dimension dbt_incidents_incident_date; -dimension dbt_incidents_incident_date_day (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:18:03` exploreView · dbt_trips_daily — sort dbt_incidents_incident_date desc (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:29:11` exploreView · dbt_trips_daily — re-run, same shape (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:30:28` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_order_date_day; -dimension dbt_incidents_incident_date (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)
- `14:30:38` exploreView · dbt_trips_daily — +dimension dbt_incidents_incident_date_day (ERROR {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)

## Episode 24 · 5452ad558d · 2026-08-18 14:51Z · 22 min · 41 steps · exploration, no save

- `14:51:27` exploreView · dbt_trips_daily — starts: by dbt_trips_daily_order_date_day (7 rows)
- `14:51:27` exploreView · dbt_trips_daily — sort dbt_trips_daily_order_date_day desc (7 rows)
- `14:51:39` exploreView · dbt_trips_daily — +metric dbt_trips_daily_incidents (7 rows)
- `14:51:46` exploreView · dbt_trips_daily — +metric dbt_trips_daily_trips_total (7 rows)
- `14:51:57` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_city_name (21 rows)
- `14:53:49` exploreView · dbt_trips_daily — +custom field total_trips_per_day (21 rows)
- `14:55:02` exploreView · dbt_trips_daily — +custom field incident_rate (21 rows)
- `14:55:42` exploreView · dbt_trips_daily — +custom field is_chicago (21 rows)
- `14:55:48` exploreView · dbt_trips_daily — +filter is_chicago equals (21 rows)
- `14:55:53` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `14:57:02` exploreView · dbt_trips_daily — +filter dbt_trips_daily_city_name equals (7 rows)
- `14:57:05` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `14:57:07` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `14:57:16` exploreView · dbt_trips_daily — -filter dbt_trips_daily_city_name equals (7 rows)
- `14:57:31` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `14:57:48` exploreView · dbt_trips_daily — -metric dbt_trips_daily_incidents, dbt_trips_daily_trips_total; +dimension dbt_incidents_incident_date; -dimension dbt_trips_daily_order_date_day, dbt_trips_daily_city_name; -filter is_chicago equals; -custom field total_trips_per_day, incident_rate, is_chicago (8 rows)
- `14:57:48` exploreView · dbt_trips_daily — sort dbt_incidents_incident_date desc (8 rows)
- `14:57:51` exploreView · dbt_trips_daily — +dimension dbt_incidents_incident_date_day (8 rows)
- `14:58:38` exploreView · dbt_trips_daily — +dimension dbt_trips_daily_order_date_day (14 rows)
- `14:58:41` exploreView · dbt_trips_daily — -dimension dbt_incidents_incident_date (14 rows)
- `14:59:00` exploreView · dbt_trips_daily — -dimension dbt_incidents_incident_date_day (7 rows)
- `14:59:37` exploreView · dbt_trips_daily — +metric dbt_trips_daily_trips_total (7 rows)
- `15:09:54` exploreView · dbt_trips_daily — +metric dbt_trips_daily_incidents; +dimension dbt_trips_daily_city_name; +filter is_chicago equals; +custom field total_trips_per_day, incident_rate, city_t_c; sort dbt_trips_daily_order_date_day desc (21 rows)
- `15:10:00` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:10:16` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:10:20` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:10:25` exploreView · dbt_trips_daily — -custom field city_t_c (21 rows)
- `15:10:43` exploreView · dbt_trips_daily — +custom field city_t_c (21 rows)
- `15:10:49` exploreView · dbt_trips_daily — +filter city_t_c equals (21 rows)
- `15:10:54` exploreView · dbt_trips_daily — -filter is_chicago equals (21 rows)
- `15:11:07` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:11:19` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:11:42` exploreView · dbt_trips_daily — -filter city_t_c equals (21 rows)
- `15:11:46` exploreView · dbt_trips_daily — +filter city_t_c equals (21 rows)
- `15:12:12` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:12:26` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:12:47` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:12:51` exploreView · dbt_trips_daily — re-run, same shape (21 rows)
- `15:13:41` exploreView · dbt_trips_daily — re-run, same shape (7 rows)
- `15:13:52` exploreView · dbt_trips_daily — re-run, same shape (14 rows)
- `15:13:56` exploreView · dbt_trips_daily — re-run, same shape (7 rows)

## Episode 25 · a8b7b19013 · 2026-08-18 15:46Z · 5 min · 21 steps · exploration→save

- `15:46:50` saves dashboard “GitHub Repo Explorer”
- `15:47:08` creates chart “Comments” (big_number, issues)
- `15:47:08` creates chart “Commits” (big_number, commits)
- `15:47:09` creates chart “Commits per week” (cartesian, commits)
- `15:47:09` creates chart “Contributors” (big_number, contributors)
- `15:47:09` creates chart “Issues & PRs by author association” (pie, issues)
- `15:47:09` creates chart “Issues & PRs” (big_number, issues)
- `15:47:09` creates chart “Issues & PRs opened per month by state” (cartesian, issues)
- `15:47:10` creates chart “Latest issues & PRs” (table, issues)
- `15:47:10` creates chart “Top 15 contributors by lifetime contributions” (cartesian, contributors)
- `15:47:10` saves dashboard “GitHub Repo Explorer”
- `15:47:59` views dashboard “GitHub Repo Explorer”
- `15:48:00` views chart “Comments | Latest issues & PRs | Commits | Commits per week” (+8 more)
- `15:48:00` views dashboard “GitHub Repo Explorer”
- `15:48:00` dashboardView · issues — starts: by issues_created_at_day, issues_issue_number, issues_title, issues_state, issues_is_pull_request, issues_author_login | where issues_created_at_day inThePast (9 queries; 25 rows)
- `15:48:49` viewUnderlyingData · issues — +dimension issues_closed_at, issues_created_at, issues_closed_at_day, issues_closed_at_week, issues_closed_at_year, issues_closed_at_month, issues_created_at_week, issues_created_at_year, issues_created_at_month, issues_author_association, contributors_login, contributors_is_site_admin; +filter issues_created_at_month equals, issues_state equals (52 rows)
- `15:49:11` exploreView · issues — +metric issues_issue_count; +dimension issues_created_at_month; -dimension issues_created_at_day, issues_issue_number, issues_title, issues_is_pull_request, issues_author_login; sort issues_created_at_month (12 rows)
- `15:49:11` exploreView · issues — re-run, same shape (22 rows)
- `15:51:39` views dashboard “GitHub Repo Explorer”
- `15:51:39` views chart “Contributors | Comments | Issues & PRs by author association | Latest issues & PRs” (+8 more)
- `15:51:40` dashboardView · contributors — +metric contributors_total_contributions; -metric issues_issue_count; +dimension contributors_login; -dimension issues_created_at_month, issues_state; -filter issues_created_at_day inThePast; sort contributors_total_contributions desc (9 queries; 15 rows)

## Episode 26 · ebf5bfc5ab · 2026-08-18 19:12Z · 0 min · 2 steps · exploration, no save

- `19:12:49` exploreView · linear_customer_requests — starts: metrics linear_customer_requests_total_requests | by linear_customer_requests_created_at_month (12 rows)
- `19:12:49` exploreView · merge — +metric a_linear_customer_requests_total_requests, b_pylon_issues_closed_issues; -metric linear_customer_requests_total_requests; +dimension merge_join_key_0; -dimension linear_customer_requests_created_at_month (12 rows)

## Episode 27 · 5452ad558d · 2026-08-19 15:27Z · 16 min · 32 steps · exploration→save

- `15:27:57` creates chart “Won Revenue” (big_number, deals)
- `15:27:57` creates chart “Won Revenue (Period-to-Date)” (big_number, deals)
- `15:27:57` saves dashboard “Period Comparison Toggle Example”
- `15:28:31` views dashboard “Period Comparison Toggle Example”
- `15:28:31` views chart “Won Revenue (Period-to-Date) | Won Revenue” (+1 more)
- `15:28:56` saves dashboard “Period Comparison Toggle Example”
- `15:29:09` views dashboard “Period Comparison Toggle Example”
- `15:29:09` views chart “Won Revenue (Period-to-Date)”
- `15:29:26` exploreView · deals — starts: metrics deals_total_won_amount, deals_total_won_amount__pop__month_1__ptd001, total_won_amount__pop__month_1__ptd001 | by deals_created_date_month | where deals_created_date inTheCurrent (1 rows)
- `15:29:32` updates chart “Won Revenue (Period-to-Date)” (big_number, deals)
- `15:29:32` exploreView · deals — re-run, same shape (1 rows)
- `15:29:35` dashboardView · deals — re-run, same shape (1 rows)
- `15:29:44` exploreView · deals — re-run, same shape (1 rows)
- `15:30:05` updates chart “Won Revenue (Period-to-Date)” (big_number, deals)
- `15:30:06` exploreView · deals — re-run, same shape (1 rows)
- `15:30:07` views dashboard “Period Comparison Toggle Example”
- `15:30:07` views chart “Won Revenue (Period-to-Date) | Won Revenue” (+1 more)
- `15:30:07` dashboardView · deals — re-run, same shape (2 queries; 1 rows)
- `15:30:19` exploreView · deals — +metric deals_total_won_amount__pop__month_1__full01, total_won_amount__pop__month_1__full01; -metric deals_total_won_amount__pop__month_1__ptd001, total_won_amount__pop__month_1__ptd001; +filter deals_created_date inThePast; -filter deals_created_date inTheCurrent (1 rows)
- `15:30:34` updates chart “Won Revenue” (big_number, deals)
- `15:30:35` exploreView · deals — re-run, same shape (1 rows)
- `15:31:13` exploreView · deals — +metric deals_total_won_amount__pop__month_1__ptd001, total_won_amount__pop__month_1__ptd001; -metric deals_total_won_amount__pop__month_1__full01, total_won_amount__pop__month_1__full01; +filter deals_created_date inTheCurrent; -filter deals_created_date inThePast (1 rows)
- `15:31:13` views chart “Won Revenue (Period-to-Date)”
- `15:31:31` exploreView · deals — +filter deals_created_date inPeriodToDate; -filter deals_created_date inTheCurrent (16 rows)
- `15:31:33` exploreView · deals — re-run, same shape (26 rows)
- `15:31:44` exploreView · deals — sort deals_total_won_amount desc, deals_created_date_month (26 rows)
- `15:31:50` exploreView · deals — sort deals_created_date_month (26 rows)
- `15:31:57` exploreView · deals — sort deals_created_date_month desc (26 rows)
- `15:37:18` exploreView · deals — +filter deals_created_date inTheCurrent; -filter deals_created_date inPeriodToDate; sort deals_total_won_amount desc (1 rows)
- `15:37:31` sqlRunner · sql_query_explorer — runs SQL (26 rows)
- `15:38:04` sqlRunner · sql_query_explorer — runs SQL (26 rows)
- `15:44:14` exploreView · deals — starts: metrics deals_total_won_amount, deals_total_won_amount__pop__month_1__ptd001, total_won_amount__pop__month_1__ptd001 | by deals_created_date_month | where deals_created_date inPeriodToDate (17 rows)

## Episode 28 · 5452ad558d · 2026-08-20 07:40Z · 14 min · 12 steps · exploration→save

- `07:40:49` exploreView · deals — starts: metrics deals_total_won_amount, deals_total_won_amount__pop__month_1__ptd001, total_won_amount__pop__month_1__ptd001 | by deals_created_date_month | where deals_created_date inTheCurrent (1 rows)
- `07:40:49` views chart “Won Revenue (Period-to-Date)”
- `07:42:49` exploreView · deals — -metric deals_total_won_amount, deals_total_won_amount__pop__month_1__ptd001, total_won_amount__pop__month_1__ptd001; -filter deals_created_date inTheCurrent (26 rows)
- `07:42:49` exploreView · deals — sort deals_created_date_month desc (26 rows)
- `07:42:56` exploreView · deals — +metric deals_new_deals (26 rows)
- `07:43:03` creates chart “How many new deals are created each month?” (cartesian, deals)
- `07:43:03` chartView · deals — re-run, same shape (26 rows)
- `07:43:03` views chart “How many new deals are created each month?”
- `07:45:32` views chart “How many new deals are created each month?”
- `07:45:33` chartView · deals — re-run, same shape (26 rows)
- `07:55:08` views chart “What is the minimum call time by month?”
- `07:55:10` chartView · activities — +metric activities_min_call_time; -metric deals_new_deals; +dimension activities_activity_timestamp_month, activities_sdr_name; -dimension deals_created_date_month; sort activities_activity_timestamp_month desc (197 rows)

## Episode 29 · 2574ef047d · 2026-08-20 09:27Z · 12 min · 14 steps · exploration→save

- `09:27:44` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `09:27:44` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `09:27:47` views dashboard “🟣 AI Usage”
- `09:27:47` views chart “Weekly AI agent updates | Top 20 organizations by AI agent usage | How much pinned context is used in AI agent prompts | Prompts created over time” (+17 more)
- `09:27:48` dashboardView · ai_agent_usage — +metric ai_agent_usage_count_events, ai_agent_usage_count_events_pop_28d, count_events_pop_28d; -metric linear_customer_requests_important_requests; +dimension ai_agent_usage_event_at_day; -dimension linear_customer_requests_created_at_month; +filter ai_agent_usage_event_family equals, organizations_organization_name notEquals; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; +custom field trailing_28_day_total_prompts, trailing_28_day_total_prompts_lagged_28_days_, increase_compared_to_28_days_ago (18 queries; 29 rows)
- `09:37:59` views dashboard “🟣 AI Usage”
- `09:37:59` views chart “Total MCP Tool Call Events | MCP Tool Calls by Organization and tool name | Weekly prompt frequency | MCP Tool Calls per org” (+17 more)
- `09:38:35` exploreView · queries — +metric queries_total_queries, queries_ai_queries, queries_mcp_queries; -metric ai_agent_usage_count_events, ai_agent_usage_count_events_pop_28d, count_events_pop_28d; +dimension queries_executed_at_week; -dimension ai_agent_usage_event_at_day; +filter queries_executed_at_week inThePast, queries_query_origin equals; -filter ai_agent_usage_event_family equals, organizations_organization_name notEquals; +custom field ai_agent_share, mcp_share, human_share; -custom field trailing_28_day_total_prompts, trailing_28_day_total_prompts_lagged_28_days_, increase_compared_to_28_days_ago; sort queries_executed_at_week (12 rows)
- `09:38:35` views chart “AI share of query executions (weekly)”
- `09:40:06` updates chart “AI share of query executions (weekly)” (cartesian, queries)
- `09:40:07` exploreView · queries — re-run, same shape (12 rows)
- `09:40:09` views dashboard “🟣 AI Usage”
- `09:40:10` views chart “How do Ask AI Agent clicks trend weekly across different entry surfaces? | Monthly prompt frequency - organization breakdown | Prompts created over time | Monthly new AI agents” (+17 more)
- `09:40:10` dashboardView · ai_agent_usage — +metric ai_agent_usage_count_events, ai_agent_usage_count_events_pop_28d, count_events_pop_28d; -metric queries_total_queries, queries_ai_queries, queries_mcp_queries; +dimension ai_agent_usage_event_at_day; -dimension queries_executed_at_week; +filter ai_agent_usage_event_family equals, organizations_organization_name notEquals; -filter queries_executed_at_week inThePast, queries_query_origin equals; +custom field trailing_28_day_total_prompts, trailing_28_day_total_prompts_lagged_28_days_, increase_compared_to_28_days_ago; -custom field ai_agent_share, mcp_share, human_share (12 queries; 29 rows)

## Episode 30 · ffa72f2e79 · 2026-08-20 10:32Z · 20 min · 29 steps · exploration→save

- `10:32:23` metricsExplorer · dbt_support_requests — starts: metrics dbt_support_requests_count_distinct_request_id | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (2 queries; 2 rows)
- `10:32:23` metricsExplorer · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_support_requests_count_distinct_request_id (6 queries; 2 rows)
- `10:33:35` metricsExplorer · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_orders_average_of_basket_total (6 queries; 2 rows)
- `10:33:35` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total; sort dbt_orders_order_date_month (2 queries; 5 rows)
- `10:34:58` exploreView · dbt_baskets — -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_baskets_partner_name; -dimension dbt_orders_order_date_month; -filter dbt_orders_order_date_day inBetween; sort dbt_baskets_partner_name (9 rows)
- `10:34:59` exploreView · dbt_baskets — +metric dbt_baskets_sum_of_basket_total (9 rows)
- `10:35:57` saves dashboard “Josh Test”
- `10:35:58` creates chart “What is the revenue distribution across partners?” (pie, dbt_baskets)
- `10:35:58` saves dashboard “Josh Test”
- `10:35:59` views chart “What is the revenue distribution across partners?”
- `10:36:00` chartView · dbt_baskets — re-run, same shape (9 rows)
- `10:39:06` exploreView · dbt_baskets — re-run, same shape (9 rows)
- `10:39:30` views dashboard “Josh Test”
- `10:39:31` views chart “What is the revenue distribution across partners?”
- `10:39:31` dashboardView · dbt_baskets — re-run, same shape (9 rows)
- `10:39:44` exploreView · dbt_baskets — +metric dbt_baskets_average_of_item_profit; -metric dbt_baskets_sum_of_basket_total; -dimension dbt_baskets_partner_name (1 rows)
- `10:39:44` exploreView · dbt_baskets — sort dbt_baskets_average_of_item_profit desc (1 rows)
- `10:42:05` exploreView · dbt_users — -metric dbt_baskets_average_of_item_profit; +dimension dbt_users_browser; sort dbt_users_browser (7 rows)
- `10:43:04` exploreView · dbt_baskets — +dimension dbt_baskets_order_date_week; -dimension dbt_users_browser (106 rows)
- `10:43:04` exploreView · dbt_baskets — sort dbt_baskets_order_date_week desc (106 rows)
- `10:43:10` exploreView · dbt_baskets — +metric dbt_baskets_average_of_basket_total (106 rows)
- `10:43:16` exploreView · merge — +metric a_dbt_baskets_average_of_basket_total, b_dbt_orders_sum_of_basket_total; -metric dbt_baskets_average_of_basket_total; +dimension merge_join_key_0; -dimension dbt_baskets_order_date_week (106 rows)
- `10:47:14` exploreView · dbt_support_requests — +metric dbt_support_requests_count_of_request_id; -metric a_dbt_baskets_average_of_basket_total, b_dbt_orders_sum_of_basket_total; +dimension dbt_support_requests_request_date_week; -dimension merge_join_key_0; +filter dbt_support_requests_request_date_week inThePast; sort dbt_support_requests_request_date_week (99 rows)
- `10:50:20` views dashboard “🧭 KPI dashboard”
- `10:50:22` views chart “What is our average order value? | What is our monthly revenue? | Monthly Product Count by Partner - Last 12 Months | How do Average Profit per Order, Average Order Value, and Order Volume trend by User Creation Date?” (+12 more)
- `10:50:23` dashboardView · dbt_orders — +metric dbt_orders_count_of_order_id, dbt_orders_sum_of_basket_total, dbt_orders_average_of_basket_total; -metric dbt_support_requests_count_of_request_id; +dimension dbt_orders_partner_name, dbt_orders_order_date_month; -dimension dbt_support_requests_request_date_week; -filter dbt_support_requests_request_date_week inThePast; sort dbt_orders_order_date_month (13 queries; 25 rows)
- `10:51:19` viewUnderlyingData · dbt_orders — -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_basket_total, dbt_orders_average_of_basket_total; +dimension dbt_orders_email, dbt_orders_profit, dbt_orders_browser, dbt_orders_user_id, dbt_orders_currency, dbt_orders_order_id, dbt_orders_referrer, dbt_orders_is_sunday, dbt_orders_order_date, dbt_orders_orders_dim, dbt_orders_partner_id, dbt_orders_basket_total, dbt_orders_partner_logo, dbt_orders_selected_dim, dbt_orders_shipping_city, dbt_orders_order_date_day, dbt_orders_order_date_hour, dbt_orders_order_date_week, dbt_orders_order_date_year, dbt_orders_shipping_country, dbt_orders_order_date_period, dbt_orders_user_created_date, dbt_orders_order_date_quarter, dbt_orders_partner_commission, dbt_orders_order_date_week_num, dbt_orders_order_date_month_num, dbt_orders_order_date_month_name, dbt_orders_user_created_date_day, dbt_orders_user_created_date_raw, dbt_orders_order_date_quarter_num, dbt_orders_user_created_date_week, dbt_orders_user_created_date_year, dbt_orders_order_date_quarter_name, dbt_orders_user_created_date_month, dbt_orders_user_created_date_quarter, dbt_orders_order_date_day_of_year_num, dbt_orders_order_date_hour_of_day_num, dbt_orders_order_date_day_of_month_num, dbt_orders_order_date_day_of_week_name, dbt_orders_order_date_day_of_week_index, dbt_orders_order_date_minute_of_hour_num; +filter dbt_orders_order_date_month equals (500 rows)
- `10:51:35` exploreView · dbt_orders — -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_basket_total, dbt_orders_average_of_basket_total; +dimension dbt_orders_email, dbt_orders_profit, dbt_orders_browser, dbt_orders_user_id, dbt_orders_currency, dbt_orders_order_id, dbt_orders_referrer, dbt_orders_is_sunday, dbt_orders_order_date, dbt_orders_orders_dim, dbt_orders_partner_id, dbt_orders_basket_total, dbt_orders_partner_logo, dbt_orders_selected_dim, dbt_orders_shipping_city, dbt_orders_order_date_day, dbt_orders_order_date_hour, dbt_orders_order_date_week, dbt_orders_order_date_year, dbt_orders_shipping_country, dbt_orders_order_date_period, dbt_orders_user_created_date, dbt_orders_order_date_quarter, dbt_orders_partner_commission, dbt_orders_order_date_week_num, dbt_orders_order_date_month_num, dbt_orders_order_date_month_name, dbt_orders_user_created_date_day, dbt_orders_user_created_date_raw, dbt_orders_order_date_quarter_num, dbt_orders_user_created_date_week, dbt_orders_user_created_date_year, dbt_orders_order_date_quarter_name, dbt_orders_user_created_date_month, dbt_orders_user_created_date_quarter, dbt_orders_order_date_day_of_year_num, dbt_orders_order_date_hour_of_day_num, dbt_orders_order_date_day_of_month_num, dbt_orders_order_date_day_of_week_name, dbt_orders_order_date_day_of_week_index, dbt_orders_order_date_minute_of_hour_num; +filter dbt_orders_order_date_month equals; sort dbt_orders_order_date desc (500 rows)
- `10:52:18` exploreView · dbt_orders — re-run, same shape (500 rows)

## Episode 31 · 5452ad558d · 2026-08-21 10:08Z · 54 min · 38 steps · exploration→save

- `10:08:23` exploreView · dbt_orders — starts: by dbt_orders_order_date_week (106 rows)
- `10:08:23` exploreView · dbt_orders — re-run, same shape (106 rows)
- `10:08:25` exploreView · dbt_orders — +dimension dbt_orders_partner_name; sort dbt_orders_order_date_week desc (500 rows)
- `10:08:26` exploreView · dbt_orders — +dimension dbt_orders_partner_logo (500 rows)
- `10:08:26` exploreView · dbt_orders — +dimension dbt_orders_referrer (500 rows)
- `10:08:28` exploreView · dbt_orders — +metric dbt_orders_sum_of_basket_total (500 rows)
- `10:08:29` exploreView · dbt_orders — +metric dbt_orders_count_distinct_order_id (500 rows)
- `10:08:29` exploreView · dbt_orders — +metric dbt_orders_median_profit (500 rows)
- `10:08:30` exploreView · dbt_orders — +metric dbt_orders_avg_profit (500 rows)
- `10:08:55` views dashboard “Copy of 🧭 KPI dashboard”
- `10:08:56` creates chart “What are the order metrics by referrer and partner?” (table, dbt_orders)
- `10:08:57` saves dashboard “Copy of 🧭 KPI dashboard”
- `10:09:00` exploreView · dbt_orders — re-run, same shape (500 rows)
- `10:09:12` views dashboard “Copy of 🧭 KPI dashboard”
- `10:09:12` views chart “What are the order metrics by referrer and partner? | Partner metrics overview | Average order count per user per month | What is our average order value?” (+11 more)
- `10:09:13` dashboardView · dbt_orders — +metric dbt_orders_average_of_basket_total, dbt_orders_profit_margin, dbt_orders_sum_of_profit; -metric dbt_orders_median_profit, dbt_orders_avg_profit; -dimension dbt_orders_order_date_week, dbt_orders_partner_logo, dbt_orders_referrer; +filter dbt_orders_browser equals; sort dbt_orders_sum_of_basket_total desc (12 queries; 9 rows)
- `10:09:47` exploreView · dbt_orders — +metric dbt_orders_median_profit, dbt_orders_avg_profit; -metric dbt_orders_average_of_basket_total, dbt_orders_profit_margin, dbt_orders_sum_of_profit; +dimension dbt_orders_order_date_week, dbt_orders_partner_logo, dbt_orders_referrer; -filter dbt_orders_browser equals; sort dbt_orders_order_date_week desc (500 rows)
- `10:10:37` views dashboard “Copy of 🧭 KPI dashboard”
- `10:10:38` views chart “Partner metrics overview | How many orders have we fulfilled?? | What is our total profit? | What is our average order value?” (+11 more)
- `10:24:27` metricsExplorer · dbt_orders — -metric dbt_orders_sum_of_basket_total, dbt_orders_median_profit, dbt_orders_avg_profit; +dimension dbt_orders_order_date_month; -dimension dbt_orders_order_date_week, dbt_orders_partner_name, dbt_orders_partner_logo, dbt_orders_referrer; +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_month desc (6 queries; 2 rows)
- `10:24:27` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_distinct_order_id (2 queries; 2 rows)
- `10:24:30` views dashboard “Copy of 🧭 KPI dashboard”
- `10:24:31` views chart “How many orders have we fulfilled?? | How much revenue are we making each month? | What is our total profit? | Revenue by Partner” (+11 more)
- `10:24:32` dashboardView · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; +filter dbt_orders_browser equals; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween (12 queries; 25 rows)
- `10:35:18` views chart “How many users were created each month?”
- `10:53:38` views chart “What are the order metrics by referrer and partner?”
- `10:53:39` exploreView · dbt_orders — +metric dbt_orders_count_distinct_order_id, dbt_orders_median_profit, dbt_orders_avg_profit; +dimension dbt_orders_order_date_week, dbt_orders_partner_name, dbt_orders_partner_logo, dbt_orders_referrer; -dimension dbt_orders_order_date_month; -filter dbt_orders_browser equals; sort dbt_orders_order_date_week desc (500 rows)
- `10:53:41` exploreView · dbt_orders — -dimension dbt_orders_referrer (500 rows)
- `10:53:41` exploreView · dbt_orders — -dimension dbt_orders_partner_logo (500 rows)
- `10:53:42` exploreView · dbt_orders — -dimension dbt_orders_partner_name (106 rows)
- `10:54:15` exploreView · dbt_orders — +custom field revenue_per_order (106 rows)
- `10:54:20` updates chart “What are the order metrics by referrer and partner?” (table, dbt_orders)
- `10:54:21` exploreView · dbt_orders — re-run, same shape (106 rows)
- `10:54:22` views dashboard “Copy of 🧭 KPI dashboard”
- `10:54:23` views chart “What is our total profit? | What is our total revenue this month? | How many users were created each month? | What are the order metrics by referrer and partner?” (+11 more)
- `10:54:24` dashboardView · dbt_orders — +filter dbt_orders_browser equals (106 rows)
- `11:02:06` views chart “What are the order metrics by referrer and partner?”
- `11:02:07` exploreView · dbt_orders — -filter dbt_orders_browser equals (106 rows)

## Episode 32 · 8a3accdea3 · 2026-08-21 19:25Z · 7 min · 10 steps · exploration, no save

- `19:25:31` views chart “Average order count per user per month”
- `19:25:32` exploreView · dbt_orders — starts: metrics dbt_orders_count_distinct_user_id, dbt_orders_count_distinct_order_id | by dbt_orders_order_date_month | custom average_orders_per_user (25 rows)
- `19:26:31` views chart “Average order count per user per month”
- `19:26:32` exploreView · dbt_orders — re-run, same shape (25 rows)
- `19:30:06` views chart “Average order count per user per month”
- `19:30:07` exploreView · dbt_orders — re-run, same shape (25 rows)
- `19:30:34` exploreView · dbt_orders — re-run, same shape (25 rows)
- `19:32:22` views chart “Average order count per user per month”
- `19:32:23` exploreView · dbt_orders — re-run, same shape (25 rows)
- `19:32:49` exploreView · dbt_orders — re-run, same shape (25 rows)

## Episode 33 · 8a3accdea3 · 2026-08-21 20:13Z · 43 min · 54 steps · exploration, no save

- `20:13:39` views chart “Average order count per user per month”
- `20:13:40` exploreView · dbt_orders — starts: metrics dbt_orders_count_distinct_user_id, dbt_orders_count_distinct_order_id | by dbt_orders_order_date_month | custom average_orders_per_user (25 rows)
- `20:14:43` views chart “Average order count per user per month”
- `20:14:44` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:15:24` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:15:24` views chart “Average order count per user per month”
- `20:16:43` views chart “Average order count per user per month”
- `20:16:46` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:17:51` views chart “Average order count per user per month”
- `20:17:52` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:20:15` views chart “Average order count per user per month”
- `20:20:16` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:21:47` views chart “Average order count per user per month”
- `20:21:48` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:22:51` views chart “Average order count per user per month”
- `20:22:52` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:26:29` views chart “Average order count per user per month”
- `20:26:30` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:28:15` views chart “Average order count per user per month”
- `20:28:16` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:29:25` views chart “Average order count per user per month”
- `20:29:26` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:30:22` views chart “Average order count per user per month”
- `20:30:23` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:31:08` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:31:08` views chart “Average order count per user per month”
- `20:32:18` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:32:18` views chart “Average order count per user per month”
- `20:34:23` views chart “Average order count per user per month”
- `20:34:24` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:35:56` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:35:56` views chart “Average order count per user per month”
- `20:36:27` views chart “Average order count per user per month”
- `20:36:28` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:36:54` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:39:21` views chart “Average order count per user per month”
- `20:39:22` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:43:34` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:43:34` views chart “Average order count per user per month”
- `20:44:56` views chart “Average order count per user per month”
- `20:44:57` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:46:08` views chart “Average order count per user per month”
- `20:46:09` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:47:59` views chart “Average order count per user per month”
- `20:48:00` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:48:35` views chart “Average order count per user per month”
- `20:48:36` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:52:59` views chart “Average order count per user per month”
- `20:53:00` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:54:04` views chart “Average order count per user per month”
- `20:54:05` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:54:49` exploreView · dbt_orders — re-run, same shape (25 rows)
- `20:56:11` views chart “Average order count per user per month”
- `20:56:12` exploreView · dbt_orders — re-run, same shape (25 rows)

## Episode 34 · 94db644e3b · 2026-08-24 10:57Z · 3 min · 19 steps · exploration, no save

- `10:57:33` exploreView · sales_deal_durations — starts: metrics sales_deal_durations_total_deals (1 rows)
- `10:57:33` exploreView · sales_deal_durations — re-run, same shape (1 rows)
- `10:57:43` exploreView · sales_deal_durations — +dimension sales_deal_durations_mrr; sort sales_deal_durations_total_deals desc (14 rows)
- `10:57:52` exploreView · sales_deal_durations — +dimension sales_deal_durations_company_name (500 rows)
- `10:58:04` exploreView · sales_deal_durations — +metric sales_deal_durations_won_deals (500 rows)
- `10:58:15` exploreView · sales_deal_durations — -metric sales_deal_durations_total_deals (500 rows)
- `10:58:26` exploreView · sales_deal_durations — -dimension sales_deal_durations_mrr (500 rows)
- `10:58:35` exploreView · sales_deal_durations — -metric sales_deal_durations_won_deals (500 rows)
- `10:58:39` exploreView · sales_deal_durations — +metric sales_deal_durations_total_mrr (500 rows)
- `10:58:53` exploreView · sales_deal_durations — sort sales_deal_durations_total_mrr desc (500 rows)
- `10:59:04` exploreView · sales_deal_durations — +dimension sales_deal_durations_months_in_pipeline (500 rows)
- `10:59:24` exploreView · sales_deal_durations — re-run, same shape (604 rows)
- `10:59:44` exploreView · sales_deal_durations — +metric sales_deal_durations_won_deals (604 rows)
- `10:59:47` exploreView · sales_deal_durations — +filter sales_deal_durations_won_deals equals (604 rows)
- `10:59:51` exploreView · sales_deal_durations — +filter sales_deal_durations_won_deals notNull; -filter sales_deal_durations_won_deals equals (604 rows)
- `11:00:07` exploreView · sales_deal_durations — +filter sales_deal_durations_won_deals greaterThan; -filter sales_deal_durations_won_deals notNull (604 rows)
- `11:00:09` exploreView · sales_deal_durations — re-run, same shape (0 rows)
- `11:00:14` exploreView · sales_deal_durations — re-run, same shape (604 rows)
- `11:00:15` exploreView · sales_deal_durations — re-run, same shape (0 rows)

## Episode 35 · f6344dd890 · 2026-08-24 11:44Z · 41 min · 28 steps · exploration, no save

- `11:44:32` exploreView · users — starts: metrics users_count_users | by users_created_at_week (266 rows)
- `11:47:07` exploreView · users — -dimension users_created_at_week; sort users_count_users desc (1 rows)
- `11:47:07` exploreView · users — re-run, same shape (1 rows)
- `11:47:18` exploreView · users — +dimension users_created_at_week; sort users_count_users desc (266 rows)
- `11:47:36` exploreView · users — re-run, same shape (266 rows)
- `11:47:36` exploreView · projects_daily — +metric projects_daily_projects; -metric users_count_users; +dimension projects_daily_date_week; -dimension users_created_at_week (5 rows)
- `11:47:36` exploreView · merge — +metric a_users_count_users, b_projects_daily_projects; -metric projects_daily_projects; +dimension merge_join_key_0; -dimension projects_daily_date_week (266 rows)
- `11:47:54` exploreView · users — +metric users_count_users; -metric a_users_count_users, b_projects_daily_projects; +dimension users_created_at_week; -dimension merge_join_key_0; sort users_count_users desc (266 rows)
- `11:48:01` exploreView · users — re-run, same shape (266 rows)
- `11:48:05` exploreView · users — re-run, same shape (266 rows)
- `11:52:32` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric users_count_users; +dimension organizations_daily_date_month; -dimension users_created_at_week; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `11:52:32` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `11:53:23` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month (2 queries; 13 rows)
- `11:53:23` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month (2 queries; 12 rows)
- `12:03:35` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `12:03:35` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `12:05:33` metricsExplorer · linear_customer_requests — re-run, same shape (2 queries; 2 rows)
- `12:05:33` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `12:06:05` exploreView · users — -metric organizations_daily_total_queries_executed; +dimension users_created_at_week; -dimension organizations_daily_date_month; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween (266 rows)
- `12:06:05` exploreView · users — sort users_created_at_week desc (266 rows)
- `12:06:07` exploreView · users — +metric users_count_users (266 rows)
- `12:15:33` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric users_count_users; +dimension organizations_daily_date_month; -dimension users_created_at_week; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `12:15:33` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `12:22:49` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `12:22:49` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `12:25:36` exploreView · github_activity — -metric linear_customer_requests_important_requests; +dimension github_activity_created_at_week; -dimension linear_customer_requests_created_at_month; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween (5 rows)
- `12:25:36` exploreView · github_activity — sort github_activity_created_at_week desc (5 rows)
- `12:25:38` exploreView · github_activity — +metric github_activity_pr_count (5 rows)

## Episode 36 · 94db644e3b · 2026-08-24 13:23Z · 27 min · 169 steps · exploration→save

- `13:23:58` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `13:23:58` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `13:24:17` views dashboard “🪙 AI Token Spend”
- `13:24:17` views chart “Last 30 days AI cost | Cache hit rate by feature  | Customers using their own AI keys | Prospects with high AI Usage (more than $50 per week)” (+24 more)
- `13:24:18` dashboardView · ai_token_usage — +metric ai_token_usage_total_cost_usd, ai_token_usage_total_calls, ai_token_usage_last_self_managed_call, last_self_managed_call; -metric linear_customer_requests_important_requests; +dimension organizations_organization_name, organizations_tier, organizations_is_paying, ai_token_usage_provider; -dimension linear_customer_requests_created_at_month; +filter ai_token_usage_event_at_raw inThePast, ai_token_usage_key_management equals; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort ai_token_usage_total_cost_usd desc (25 queries; 5 rows)
- `13:25:09` views chart “Orgs using AI | Whose AI usage are we subsidising? | Top users by est. AI cost | Token composition by feature” (+24 more)
- `13:25:09` views dashboard “🪙 AI Token Spend”
- `13:25:10` dashboardView · ai_token_usage — -metric ai_token_usage_total_calls, ai_token_usage_last_self_managed_call, last_self_managed_call; +dimension organizations_mrr; -dimension organizations_is_paying, ai_token_usage_provider; +filter organizations_mrr notNull, margin_after_a_i lessThan; +custom field margin_after_a_i; sort margin_after_a_i, ai_token_usage_total_cost_usd desc (50 queries; 37 rows)
- `13:25:34` saves dashboard “🪙 AI Token Spend”
- `13:25:46` exploreView · ai_token_usage — +metric ai_token_usage_cache_hit_rate; -metric ai_token_usage_total_cost_usd; -dimension organizations_organization_name, organizations_tier, organizations_mrr; -filter organizations_mrr notNull, ai_token_usage_key_management equals, margin_after_a_i lessThan; -custom field margin_after_a_i; sort ai_token_usage_cache_hit_rate desc (1 rows)
- `13:25:52` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:25:53` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:26:22` updates chart “Cache hit rate ” (big_number, ai_token_usage)
- `13:26:22` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:26:26` views dashboard “🪙 AI Token Spend”
- `13:26:27` views chart “Total tokens (last 7 days) | Cost concentration by org | Cache hit rate by feature | Top users by est. AI cost” (+24 more)
- `13:26:27` dashboardView · ai_token_usage — re-run, same shape (1 rows)
- `13:26:36` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd; -metric ai_token_usage_cache_hit_rate; +custom field monthly_run_rate; sort ai_token_usage_total_cost_usd desc (1 rows)
- `13:27:02` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:27:07` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:27:07` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:27:11` updates chart “Last 30 days AI cost” (big_number, ai_token_usage)
- `13:27:11` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:27:31` views dashboard “🪙 AI Token Spend”
- `13:27:31` views chart “Prospects with high AI Usage (more than $50 per week) | Last 30 days AI cost | Est. AI cost | Top users by est. AI cost” (+24 more)
- `13:27:31` dashboardView · ai_token_usage — re-run, same shape (1 rows)
- `13:27:39` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:28:11` views dashboard “🪙 AI Token Spend”
- `13:28:11` views chart “Cost concentration by org | Whose AI usage are we subsidising? | Cache hit rate  | Cost by feature and model” (+24 more)
- `13:28:12` dashboardView · ai_token_usage — re-run, same shape (1 rows)
- `13:28:21` exploreView · ai_token_usage — -custom field monthly_run_rate (1 rows)
- `13:29:09` views chart “Last 30 days AI cost | Whose AI usage are we subsidising? | Cache hit rate  | Feature economics” (+24 more)
- `13:29:35` exploreView · ai_token_usage — +custom field last_30_days (1 rows)
- `13:29:52` updates chart “Last 30 days AI cost” (big_number, ai_token_usage)
- `13:29:53` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:29:54` views dashboard “🪙 AI Token Spend”
- `13:29:55` dashboardView · ai_token_usage — re-run, same shape (1 rows)
- `13:30:07` exploreView · ai_token_usage — +custom field monthly_run_rate; -custom field last_30_days (1 rows)
- `13:30:24` updates chart “Last 30 days AI cost” (big_number, ai_token_usage)
- `13:30:24` exploreView · ai_token_usage — +custom field last_30_days; -custom field monthly_run_rate (1 rows)
- `13:30:30` views dashboard “🪙 AI Token Spend”
- `13:30:30` views chart “Cache hit rate by feature  | Est. AI cost | Daily user vs background cost | Total tokens (last 7 days)” (+24 more)
- `13:30:31` dashboardView · ai_token_usage — re-run, same shape (58 queries; 1 rows)
- `13:31:00` views chart “Last 30 days AI cost | Cost by feature and model | Est. AI cost by model | Cache hit rate by feature” (+24 more)
- `13:31:01` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:31:45` updates chart “Last 30 days AI cost” (big_number, ai_token_usage)
- `13:31:45` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:31:50` views dashboard “🪙 AI Token Spend”
- `13:31:52` dashboardView · ai_token_usage — +metric ai_token_usage_unique_organizations; -metric ai_token_usage_total_cost_usd; -custom field last_30_days; sort ai_token_usage_unique_organizations desc (25 queries; 1 rows)
- `13:31:58` exploreView · ai_token_usage — +metric ai_token_usage_total_cache_savings_usd; -metric ai_token_usage_unique_organizations; sort ai_token_usage_total_cache_savings_usd desc (1 rows)
- `13:32:01` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:32:02` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:32:12` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:32:13` updates chart “Est. cache savings ” (big_number, ai_token_usage)
- `13:32:14` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:32:19` views chart “Est. cache savings  | Last 30 days AI cost | Est. AI cost | Est. AI cost by feature” (+24 more)
- `13:32:19` dashboardView · ai_token_usage — re-run, same shape (26 queries; 1 rows)
- `13:32:25` views dashboard “🪙 AI Token Spend”
- `13:32:49` saves dashboard “🪙 AI Token Spend”
- `13:32:56` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd; -metric ai_token_usage_total_cache_savings_usd; +dimension ai_token_usage_event_at_day, ai_token_usage_feature; +filter ai_token_usage_total_cost_usd greaterThan; sort ai_token_usage_event_at_day (48 rows)
- `13:33:18` views dashboard “🪙 AI Token Spend”
- `13:33:18` views chart “Daily estimated AI cost by feature | Prospects with high AI Usage (more than $50 per week) | Daily model mix (share of est. cost) | Est. AI cost by feature” (+22 more)
- `13:33:23` chartView · ai_token_usage — +metric ai_token_usage_cache_hit_rate; -metric ai_token_usage_total_cost_usd; -dimension ai_token_usage_event_at_day; -filter ai_token_usage_total_cost_usd greaterThan; sort ai_token_usage_cache_hit_rate (20 rows)
- `13:33:42` exploreView · ai_token_usage — +metric ai_token_usage_total_cost_usd; -metric ai_token_usage_cache_hit_rate; +dimension organizations_organization_name, organizations_tier, organizations_mrr; -dimension ai_token_usage_feature; +filter organizations_mrr notNull, ai_token_usage_key_management equals, margin_after_a_i lessThan; +custom field margin_after_a_i; sort margin_after_a_i, ai_token_usage_total_cost_usd desc (24 rows)
- `13:33:46` exploreView · ai_token_usage — re-run, same shape (1 rows)
- `13:33:46` exploreView · ai_token_usage — re-run, same shape (37 rows)
- `13:33:51` updates chart “Whose AI usage are we subsidising?” (cartesian, ai_token_usage)
- `13:33:51` exploreView · ai_token_usage — re-run, same shape (37 rows)
- `13:34:03` updates chart “Whose AI usage are we subsidising?” (cartesian, ai_token_usage)
- `13:34:03` exploreView · ai_token_usage — re-run, same shape (37 rows)
- `13:34:06` views dashboard “🪙 AI Token Spend”
- `13:34:06` views chart “Cache hit rate by feature  | AI spend by organization (lightdash-managed only) | Feature economics | Orgs using AI” (+24 more)
- `13:34:07` dashboardView · ai_token_usage — re-run, same shape (2 queries; 37 rows)
- `13:34:18` exploreView · ai_token_usage — +metric ai_token_usage_total_tokens_used; -dimension organizations_mrr; +filter organizations_mrr isNull, ai_token_usage_total_cost_usd greaterThan; -filter organizations_mrr notNull, margin_after_a_i lessThan; -custom field margin_after_a_i; sort ai_token_usage_total_cost_usd desc (6 rows)
- `13:34:22` exploreView · ai_token_usage — re-run, same shape (0 rows)
- `13:34:22` exploreView · ai_token_usage — re-run, same shape (8 rows)
- `13:34:27` exploreView · ai_token_usage — re-run, same shape (8 rows)
- `13:34:37` updates chart “Prospects with high AI Usage (more than $50 per week)” (cartesian, ai_token_usage)
- `13:34:38` exploreView · ai_token_usage — re-run, same shape (8 rows)
- `13:34:59` chartView · ai_token_usage — re-run, same shape (8 rows)
- … 89 more steps

## Episode 37 · 3181a3ed67 · 2026-08-24 16:07Z · 14 min · 6 steps · exploration, no save

- `16:07:42` metricsExplorer · dbt_orders — starts: metrics dbt_orders_sum_of_basket_total | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (12 queries; 2 rows)
- `16:07:43` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (4 queries; 2 rows)
- `16:11:20` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_support_requests_count_distinct_request_id (6 queries; 2 rows)
- `16:11:20` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_distinct_order_id; sort dbt_orders_order_date_month (2 queries; 5 rows)
- `16:21:00` viewUnderlyingData · dbt_orders — -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_email, dbt_orders_profit, dbt_orders_browser, dbt_orders_user_id, dbt_orders_currency, dbt_orders_order_id, dbt_orders_referrer, dbt_orders_is_sunday, dbt_orders_order_date, dbt_orders_orders_dim, dbt_orders_partner_id, dbt_orders_basket_total, dbt_orders_partner_logo, dbt_orders_partner_name, dbt_orders_selected_dim, dbt_orders_shipping_city, dbt_orders_order_date_day, dbt_orders_order_date_hour, dbt_orders_order_date_week, dbt_orders_order_date_year, dbt_orders_shipping_country, dbt_orders_order_date_period, dbt_orders_user_created_date, dbt_orders_order_date_quarter, dbt_orders_partner_commission, dbt_orders_order_date_week_num, dbt_orders_order_date_month_num, dbt_orders_order_date_month_name, dbt_orders_user_created_date_day, dbt_orders_user_created_date_raw, dbt_orders_order_date_quarter_num, dbt_orders_user_created_date_week, dbt_orders_user_created_date_year, dbt_orders_order_date_quarter_name, dbt_orders_user_created_date_month, dbt_orders_user_created_date_quarter, dbt_orders_order_date_day_of_year_num, dbt_orders_order_date_hour_of_day_num, dbt_orders_order_date_day_of_month_num, dbt_orders_order_date_day_of_week_name, dbt_orders_order_date_day_of_week_index, dbt_orders_order_date_minute_of_hour_num; +filter dbt_orders_order_date inBetween; -filter dbt_orders_order_date_day inBetween (200 rows)
- `16:21:35` viewUnderlyingData · dbt_orders — -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_email, dbt_orders_profit, dbt_orders_browser, dbt_orders_user_id, dbt_orders_currency, dbt_orders_order_id, dbt_orders_referrer, dbt_orders_is_sunday, dbt_orders_order_date, dbt_orders_orders_dim, dbt_orders_partner_id, dbt_orders_basket_total, dbt_orders_partner_logo, dbt_orders_partner_name, dbt_orders_selected_dim, dbt_orders_shipping_city, dbt_orders_order_date_day, dbt_orders_order_date_hour, dbt_orders_order_date_week, dbt_orders_order_date_year, dbt_orders_shipping_country, dbt_orders_order_date_period, dbt_orders_user_created_date, dbt_orders_order_date_quarter, dbt_orders_partner_commission, dbt_orders_order_date_week_num, dbt_orders_order_date_month_num, dbt_orders_order_date_month_name, dbt_orders_user_created_date_day, dbt_orders_user_created_date_raw, dbt_orders_order_date_quarter_num, dbt_orders_user_created_date_week, dbt_orders_user_created_date_year, dbt_orders_order_date_quarter_name, dbt_orders_user_created_date_month, dbt_orders_user_created_date_quarter, dbt_orders_order_date_day_of_year_num, dbt_orders_order_date_hour_of_day_num, dbt_orders_order_date_day_of_month_num, dbt_orders_order_date_day_of_week_name, dbt_orders_order_date_day_of_week_index, dbt_orders_order_date_minute_of_hour_num; +filter dbt_orders_order_date inBetween, dbt_orders_partner_name equals; -filter dbt_orders_order_date_day inBetween (200 rows)

## Episode 38 · 41fbf7ad10 · 2026-08-25 13:41Z · 18 min · 98 steps · exploration→save

- `13:41:28` metricsExplorer · dbt_orders — starts: metrics dbt_orders_count_distinct_order_id | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (6 queries; 2 rows)
- `13:41:28` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_distinct_order_id (2 queries; 2 rows)
- `13:47:12` views dashboard “🧭 KPI dashboard”
- `13:47:12` views chart “Weekly orders over the last 3 months | What is our total profit? | How many users were created each month? | Partner metrics overview” (+12 more)
- `13:47:13` dashboardView · dbt_orders — +metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_week; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_day inThePast; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_week (13 queries; 14 rows)
- `13:48:00` asks agent: “How come we're doing so well?”
- `13:48:06` ai · dbt_baskets — +metric dbt_baskets_sum_of_basket_total; -metric dbt_orders_count_of_order_id, dbt_orders_sum_of_profit; +dimension dbt_baskets_order_date_month; -dimension dbt_orders_order_date_week; -filter dbt_orders_order_date_day inThePast; sort dbt_baskets_sum_of_basket_total desc (25 rows)
- `13:48:06` views chart “What is our monthly revenue? | How many users were created each month? | What is our average order value? | Top 5 products by revenue” (+4 more)
- `13:48:07` views dashboard “🧭 KPI dashboard”
- `13:48:17` ai · dbt_users — +metric dbt_users_count_of_user_id; -metric dbt_baskets_sum_of_basket_total; +dimension dbt_users_created_date_month; -dimension dbt_baskets_order_date_month; sort dbt_users_created_date_month desc (25 rows)
- `13:48:17` ai · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_users_count_of_user_id; +dimension dbt_orders_order_date_month; -dimension dbt_users_created_date_month; sort dbt_orders_order_date_month desc (25 rows)
- `13:48:17` ai · dbt_baskets — +metric dbt_baskets_sum_of_basket_total, dbt_baskets_average_of_basket_total; -metric dbt_orders_average_of_basket_total; +dimension dbt_baskets_product_name; -dimension dbt_orders_order_date_month; sort dbt_baskets_sum_of_basket_total desc (5 rows)
- `13:48:17` ai · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_baskets_sum_of_basket_total, dbt_baskets_average_of_basket_total; +dimension dbt_orders_partner_name; -dimension dbt_baskets_product_name; sort dbt_orders_sum_of_basket_total desc (9 rows)
- `13:48:23` asks agent: “Build me a simple dashboard on customer success”
- `13:48:41` ai · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_orders_sum_of_basket_total; +dimension dbt_orders_order_date_month; -dimension dbt_orders_partner_name; sort dbt_orders_order_date_month (25 rows)
- `13:48:44` ai · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_orders_count_distinct_order_id; +dimension dbt_orders_referrer; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_month inThePast; sort dbt_orders_sum_of_basket_total desc (6 rows)
- `13:49:03` ai · dbt_orders — re-run, same shape (6 rows)
- `13:49:03` ai · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_orders_sum_of_basket_total; +dimension dbt_orders_order_date_month; -dimension dbt_orders_referrer; -filter dbt_orders_order_date_month inThePast; sort dbt_orders_order_date_month (25 rows)
- `13:49:03` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_distinct_order_id; +filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_month desc (4 queries; 2 rows)
- `13:49:03` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_support_requests_count_distinct_request_id; sort dbt_orders_order_date_month (12 queries; 13 rows)
- `13:49:06` views dashboard “🧭 KPI dashboard”
- `13:49:09` ai · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_orders_count_distinct_order_id; +dimension dbt_orders_shipping_city; -dimension dbt_orders_order_date_month; +filter dbt_orders_order_date_month inThePast; -filter dbt_orders_order_date_day inBetween; sort dbt_orders_sum_of_basket_total desc (5 rows)
- `13:49:17` ai · dbt_orders — re-run, same shape (5 rows)
- `13:50:16` ai · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total; -dimension dbt_orders_shipping_city; -filter dbt_orders_order_date_month inThePast (1 rows)
- `13:50:17` ai · dbt_support_requests — +dimension dbt_support_requests_request_date_month; sort dbt_support_requests_request_date_month (24 rows)
- `13:50:18` ai · dbt_support_requests — +dimension dbt_support_requests_reason; -dimension dbt_support_requests_request_date_month; sort dbt_support_requests_count_distinct_request_id desc (4 rows)
- `13:50:50` saves dashboard “Customer Success”
- `13:50:50` views dashboard “Customer Success”
- `13:51:13` metricsExplorer · dbt_orders — +metric dbt_orders_count_distinct_order_id; -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_order_date_month; -dimension dbt_support_requests_reason; +filter dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_month (6 queries; 13 rows)
- `13:51:13` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_count_distinct_order_id; sort dbt_orders_order_date_month desc (2 queries; 2 rows)
- `13:51:23` views dashboard “🧭 KPI dashboard”
- `13:51:31` saves dashboard “Customer success dashboard”
- `13:51:31` creates chart “Total Support Tickets” (big_number, dbt_support_requests)
- `13:51:31` views chart “Total Support Tickets | How many users were created each month? | What is our average order value? | What is our total profit?” (+10 more)
- `13:51:32` views dashboard “KPI Dashboard – Overview Highlights”
- `13:51:33` saves dashboard “Customer success dashboard”
- `13:51:33` creates chart “Customer Satisfaction Score” (big_number, dbt_support_requests)
- `13:51:33` dashboardView · dbt_orders — +metric dbt_orders_average_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween (5 queries; 25 rows)
- `13:51:35` saves dashboard “Customer success dashboard”
- `13:51:35` creates chart “Customers Needing Support” (big_number, dbt_support_requests)
- `13:51:37` saves dashboard “Customer success dashboard”
- `13:51:37` creates chart “Support Tickets per Customer” (big_number, dbt_support_requests)
- `13:51:41` saves dashboard “Customer success dashboard”
- `13:51:41` creates chart “Support Tickets Trend” (cartesian, dbt_support_requests)
- `13:51:43` saves dashboard “Customer success dashboard”
- `13:51:43` creates chart “Support Tickets by Reason” (cartesian, dbt_support_requests)
- `13:52:07` views dashboard “Customer success dashboard”
- `13:52:08` views dashboard “Customer Success”
- `13:52:09` asks agent: “Can we rearrange this to be better on mobile. And make all of the colours blues and greys”
- `13:52:14` views dashboard “KPI Dashboard – Overview Highlights”
- `13:52:23` views dashboard “🧭 KPI dashboard”
- `13:52:34` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_average_of_basket_total; +filter dbt_orders_order_date_day inBetween; sort dbt_orders_order_date_month (2 queries; 5 rows)
- `13:52:34` metricsExplorer · dbt_orders — +metric dbt_orders_sum_of_basket_total; -metric dbt_support_requests_count_distinct_request_id; sort dbt_orders_order_date_month desc (6 queries; 2 rows)
- `13:52:37` views chart “What is our average order value? | What is our monthly revenue? | What is our total profit? | Weekly orders over the last 3 months” (+4 more)
- `13:52:41` updates chart “Total Support Tickets” (big_number, dbt_support_requests)
- `13:52:41` updates chart “Customer Satisfaction Score” (big_number, dbt_support_requests)
- `13:52:41` updates chart “Customers Needing Support” (big_number, dbt_support_requests)
- `13:52:41` updates chart “Support Tickets per Customer” (big_number, dbt_support_requests)
- `13:52:41` updates chart “Support Tickets Trend” (cartesian, dbt_support_requests)
- `13:52:41` updates chart “Support Tickets by Reason” (cartesian, dbt_support_requests)
- `13:52:41` saves dashboard “Customer Success”
- `13:52:53` exploreView · dbt_baskets — +metric dbt_baskets_sum_of_basket_total; -metric dbt_orders_sum_of_basket_total; +dimension dbt_baskets_partner_name; -dimension dbt_orders_order_date_month; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_baskets_sum_of_basket_total desc (9 rows)
- `13:53:33` exploreView · dbt_baskets — +metric dbt_baskets_partner_commission_average_partner_commission, partner_commission_average_partner_commission (9 rows)
- `13:54:42` views dashboard “KPI Dashboard – Overview Highlights”
- `13:55:07` views dashboard “KPI Dashboard – Overview Highlights”
- `13:55:08` updates chart “What is our average order value?” (big_number, dbt_orders)
- `13:55:08` updates chart “What is our monthly revenue?” (data_app_viz, dbt_baskets)
- `13:55:08` updates chart “What is our total profit?” (data_app_viz, dbt_orders)
- `13:55:08` updates chart “How many users were created each month?” (cartesian, dbt_users)
- `13:55:08` updates chart “Weekly orders over the last 3 months” (cartesian, dbt_orders)
- `13:55:08` saves dashboard “KPI Dashboard – Overview Highlights”
- `13:55:09` updates chart “Weekly orders over the last 3 months” (cartesian, dbt_orders)
- `13:55:09` views chart “What is our total profit? | How many users were created each month? | Weekly orders over the last 3 months | What is our monthly revenue?” (+4 more)
- `13:55:10` dashboardView · dbt_baskets — -metric dbt_baskets_partner_commission_average_partner_commission, partner_commission_average_partner_commission; +dimension dbt_baskets_order_date_month; -dimension dbt_baskets_partner_name (8 queries; 25 rows)
- `13:55:11` updates chart “How many users were created each month?” (cartesian, dbt_users)
- `13:55:13` updates chart “What is our total profit?” (data_app_viz, dbt_orders)
- `13:56:11` updates chart “What is our monthly revenue?” (data_app_viz, dbt_baskets)
- `13:56:11` updates chart “Weekly orders over the last 3 months” (cartesian, dbt_orders)
- `13:56:11` updates chart “What is our total profit?” (data_app_viz, dbt_orders)
- `13:56:11` updates chart “How many users were created each month?” (cartesian, dbt_users)
- … 18 more steps

## Episode 39 · e2d90289f5 · 2026-08-25 15:14Z · 5 min · 8 steps · exploration, no save

- `15:14:30` metricsExplorer · linear_customer_requests — starts: metrics linear_customer_requests_important_requests | by linear_customer_requests_created_at_month | where linear_customer_requests_created_at_day inBetween; linear_customer_requests_created_at_day inBetween (2 queries; 2 rows)
- `15:14:30` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `15:15:05` exploreView · users — -metric organizations_daily_total_queries_executed; +dimension users_full_name, users_email; -dimension organizations_daily_date_month; +filter users_user_id equals; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort users_full_name (1 rows)
- `15:17:04` exploreView · users — re-run, same shape (1 rows)
- `15:17:27` exploreView · users — re-run, same shape (1 rows)
- `15:18:12` exploreView · users — re-run, same shape (1 rows)
- `15:18:36` exploreView · users — re-run, same shape (1 rows)
- `15:19:05` exploreView · users — re-run, same shape (1 rows)

## Episode 40 · 94db644e3b · 2026-08-26 11:08Z · 0 min · 2 steps · exploration, no save

- `11:08:21` exploreView · billing_customers — starts: by billing_customers_mrr_usd (90 rows)
- `11:08:21` exploreView · billing_customers — re-run, same shape (90 rows)

## Episode 41 · 5452ad558d · 2026-08-26 14:06Z · 3 min · 7 steps · exploration, no save

- `14:06:36` exploreView · deals — starts: metrics deals_new_deals (1 rows)
- `14:06:38` exploreView · deals — +dimension deals_created_date_year (3 rows)
- `14:08:22` exploreView · deals — +metric deals_new_deals__pop__year_1__izefmq, new_deals__pop__year_1__izefmq (3 rows)
- `14:08:27` exploreView · deals — +filter deals_created_date_year equals (1 rows)
- `14:09:21` views dashboard “Training Dash”
- `14:09:22` views chart “How many deals are associated with leads by quarter? | How many unique accounts exist in each market segment? | Leads Converted to Deals by Month — Last Year” (+2 more)
- `14:09:23` dashboardView · leads — +metric leads_deal_count; -metric deals_new_deals, deals_new_deals__pop__year_1__izefmq, new_deals__pop__year_1__izefmq; +dimension leads_created_at_quarter; -dimension deals_created_date_year; +filter leads_industry equals; -filter deals_created_date_year equals; sort leads_created_at_quarter desc (3 queries; 0 rows)

## Episode 42 · 4e0a7fc082 · 2026-08-27 14:39Z · 17 min · 11 steps · exploration, no save

- `14:39:18` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `14:39:18` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month (2 queries; 12 rows)
- `14:41:09` exploreView · chart_usage — +metric chart_usage_chart_view_events; -metric linear_customer_requests_important_requests; +dimension charts_created_at_week, chart_usage_chart_type; -dimension linear_customer_requests_created_at_month; -filter linear_customer_requests_created_at_day inBetween; sort charts_created_at_week desc (500 rows)
- `14:48:54` exploreView · chart_usage — re-run, same shape (500 rows)
- `14:51:15` exploreView · chart_usage — re-run, same shape (225 rows)
- `14:51:15` exploreView · chart_usage — re-run, same shape (500 rows)
- `14:52:45` exploreView · cli_usage — +metric cli_usage_total_events; -metric chart_usage_chart_view_events; +dimension cli_usage_event_at_month, cli_usage_command; -dimension charts_created_at_week, chart_usage_chart_type; +filter cli_usage_event_at inThePast; sort cli_usage_event_at_month desc (491 rows)
- `14:54:10` exploreView · cli_usage — +dimension command_first_word; -dimension cli_usage_command; +custom field Command first word (484 rows)
- `14:54:39` exploreView · cli_usage — re-run, same shape (ERROR Bigquery warehouse error: invalidQuery - Array index 1 is out of bounds (overflo)
- `14:55:53` exploreView · cli_usage — +dimension projects_warehouse_type_latest; -dimension command_first_word; -custom field Command first word (43 rows)
- `14:56:09` exploreView · cli_usage — re-run, same shape (43 rows)

## Episode 43 · 4e0a7fc082 · 2026-08-27 17:23Z · 19 min · 14 steps · exploration, no save

- `17:23:02` metricsExplorer · deals — starts: metrics deals_total_amount | by deals_created_date_month | where deals_created_date_month inBetween (3 queries; 13 rows)
- `17:27:01` views chart “How many leads did each SDR contact and convert from LinkedIn, Facebook Ads, and Google Ads in the past 8 months? | Performance Marketing Metrics | Cost Per Conversion | Leads Generated” (+11 more)
- `17:27:17` views dashboard “LumaLeaf GTM Strategy”
- `17:27:35` chartView · deals — +metric deals_unique_deals; -metric deals_total_amount; +dimension deals_stage, deals_stage_order; -dimension deals_created_date_month; -filter deals_created_date_month inBetween; sort deals_stage_order desc (8 rows)
- `17:28:44` metricsExplorer · deals — +metric deals_total_amount; -metric deals_unique_deals; +dimension deals_created_date_month; -dimension deals_stage, deals_stage_order; +filter deals_created_date_month inBetween (13 rows)
- `17:28:46` views dashboard “LumaLeaf GTM Strategy”
- `17:28:47` views chart “Total Spend & ROI | Avg Call Time + Total Calls per SDR | Performance Marketing Metrics | SDR Leadership Board” (+26 more)
- `17:30:54` views dashboard “Plumly Sales”
- `17:30:55` views chart “How many unique leads are in each stage of the sales funnel? | Pipeline Value | Closed Won Value | Win Rate” (+13 more)
- `17:30:55` dashboardView · deals — +filter deals_stage equals, deals_created_date_month inThePast, accounts_industry equals; -filter deals_created_date_month inBetween; sort deals_total_amount desc (13 queries; 12 rows)
- `17:37:09` views chart “How has maximum call time trended by SDR over the past 8 months? | How many new deals are created each month?” (+1 more)
- `17:37:22` chartView · deals — +metric deals_new_deals; -metric deals_total_amount; -filter deals_stage equals, deals_created_date_month inThePast, accounts_industry equals; sort deals_created_date_month desc (26 rows)
- `17:38:37` exploreView · deals — re-run, same shape (26 rows)
- `17:41:46` exploreView · deals — re-run, same shape (26 rows)

## Episode 44 · 8789ac9708 · 2026-08-27 17:25Z · 0 min · 4 steps · exploration, no save

- `17:25:21` metricsExplorer · dbt_orders — starts: metrics dbt_orders_sum_of_basket_total | by dbt_orders_order_date_month | where dbt_orders_order_date_day inBetween; dbt_orders_order_date_day inBetween (6 queries; 2 rows)
- `17:25:21` metricsExplorer · dbt_support_requests — +metric dbt_support_requests_count_distinct_request_id; -metric dbt_orders_sum_of_basket_total (2 queries; 2 rows)
- `17:25:28` exploreView · dbt_orders — -metric dbt_support_requests_count_distinct_request_id; +dimension dbt_orders_browser; -dimension dbt_orders_order_date_month; -filter dbt_orders_order_date_day inBetween, dbt_orders_order_date_day inBetween; sort dbt_orders_browser (7 rows)
- `17:25:30` exploreView · dbt_orders — +metric dbt_orders_sum_of_basket_total (7 rows)

## Episode 45 · cb2d4ce1d8 · 2026-08-28 09:23Z · 2 min · 5 steps · exploration, no save

- `09:23:07` metricsExplorer · linear_customer_requests — starts: metrics linear_customer_requests_important_requests | by linear_customer_requests_created_at_month | where linear_customer_requests_created_at_day inBetween; linear_customer_requests_created_at_day inBetween (2 queries; 2 rows)
- `09:23:08` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `09:23:36` exploreView · github_activity — +metric github_activity_average_job_duration_minutes; -metric organizations_daily_total_queries_executed; +dimension github_activity_created_at_day, github_activity_job_name; -dimension organizations_daily_date_month; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort github_activity_created_at_day desc (500 rows)
- `09:23:50` exploreView · github_activity — +filter github_activity_created_at inThePast, github_activity_job_name equals (26 rows)
- `09:24:44` exploreView · github_activity — re-run, same shape (64 rows)

## Episode 46 · f6344dd890 · 2026-09-02 07:52Z · 3 min · 3 steps · exploration, no save

- `07:52:45` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `07:53:45` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `07:55:54` sqlRunner · sql_query_explorer — runs SQL (500 rows)

## Episode 47 · ebf5bfc5ab · 2026-09-02 08:15Z · 51 min · 40 steps · exploration, no save

- `08:15:16` metricsExplorer · linear_customer_requests — starts: metrics linear_customer_requests_important_requests | by linear_customer_requests_created_at_month | where linear_customer_requests_created_at_day inBetween; linear_customer_requests_created_at_day inBetween (2 queries; 2 rows)
- `08:15:16` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `08:16:35` metricsExplorer · organizations_daily — sort organizations_daily_date_month (2 queries; 13 rows)
- `08:16:35` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month (2 queries; 12 rows)
- `08:16:44` metricsExplorer · ai_token_usage — +metric ai_token_usage_total_cost_usd; -metric linear_customer_requests_important_requests; +dimension ai_token_usage_event_at_day; -dimension linear_customer_requests_created_at_month; +filter ai_token_usage_event_at_day inBetween; -filter linear_customer_requests_created_at_day inBetween (31 rows)
- `08:17:30` exploreView · custom_chart_types — -metric ai_token_usage_total_cost_usd; +dimension custom_chart_types_iteration_count, custom_chart_types_created_by_user_id; -dimension ai_token_usage_event_at_day; -filter ai_token_usage_event_at_day inBetween; sort custom_chart_types_iteration_count (153 rows)
- `08:30:34` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; +dimension linear_customer_requests_created_at_month; -dimension custom_chart_types_iteration_count, custom_chart_types_created_by_user_id; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `08:30:34` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `08:31:04` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `08:31:12` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `08:31:22` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `08:31:38` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `08:31:41` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `08:31:57` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `08:32:14` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `08:32:14` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `08:41:21` chartView · ai_token_usage — +metric ai_token_usage_total_cost_usd, last_self_managed_call; -metric linear_customer_requests_important_requests; +dimension ai_token_usage_key_management, organizations_organization_name, organizations_organization_id; -dimension linear_customer_requests_created_at_month; +filter ai_token_usage_event_at_raw inThePast, organizations_organization_name isNull; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort ai_token_usage_total_cost_usd desc (2 rows)
- `08:41:21` chartView · data_app_usage — +metric data_app_usage_total_events; -metric ai_token_usage_total_cost_usd, last_self_managed_call; +dimension data_app_usage_timestamp_week, data_app_usage_event_family; -dimension ai_token_usage_key_management, organizations_organization_name, organizations_organization_id; -filter ai_token_usage_event_at_raw inThePast, organizations_organization_name isNull; sort data_app_usage_timestamp_week (39 rows)
- `08:41:21` views chart “AI Token Spend - no org name | Weekly Data App Usage by Event Family | Which browser drives the most page views? | How many PRs were merged this week?” (+12 more)
- `08:41:23` chartView · pages — +metric pages_total_page_views; -metric data_app_usage_total_events; +dimension pages_browser; -dimension data_app_usage_timestamp_week, data_app_usage_event_family; sort pages_total_page_views desc (8 rows)
- `08:41:23` views dashboard “🚛 Engineering velocity”
- `08:41:24` dashboardView · github_activity — +metric github_activity_merged_prs; -metric pages_total_page_views; +dimension github_activity_merged_at_week; -dimension pages_browser; +filter github_activity_merged_at_week inThePast, github_activity_actor_team equals; sort github_activity_merged_at_week desc (10 queries; 2 rows)
- `08:42:05` views dashboard “🟣 AI Usage”
- `08:42:05` views dashboard “🚛 Engineering velocity”
- `08:42:06` views chart “Prompts created over time | Average files changed per PR this week | Number of deployments | How has cycle time changed in the last 2 months?” (+12 more)
- `08:42:06` dashboardView · ai_agent_usage — +metric ai_agent_usage_count_events, ai_agent_usage_count_events_pop_28d, count_events_pop_28d; -metric github_activity_merged_prs; +dimension ai_agent_usage_event_at_day; -dimension github_activity_merged_at_week; +filter ai_agent_usage_event_family equals, organizations_organization_name notEquals; -filter github_activity_merged_at_week inThePast, github_activity_actor_team equals; +custom field trailing_28_day_total_prompts, trailing_28_day_total_prompts_lagged_28_days_, increase_compared_to_28_days_ago (13 queries; 29 rows)
- `08:42:36` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric ai_agent_usage_count_events, ai_agent_usage_count_events_pop_28d, count_events_pop_28d; +dimension linear_customer_requests_created_at_month; -dimension ai_agent_usage_event_at_day; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter ai_agent_usage_event_family equals, organizations_organization_name notEquals; -custom field trailing_28_day_total_prompts, trailing_28_day_total_prompts_lagged_28_days_, increase_compared_to_28_days_ago; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `08:42:36` metricsExplorer · organizations_daily — +metric organizations_daily_total_queries_executed; -metric linear_customer_requests_important_requests; +dimension organizations_daily_date_month; -dimension linear_customer_requests_created_at_month; +filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort organizations_daily_date_month desc (2 queries; 2 rows)
- `08:42:42` asks agent: “How many support tickets were opened this week”
- `08:42:57` ai · pylon_issues — +metric pylon_issues_total_issues; -metric organizations_daily_total_queries_executed; +dimension pylon_issues_created_at_day; -dimension organizations_daily_date_month; +filter pylon_issues_created_at inTheCurrent; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort pylon_issues_created_at_day (2 rows)
- `08:42:59` ai · pylon_issues — re-run, same shape (2 rows)
- `08:43:02` ai · pylon_issues — re-run, same shape (2 rows)
- `08:50:17` views chart “Average deploy stacks time | Monthly GitHub issues and Merged PRs vs prior year | Monthly new AI agents | Weekly AI agent updates” (+33 more)
- `08:50:17` dashboardView · github_activity — +metric github_activity_average_duration_minutes; -metric pylon_issues_total_issues; +dimension github_activity_created_at_week; -dimension pylon_issues_created_at_day; +filter github_activity_workflow_name equals, github_activity_conclusion equals, github_activity_created_at_month inThePast, github_activity_record_type equals, github_activity_actor_team equals; -filter pylon_issues_created_at inTheCurrent; sort github_activity_created_at_week desc (51 queries; 49 rows)
- `08:50:24` views dashboard “🟣 AI Usage”
- `08:50:24` views dashboard “🌩️ Support Metrics”
- `09:05:16` sqlRunner · sql_query_explorer — runs SQL (0 rows)
- `09:05:30` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `09:05:55` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `09:06:05` sqlRunner · sql_query_explorer — runs SQL (500 rows)

## Episode 48 · 41fbf7ad10 · 2026-09-02 15:59Z · 3 min · 13 steps · exploration→save

- `15:59:54` views dashboard “[customer] Usage”
- `15:59:55` views chart “What is the weekly AI agent usage and overage cost for the past 12 weeks? | What are the monthly embedded chart views over the past 3 months?” (+1 more)
- `15:59:56` dashboardView · organizations_daily — starts: metrics organizations_daily_sum_embedded_chart_views_num | by organizations_daily_date_month | where organizations_daily_organization_id equals; organizations_daily_date inThePast | custom embedded_chart_views_cost (2 queries; 4 rows)
- `16:00:08` exploreView · ai_agent_usage — +metric ai_agent_usage_count_tool_calls, ai_agent_usage_count_prompts; -metric organizations_daily_sum_embedded_chart_views_num; +dimension ai_agent_usage_event_at_month; -dimension organizations_daily_date_month; +filter ai_agent_usage_organization_id equals, ai_agent_usage_event_at inThePast; -filter organizations_daily_organization_id equals, organizations_daily_date inThePast; +custom field overage_cost; -custom field embedded_chart_views_cost; sort ai_agent_usage_event_at_month desc (3 rows)
- `16:00:36` exploreView · ai_agent_usage — re-run, same shape (3 rows)
- `16:00:41` exploreView · ai_agent_usage — re-run, same shape (3 rows)
- `16:00:41` exploreView · ai_agent_usage — sort ai_agent_usage_event_at_month desc (3 rows)
- `16:00:41` views chart “What is the weekly AI agent usage and overage cost for the past 12 weeks?”
- `16:02:43` updates chart “What is the weekly AI agent usage and overage cost for the past 12 weeks?” (table, ai_agent_usage)
- `16:02:43` exploreView · ai_agent_usage — re-run, same shape (3 rows)
- `16:02:47` views dashboard “[customer] Usage”
- `16:02:48` views chart “What is the weekly AI agent usage and overage cost for the past 12 weeks? | What are the monthly embedded chart views over the past 3 months?” (+1 more)
- `16:02:48` dashboardView · ai_agent_usage — re-run, same shape (3 rows)

## Episode 49 · 435e680b72 · 2026-09-03 08:54Z · 0 min · 5 steps · exploration, no save

- `08:54:34` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (2 queries; 2 rows)
- `08:54:34` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (2 queries; 2 rows)
- `08:54:42` exploreView · chart_usage — -metric linear_customer_requests_important_requests; +dimension chart_usage_project_id; -dimension linear_customer_requests_created_at_month; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween (500 rows)
- `08:54:42` exploreView · chart_usage — sort chart_usage_project_id (500 rows)
- `08:54:42` exploreView · chart_usage — +dimension chart_usage_virtual_view_id (500 rows)

## Episode 50 · ebf5bfc5ab · 2026-09-03 09:45Z · 1 min · 7 steps · exploration, no save

- `09:45:09` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween; organizations_daily_date_day inBetween (4 queries; 2 rows)
- `09:45:09` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween, organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month desc (4 queries; 2 rows)
- `09:45:23` exploreView · dashboards — -metric linear_customer_requests_important_requests; +dimension dashboards_is_deleted; -dimension linear_customer_requests_created_at_month; -filter linear_customer_requests_created_at_day inBetween, linear_customer_requests_created_at_day inBetween; sort dashboards_is_deleted (2 rows)
- `09:45:24` exploreView · dashboards — +metric dashboards_count_dashboards (2 rows)
- `09:45:56` sqlRunner · sql_query_explorer — runs SQL (500 rows)
- `09:46:08` metricsExplorer · organizations_daily — starts: metrics organizations_daily_total_queries_executed | by organizations_daily_date_month | where organizations_daily_date_day inBetween (2 queries; 13 rows)
- `09:46:08` metricsExplorer · linear_customer_requests — +metric linear_customer_requests_important_requests; -metric organizations_daily_total_queries_executed; +dimension linear_customer_requests_created_at_month; -dimension organizations_daily_date_month; +filter linear_customer_requests_created_at_day inBetween; -filter organizations_daily_date_day inBetween; sort linear_customer_requests_created_at_month (2 queries; 13 rows)

