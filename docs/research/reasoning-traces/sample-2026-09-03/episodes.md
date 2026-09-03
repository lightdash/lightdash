# Analysis episodes · 50 of 2430 · gap 20 min · Lightdash internal organisation, 30 days to 2026-09-03, telemetry variant

User ids are a 10-character hash. Customer names in chart or dashboard titles are replaced by [customer]. Query steps show field counts, not field names: telemetry does not carry field ids.

## Episode 1 · 555ac5650c · 2026-08-04 15:00Z · 65 min · 80 steps · exploration, no save

- `15:00:03` metricsExplorer · dbt_orders — starts: 1 metric, 1 dimension, 2 filters (6 queries)
- `15:00:03` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:09:35` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `15:09:35` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:10:23` asks agent: “”
- `15:10:49` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:10:49` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `15:10:51` views dashboard “🧭 KPI dashboard”
- `15:10:52` views chart “How much revenue are we making each month?” (+12 more)
- `15:10:53` ai · dbt_orders — -1 filter; +1 sort
- `15:10:53` dashboardView · dbt_orders — +4 metrics; +1 dimension; +1 filter; -1 sort (10 queries)
- `15:10:53` dashboardView · dbt_baskets — -4 metrics; -1 filter (2 queries)
- `15:10:53` dashboardView · dbt_users — -1 dimension
- `15:11:17` asks agent: “”
- `15:11:26` views chart “None”
- `15:11:26` views dashboard “🧭 KPI dashboard”
- `15:11:31` ai · dbt_orders — +1 filter; +1 sort
- `15:12:03` ai · dbt_orders — -1 filter
- `15:12:19` ai · dbt_orders — +1 metric
- `15:12:34` exploreView · dbt_orders — -1 metric
- `15:12:38` ai · dbt_orders — +1 metric
- `15:12:58` exploreView · dbt_orders — re-run, same shape
- `15:12:59` ai · dbt_orders — +1 filter
- `15:13:31` exploreView · dbt_orders — -1 filter; +1 table calc
- `15:13:54` exploreView · dbt_orders — re-run, same shape
- `15:16:08` metricsExplorer · dbt_orders — -1 metric; +1 filter; -1 sort; -1 table calc (12 queries)
- `15:16:08` metricsExplorer · dbt_support_requests — re-run, same shape (4 queries)
- `15:16:11` views dashboard “🧭 KPI dashboard”
- `15:16:12` views chart “How much revenue are we making each month?” (+12 more)
- `15:16:13` dashboardView · dbt_users — -1 filter
- `15:16:13` dashboardView · dbt_orders — +4 metrics; +1 dimension; +1 filter (10 queries)
- `15:16:13` dashboardView · dbt_baskets — -4 metrics; -1 filter (2 queries)
- `15:17:02` metricsExplorer · dbt_orders — +1 metric; -1 dimension (2 queries)
- `15:17:39` metricsExplorer · dbt_users — -1 metric; +1 filter (4 queries)
- `15:17:42` metricsExplorer · dbt_orders_no_preagg — re-run, same shape (2 queries)
- `15:18:55` metricsExplorer · dbt_users — re-run, same shape (2 queries)
- `15:18:57` metricsExplorer · dbt_orders_no_preagg — re-run, same shape (2 queries)
- `15:19:12` metricsExplorer · dbt_orders_no_preagg — re-run, same shape
- `15:19:26` metricsExplorer · dbt_orders — re-run, same shape (7 queries)
- `15:19:48` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:20:46` views dashboard “🧭 KPI dashboard”
- `15:20:47` views chart “How much revenue are we making each month?” (+12 more)
- `15:21:18` metricsExplorer · dbt_orders — re-run, same shape (12 queries)
- `15:21:18` metricsExplorer · dbt_support_requests — re-run, same shape (4 queries)
- `15:21:57` exploreView · dbt_orders — -2 filters; +1 sort
- `15:22:11` exploreView · dbt_orders — +1 metric
- `15:22:25` exploreView · dbt_orders — +1 filter
- `15:24:08` exploreView · dbt_orders — +1 metric; +1 custom metric
- `15:29:28` views chart “None”
- `15:30:43` metricsExplorer · dbt_orders — -2 metrics; +1 filter; -1 sort; -1 custom metric (8 queries)
- `15:30:43` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:31:00` metricsExplorer · dbt_orders — re-run, same shape (10 queries)
- `15:31:00` metricsExplorer · dbt_support_requests — re-run, same shape (4 queries)
- `15:32:21` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:32:21` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `15:34:10` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:34:10` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `15:35:41` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `15:35:41` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:36:38` views chart “None” (+7 more)
- `15:36:38` views dashboard “Copy of Partner Performance — Executive View”
- `15:36:39` dashboardView · dbt_orders — +1 dimension; -2 filters (8 queries)
- `15:37:31` metricsExplorer · dbt_orders — -1 dimension; +2 filters (6 queries)
- `15:37:31` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:37:35` views chart “How much revenue are we making each month?” (+21 more)
- `15:37:35` views dashboard “🧭 KPI dashboard”
- `15:37:36` dashboardView · dbt_orders — +4 metrics; +1 dimension (14 queries)
- `15:37:36` dashboardView · dbt_users — -4 metrics; -1 dimension; -1 filter (2 queries)
- `15:37:36` dashboardView · dbt_baskets — +2 metrics; +1 dimension (4 queries)
- `15:37:38` dashboardView · dbt_support_requests — -2 metrics; -1 filter (2 queries)
- `15:38:34` exploreView · dbt_orders — +1 metric; -1 dimension; +2 filters; +1 sort
- `15:39:00` views chart “How much revenue are we making each month?” (+16 more)
- `15:49:52` metricsExplorer · dbt_orders — -1 metric; -1 sort (6 queries)
- `15:49:52` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `15:52:17` views dashboard “🧭 KPI dashboard”
- `15:52:17` ai · dbt_orders — +1 metric; +1 sort
- `15:55:30` metricsExplorer · dbt_support_requests — -1 metric; -1 sort (2 queries)
- `15:55:30` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `16:05:23` metricsExplorer · dbt_orders — re-run, same shape (12 queries)
- `16:05:23` metricsExplorer · dbt_support_requests — re-run, same shape (4 queries)

## Episode 2 · 4754d59202 · 2026-08-04 15:29Z · 0 min · 4 steps · exploration, no save

- `15:29:01` exploreView · deals — starts: 1 metric, 2 dimensions
- `15:29:09` exploreView · deals — re-run, same shape
- `15:29:16` exploreView · deals — re-run, same shape
- `15:29:16` exploreView · deals — re-run, same shape

## Episode 3 · 86b2015856 · 2026-08-05 09:33Z · 43 min · 63 steps · exploration, no save

- `09:33:52` metricsExplorer · dbt_orders — starts: 1 metric, 1 dimension, 2 filters (6 queries)
- `09:33:52` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:38:30` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `09:38:30` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:49:12` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `09:49:12` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:49:37` exploreView · dbt_orders — +1 dimension; -2 filters; +1 sort
- `09:49:56` exploreView · dbt_orders — re-run, same shape
- `09:50:04` exploreView · dbt_orders — re-run, same shape
- `09:50:04` exploreView · dbt_orders — re-run, same shape
- `09:50:15` metricsExplorer · dbt_orders — -1 dimension; +2 filters; -1 sort (6 queries)
- `09:50:15` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:50:25` asks agent: “”
- `09:50:46` ai · dbt_orders — +1 dimension; -2 filters; +1 sort
- `09:50:48` ai · dbt_orders — re-run, same shape
- `09:52:09` ai · dbt_orders — re-run, same shape
- `09:52:35` asks agent: “”
- `09:54:14` asks agent: “”
- `09:54:28` ai · dbt_orders — +3 metrics; -1 dimension
- `09:54:31` ai · dbt_orders — re-run, same shape
- `09:57:10` metricsExplorer · dbt_orders — -3 metrics; +2 filters; -1 sort (6 queries)
- `09:57:10` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:57:14` views chart “How much revenue are we making each month?” (+12 more)
- `09:57:14` views dashboard “🧭 KPI dashboard”
- `09:57:15` dashboardView · dbt_users — -1 filter
- `09:57:15` dashboardView · dbt_baskets — +1 dimension (2 queries)
- `09:57:15` dashboardView · dbt_orders — +4 metrics; +1 filter (10 queries)
- `10:03:15` metricsExplorer · dbt_orders — -4 metrics; -1 dimension (6 queries)
- `10:03:15` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `10:03:36` ai · dbt_orders — +3 metrics; -2 filters; +1 sort
- `10:06:31` metricsExplorer · dbt_orders — -3 metrics; +2 filters; -1 sort (6 queries)
- `10:06:31` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `10:06:33` views dashboard “🧭 KPI dashboard”
- `10:06:34` views chart “How much revenue are we making each month?” (+12 more)
- `10:06:35` dashboardView · dbt_users — -1 filter
- `10:06:35` dashboardView · dbt_baskets — +1 dimension (2 queries)
- `10:06:35` dashboardView · dbt_orders — +4 metrics; +1 filter (10 queries)
- `10:06:43` chartView · dbt_orders — -3 metrics; -1 dimension; -1 filter; +1 sort
- `10:07:38` views dashboard “🧭 KPI dashboard”
- `10:07:39` views chart “How much revenue are we making each month?” (+12 more)
- `10:10:08` asks agent: “”
- `10:10:43` ai · dbt_orders — -1 filter
- `10:10:49` ai · dbt_orders — -1 metric
- `10:10:51` ai · dbt_orders_no_preagg — +1 metric; +1 filter
- `10:10:51` ai · dbt_orders — re-run, same shape
- `10:10:55` ai · dbt_orders — -1 metric
- `10:10:57` ai · dbt_orders — +1 dimension; -1 filter
- `10:11:04` ai · dbt_users — -1 dimension
- `10:11:05` ai · dbt_orders — +1 dimension; +1 filter
- `10:11:12` ai · dbt_orders — -1 dimension; -1 filter
- `10:11:15` ai · sql_query_explorer — -1 metric; +2 dimensions; -1 sort
- `10:11:20` ai · dbt_orders — +1 metric; -2 dimensions; +1 filter; +1 sort
- `10:11:20` ai · dbt_orders — re-run, same shape
- `10:11:20` ai · dbt_orders — +1 dimension; -1 filter
- `10:11:32` ai · dbt_orders — re-run, same shape
- `10:11:32` ai · sql_query_explorer — -1 metric; +2 dimensions; -1 sort
- `10:11:51` ai · sql_query_explorer — +1 dimension
- `10:11:57` ai · sql_query_explorer — +4 dimensions
- `10:12:07` ai · sql_query_explorer — -4 dimensions
- `10:12:07` ai · sql_query_explorer — -3 dimensions
- `10:13:48` mcp.run_metric_query · dbt_orders — +1 metric; -1 dimension; +1 sort
- `10:17:00` metricsExplorer · dbt_orders — +2 filters; -1 sort (6 queries)
- `10:17:00` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)

## Episode 4 · 2bb4036c9c · 2026-08-05 14:31Z · 1 min · 8 steps · exploration, no save

- `14:31:00` metricsExplorer · dbt_support_requests — starts: 1 metric, 1 dimension, 2 filters (4 queries)
- `14:31:00` metricsExplorer · dbt_orders — re-run, same shape (12 queries)
- `14:31:49` exploreView · dbt_orders — -1 filter
- `14:31:50` exploreView · dbt_orders — re-run, same shape
- `14:31:51` exploreView · dbt_baskets — +1 metric
- `14:31:53` exploreView · dbt_baskets — re-run, same shape
- `14:31:54` exploreView · dbt_orders — -1 metric
- `14:31:55` exploreView · dbt_orders — re-run, same shape

## Episode 5 · 60f838975e · 2026-08-05 15:15Z · 4 min · 6 steps · exploration, no save

- `15:15:29` asks agent: “”
- `15:17:29` ai · users_daily — starts: 1 metric, 1 dimension, 1 filter, 1 sort, 1 custom metric
- `15:19:48` exploreView · users_daily — re-run, same shape
- `15:19:51` exploreView · users_daily — re-run, same shape
- `15:19:51` exploreView · users_daily — re-run, same shape
- `15:19:51` exploreView · users_daily — re-run, same shape

## Episode 6 · 60f838975e · 2026-08-05 16:40Z · 0 min · 4 steps · exploration, no save

- `16:40:56` exploreView · users_daily — starts: 1 metric, 2 dimensions, 1 filter, 1 sort, 1 custom metric
- `16:41:01` exploreView · users_daily — re-run, same shape
- `16:41:01` exploreView · users_daily — re-run, same shape
- `16:41:01` exploreView · users_daily — re-run, same shape

## Episode 7 · 995966fd22 · 2026-08-06 08:08Z · 7 min · 54 steps · exploration→save

- `08:08:17` views dashboard “Plumly Sales”
- `08:08:22` views chart “Monthly Won Deals and Cumulative Deal Value” (+3 more)
- `08:08:23` dashboardView · deals — starts: 2 metrics, 1 dimension, 3 filters (4 queries)
- `08:08:38` exploreView · deals — -2 filters; +1 sort; +1 table calc
- `08:09:12` updates chart “Monthly Won Deals and Cumulative Deal Value” (cartesian, None)
- `08:09:13` exploreView · deals — re-run, same shape
- `08:09:15` views dashboard “Plumly Sales”
- `08:09:16` views chart “None” (+2 more)
- `08:09:16` dashboardView · deals — +2 filters; -1 sort; -1 table calc
- `08:09:19` exploreView · deals — -1 metric; -2 filters; +1 sort
- `08:09:47` exploreView · deals — re-run, same shape
- `08:09:58` updates chart “Pipeline Value” (big_number, None)
- `08:09:59` exploreView · deals — re-run, same shape
- `08:10:00` views dashboard “Plumly Sales”
- `08:10:01` views chart “Monthly Won Deals and Cumulative Deal Value” (+3 more)
- `08:10:01` dashboardView · deals — +2 filters; -1 sort (3 queries)
- `08:10:04` exploreView · deals — -2 filters; +1 sort
- `08:10:14` updates chart “Closed Won Value” (big_number, None)
- `08:10:15` exploreView · deals — re-run, same shape
- `08:10:20` updates chart “Closed Won Value” (big_number, None)
- `08:10:21` exploreView · deals — re-run, same shape
- `08:10:31` exploreView · deals — -1 filter
- `08:10:39` updates chart “Win Rate” (big_number, None)
- `08:10:40` exploreView · deals — re-run, same shape
- `08:11:20` views chart “None” (+11 more)
- `08:11:21` dashboardView · deals — +1 dimension; +3 filters; -1 sort (9 queries)
- `08:11:22` dashboardView · accounts — +1 metric; -1 dimension
- `08:11:26` exploreView · deals — -1 metric; +1 dimension; -2 filters; +1 sort
- `08:11:34` exploreView · deals — re-run, same shape
- `08:11:36` updates chart “Win Rate Basic Plan” (big_number, None)
- `08:11:37` views dashboard “Plumly Sales”
- `08:11:37` exploreView · deals — re-run, same shape
- `08:11:42` exploreView · deals — re-run, same shape
- `08:11:50` updates chart “Win Rate Professional” (big_number, None)
- `08:11:51` exploreView · deals — re-run, same shape
- `08:12:06` exploreView · deals — re-run, same shape
- `08:12:13` views chart “Monthly Won Deals and Cumulative Deal Value” (+9 more)
- `08:12:13` views dashboard “Plumly Sales”
- `08:12:25` exploreView · deals — -1 filter
- `08:12:48` updates chart “YoY Revenue vs. Target” (cartesian, None)
- `08:12:52` exploreView · deals — re-run, same shape
- `08:13:01` dashboardView · accounts — +1 metric; +2 filters; -1 sort (4 queries)
- `08:13:55` views chart “None” (+4 more)
- `08:13:57` dashboardView · deals — -1 dimension; +1 filter
- `08:14:14` dashboardView · deals — re-run, same shape
- `08:15:30` ai · deals — -1 metric; -3 filters; +1 sort
- `08:15:30` ai · deals — +1 metric
- `08:15:30` ai · deals — +2 metrics; -1 dimension; -1 sort
- `08:15:30` ai · deals — -1 metric
- `08:15:30` ai · deals — -2 metrics; +1 dimension; +1 sort
- `08:15:30` ai · deals — +3 metrics; +1 dimension; +1 sort
- `08:15:30` ai · deals — -3 metrics; -1 sort
- `08:15:30` ai · deals — -1 dimension
- `08:15:30` ai · deals — re-run, same shape

## Episode 8 · 0e95d5d0e4 · 2026-08-06 09:04Z · 21 min · 39 steps · exploration, no save

- `09:04:27` asks agent: “”
- `09:05:11` asks agent: “”
- `09:06:11` exploreView · deals — starts: 1 dimension, 1 sort
- `09:06:11` exploreView · deals — -1 sort
- `09:06:15` exploreView · deals — +1 metric; +1 sort
- `09:06:41` exploreView · deals — +1 dimension
- `09:07:34` exploreView · deals — re-run, same shape
- `09:07:34` exploreView · deals — re-run, same shape
- `09:07:34` exploreView · deals — re-run, same shape
- `09:08:34` exploreView · deals — re-run, same shape
- `09:08:34` exploreView · deals — re-run, same shape
- `09:08:34` exploreView · deals — re-run, same shape
- `09:09:35` asks agent: “”
- `09:09:43` ai · deals — -1 dimension
- `09:10:02` ai · deals — re-run, same shape
- `09:10:26` asks agent: “”
- `09:10:31` ai · deals — +1 dimension
- `09:10:47` ai · deals — re-run, same shape
- `09:11:18` exploreView · deals — re-run, same shape
- `09:11:18` exploreView · deals — re-run, same shape
- `09:14:50` views chart “Monthly Won Deals and Cumulative Deal Value” (+3 more)
- `09:14:50` views dashboard “Plumly Sales”
- `09:14:50` dashboardView · deals — +1 metric; -1 dimension; +3 filters; -1 sort (4 queries)
- `09:15:30` views chart “None” (+11 more)
- `09:15:30` dashboardView · deals — -1 metric; +1 dimension (7 queries)
- `09:15:30` dashboardView · accounts — +1 metric; -1 dimension
- `09:16:36` viewUnderlyingData · deals — -2 metrics; +32 dimensions; +1 filter
- `09:16:56` views dashboard “Plumly Sales”
- `09:17:05` views chart “Monthly Won Deals and Cumulative Deal Value”
- `09:17:25` views dashboard “Plumly Sales”
- `09:17:25` dashboardView · deals — +1 filter (8 queries)
- `09:20:53` exploreView · deals — -2 metrics; -4 filters
- `09:20:53` exploreView · deals — +1 sort
- `09:20:55` exploreView · deals — +1 metric
- `09:20:59` exploreView · deals — +1 dimension
- `09:23:12` metricsExplorer · deals — +1 metric; -1 dimension; +1 filter; -1 sort (2 queries)
- `09:24:27` views chart “Monthly Won Deals and Cumulative Deal Value” (+3 more)
- `09:24:27` views dashboard “Plumly Sales”
- `09:25:02` views dashboard “Plumly Sales”

## Episode 9 · 60f838975e · 2026-08-06 15:08Z · 8 min · 2 steps · exploration, no save

- `15:08:38` exploreView · organizations — starts: 1 metric, 1 dimension, 1 sort, 1 custom metric
- `15:16:21` exploreView · organizations — -1 dimension; -1 sort

## Episode 10 · 86b2015856 · 2026-08-06 15:12Z · 5 min · 2 steps · exploration, no save

- `15:12:21` exploreView · organizations — starts: 1 metric, 1 dimension, 1 sort, 1 custom metric
- `15:17:01` exploreView · dashboard_usage — -1 metric; -1 sort; -1 custom metric

## Episode 11 · 86b2015856 · 2026-08-06 20:16Z · 7 min · 18 steps · exploration, no save

- `20:16:06` asks agent: “”
- `20:16:49` ai · organizations_daily — starts: 5 metrics, 2 filters
- `20:16:49` ai · organizations_daily — -1 metric; +1 dimension; +1 sort
- `20:18:45` metricsExplorer · linear_customer_requests — -3 metrics; -1 sort (2 queries)
- `20:18:45` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `20:19:10` asks agent: “”
- `20:20:07` ai · organizations_daily — -1 metric; +1 dimension; -1 filter; +1 sort
- `20:20:12` ai · organizations_daily — re-run, same shape
- `20:20:21` ai · organizations_daily — +3 dimensions; +1 filter; -1 sort
- `20:20:35` ai · organizations_daily — +6 metrics; -2 dimensions; +1 sort
- `20:20:39` exploreView · organizations — -6 metrics; -2 dimensions; -1 filter
- `20:20:45` ai · organizations_daily — +1 metric; +4 dimensions; +1 filter; -1 sort
- `20:20:48` exploreView · organizations — -1 metric; +2 dimensions; -1 filter; +1 sort
- `20:20:49` ai · organizations_daily — +1 metric; -6 dimensions; +1 filter
- `20:21:35` exploreView · organizations — -1 metric; +7 dimensions; -1 filter
- `20:21:53` exploreView · organizations — +1 dimension
- `20:22:40` exploreView · organizations_daily — -8 dimensions; +1 filter
- `20:23:10` exploreView · organizations_daily — +12 metrics; +2 dimensions

## Episode 12 · 3e9ad64ae6 · 2026-08-07 10:59Z · 18 min · 92 steps · exploration, no save

- `10:59:46` metricsExplorer · dbt_support_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `10:59:46` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `11:00:09` views dashboard “Company KPIs”
- `11:00:10` views chart “How much revenue are we making each month?” (+12 more)
- `11:00:10` dashboardView · dbt_orders — +4 metrics; +1 dimension (33 queries)
- `11:00:10` dashboardView · dbt_baskets — -4 metrics; -1 filter (3 queries)
- `11:00:11` dashboardView · dbt_users — -1 dimension; -1 filter (3 queries)
- `11:01:18` views dashboard “Company KPIs”
- `11:01:18` dashboardView · dbt_users — re-run, same shape (3 queries)
- `11:01:18` dashboardView · dbt_baskets — +1 dimension; +1 filter (3 queries)
- `11:01:18` dashboardView · dbt_orders — +4 metrics; +1 filter (32 queries)
- `11:01:24` views chart “How much revenue are we making each month?” (+12 more)
- `11:02:21` viewUnderlyingData · dbt_orders — -5 metrics; +41 dimensions; +1 filter
- `11:02:34` views dashboard “Company KPIs”
- `11:02:35` views chart “How much revenue are we making each month?” (+12 more)
- `11:02:35` dashboardView · dbt_orders — re-run, same shape (11 queries)
- `11:02:36` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters
- `11:02:36` dashboardView · dbt_baskets — +1 dimension; +1 filter
- `11:04:59` metricsExplorer · dbt_support_requests — -1 dimension; +1 filter (2 queries)
- `11:04:59` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `11:05:24` views dashboard “Company KPIs”
- `11:05:25` views chart “How much revenue are we making each month?” (+12 more)
- `11:05:25` dashboardView · dbt_orders — +4 metrics; +1 dimension (22 queries)
- `11:05:26` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters (2 queries)
- `11:05:26` dashboardView · dbt_baskets — +1 dimension; +1 filter (2 queries)
- `11:06:11` views dashboard “Company KPIs”
- `11:06:12` views chart “How much revenue are we making each month?” (+12 more)
- `11:06:12` dashboardView · dbt_users — -1 dimension; -1 filter (2 queries)
- `11:06:12` dashboardView · dbt_orders — +4 metrics; +1 dimension; +2 filters (22 queries)
- `11:06:13` dashboardView · dbt_baskets — -4 metrics; -1 filter (2 queries)
- `11:07:08` views chart “How much revenue are we making each month?” (+12 more)
- `11:07:08` views dashboard “Company KPIs”
- `11:07:09` dashboardView · dbt_baskets — re-run, same shape (2 queries)
- `11:07:09` dashboardView · dbt_users — -1 dimension; -1 filter (2 queries)
- `11:07:09` dashboardView · dbt_orders — +4 metrics; +1 dimension; +2 filters (22 queries)
- `11:07:35` viewUnderlyingData · dbt_orders — -5 metrics; +41 dimensions; +1 filter
- `11:08:25` views dashboard “Company KPIs”
- `11:08:26` views chart “How much revenue are we making each month?” (+12 more)
- `11:08:27` dashboardView · dbt_baskets — -4 metrics; -1 filter
- `11:08:27` dashboardView · dbt_orders — +4 metrics; +1 filter (11 queries)
- `11:08:27` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters
- `11:09:49` metricsExplorer · dbt_orders — +2 filters (6 queries)
- `11:09:49` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `11:10:14` views dashboard “Company KPIs”
- `11:10:15` views chart “How much revenue are we making each month?” (+12 more)
- `11:10:15` dashboardView · dbt_users — -2 filters (2 queries)
- `11:10:15` dashboardView · dbt_orders — +4 metrics; +1 dimension; +2 filters (22 queries)
- `11:10:16` dashboardView · dbt_baskets — -4 metrics; -1 filter (2 queries)
- `11:11:01` views dashboard “Company KPIs”
- `11:11:02` views chart “How much revenue are we making each month?” (+12 more)
- `11:11:02` dashboardView · dbt_orders — +4 metrics; +1 filter (33 queries)
- `11:11:03` dashboardView · dbt_baskets — -4 metrics; -1 filter (3 queries)
- `11:11:03` dashboardView · dbt_users — -1 dimension; -1 filter (3 queries)
- `11:12:25` viewUnderlyingData · dbt_orders — -1 metric; +42 dimensions; +3 filters
- `11:12:39` views dashboard “Company KPIs”
- `11:12:40` views chart “How much revenue are we making each month?” (+12 more)
- `11:12:41` dashboardView · dbt_orders — +4 metrics; +1 dimension; +2 filters (11 queries)
- `11:12:41` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters
- `11:12:41` dashboardView · dbt_baskets — +1 dimension; +1 filter
- `11:13:14` views dashboard “Company KPIs”
- `11:13:15` views chart “How much revenue are we making each month?” (+12 more)
- `11:13:16` dashboardView · dbt_baskets — re-run, same shape
- `11:13:16` dashboardView · dbt_orders — +4 metrics; +1 filter (11 queries)
- `11:13:16` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters
- `11:14:49` views dashboard “Company KPIs”
- `11:14:50` views chart “How much revenue are we making each month?” (+12 more)
- `11:14:51` dashboardView · dbt_baskets — +1 dimension; +1 filter
- `11:14:51` dashboardView · dbt_orders — +4 metrics; +1 filter (11 queries)
- `11:14:51` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters
- `11:15:29` metricsExplorer · dbt_support_requests — +2 filters (2 queries)
- `11:15:29` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `11:15:51` views chart “How much revenue are we making each month?” (+12 more)
- `11:15:51` views dashboard “Company KPIs”
- `11:15:52` dashboardView · dbt_orders — +4 metrics; +1 dimension (11 queries)
- `11:15:52` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters
- `11:15:52` dashboardView · dbt_baskets — +1 dimension; +1 filter
- `11:16:13` views chart “How much revenue are we making each month?” (+12 more)
- `11:16:13` views dashboard “Company KPIs”
- `11:16:13` dashboardView · dbt_orders — +4 metrics; +1 filter (22 queries)
- `11:16:14` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters (2 queries)
- … 12 more steps

## Episode 13 · 51bcf5e7fa · 2026-08-10 18:09Z · 2 min · 4 steps · exploration, no save

- `18:09:50` exploreView · agents — starts: 1 metric, 2 dimensions, 1 filter
- `18:10:00` exploreView · agents — re-run, same shape
- `18:11:51` metricsExplorer · linear_customer_requests — -1 dimension; +1 filter (2 queries)
- `18:11:51` metricsExplorer · organizations_daily — re-run, same shape (2 queries)

## Episode 14 · 995966fd22 · 2026-08-11 13:09Z · 16 min · 38 steps · exploration, no save

- `13:09:25` metricsExplorer · dbt_support_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `13:09:25` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:11:04` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `13:11:04` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:12:17` exploreView · dbt_orders — -1 metric; -2 filters
- `13:12:17` exploreView · dbt_orders — +1 sort
- `13:12:20` exploreView · dbt_orders — +1 metric
- `13:12:28` exploreView · dbt_orders — +1 dimension
- `13:13:04` exploreView · dbt_orders — re-run, same shape
- `13:13:04` exploreView · dbt_orders — re-run, same shape
- `13:13:04` exploreView · dbt_orders — re-run, same shape
- `13:14:08` asks agent: “”
- `13:14:27` ai · dbt_orders — +1 sort
- `13:14:29` ai · dbt_orders — re-run, same shape
- `13:17:13` exploreView · dbt_orders — re-run, same shape
- `13:17:13` exploreView · dbt_orders — re-run, same shape
- `13:18:59` views chart “None”
- `13:18:59` views dashboard “🧭 KPI dashboard”
- `13:19:00` views chart “How much revenue are we making each month?” (+11 more)
- `13:19:00` views dashboard “🧭 KPI dashboard”
- `13:19:00` dashboardView · dbt_orders — +4 metrics; +2 filters; -2 sorts (20 queries)
- `13:19:01` dashboardView · dbt_baskets — -4 metrics; -1 filter (4 queries)
- `13:19:01` dashboardView · dbt_users — -1 dimension (2 queries)
- `13:20:07` views dashboard “🧭 KPI dashboard”
- `13:20:08` dashboardView · dbt_orders — +4 metrics; +1 dimension; +2 filters (20 queries)
- `13:20:08` dashboardView · dbt_baskets — -4 metrics; -2 filters (4 queries)
- `13:20:08` dashboardView · dbt_users — -1 dimension (2 queries)
- `13:21:16` views chart “None”
- `13:21:17` chartView · dbt_orders — +1 metric; +1 sort
- `13:22:11` views dashboard “🧭 KPI dashboard”
- `13:22:12` views chart “How much revenue are we making each month?” (+12 more)
- `13:22:12` dashboardView · dbt_baskets — -1 metric; +1 dimension; -1 sort (2 queries)
- `13:22:12` dashboardView · dbt_orders — +4 metrics; +1 filter (10 queries)
- `13:22:12` dashboardView · dbt_users — -4 metrics; -1 dimension; -1 filter
- `13:22:49` metricsExplorer · dbt_orders — +1 metric (2 queries)
- `13:24:44` views dashboard “🧭 KPI dashboard”
- `13:24:45` views chart “How much revenue are we making each month?” (+12 more)
- `13:25:21` exploreView · dbt_orders — -1 metric; +2 filters; +1 sort

## Episode 15 · d585e72a02 · 2026-08-11 13:13Z · 19 min · 48 steps · exploration, no save

- `13:13:23` metricsExplorer · dbt_support_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `13:13:23` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:15:17` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `13:15:17` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:16:15` exploreView · dbt_orders — -1 metric; -2 filters; +1 sort
- `13:16:15` exploreView · dbt_orders — -1 sort
- `13:16:19` exploreView · dbt_orders — +1 metric; +1 sort
- `13:16:20` exploreView · dbt_orders — +1 metric
- `13:17:56` metricsExplorer · dbt_support_requests — -1 metric; +2 filters; -1 sort (2 queries)
- `13:17:56` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:18:01` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `13:18:01` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:18:02` views dashboard “🧭 KPI dashboard”
- `13:18:03` views chart “How much revenue are we making each month?” (+12 more)
- `13:18:04` dashboardView · dbt_baskets — +1 dimension; -1 filter (2 queries)
- `13:18:04` dashboardView · dbt_orders — +4 metrics; +1 filter (10 queries)
- `13:18:04` dashboardView · dbt_users — -4 metrics; -1 dimension; -1 filter
- `13:21:16` exploreView · dbt_orders — -1 metric; -1 filter; +1 sort
- `13:21:16` exploreView · dbt_orders — -1 sort
- `13:21:18` exploreView · dbt_orders — +1 metric; +1 sort
- `13:21:26` exploreView · dbt_orders — re-run, same shape
- `13:23:04` exploreView · dbt_users — -1 dimension; -1 sort
- `13:23:04` exploreView · dbt_users — +1 sort
- `13:23:52` metricsExplorer · dbt_support_requests — +1 dimension; +2 filters; -1 sort (2 queries)
- `13:23:52` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:23:53` views dashboard “🧭 KPI dashboard”
- `13:23:54` views chart “How much revenue are we making each month?” (+16 more)
- `13:23:55` dashboardView · dbt_orders — +4 metrics; +1 dimension (11 queries)
- `13:23:55` dashboardView · dbt_baskets — -4 metrics; -1 filter (2 queries)
- `13:23:55` dashboardView · dbt_users — -1 dimension (2 queries)
- `13:23:58` dashboardView · dbt_support_requests — +1 dimension; -1 filter (2 queries)
- `13:24:11` views chart “How much revenue are we making each month?” (+21 more)
- `13:24:11` views dashboard “🧭 KPI dashboard”
- `13:24:26` dashboardView · dbt_orders — -1 dimension; +1 filter (3 queries)
- `13:24:26` dashboardView · dbt_baskets — +2 metrics (2 queries)
- `13:25:08` dashboardView · dbt_users — -2 metrics
- `13:25:08` dashboardView · dbt_orders — +3 metrics; +1 dimension; +1 filter (8 queries)
- `13:25:08` dashboardView · dbt_baskets — -3 metrics; -1 filter (2 queries)
- `13:25:27` viewUnderlyingData · dbt_orders — -1 metric; +41 dimensions; +3 filters
- `13:27:15` viewUnderlyingData · dbt_orders — -1 metric; +41 dimensions; +3 filters
- `13:27:38` metricsExplorer · dbt_orders — -1 dimension; +1 filter (6 queries)
- `13:27:39` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `13:29:23` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:29:23` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `13:31:05` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `13:31:05` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `13:31:36` exploreView · dbt_orders — -1 dimension; -2 filters; +1 custom metric
- `13:32:27` asks agent: “”

## Episode 16 · 2bb4036c9c · 2026-08-11 23:13Z · 0 min · 3 steps · exploration, no save

- `23:13:47` exploreView · pylon_issues — starts: 3 metrics, 1 dimension, 1 sort
- `23:14:02` exploreView · linear_issues — +3 metrics
- `23:14:04` exploreView · linear_customer_requests — -1 metric; -1 dimension; -1 sort

## Episode 17 · 4754d59202 · 2026-08-12 21:32Z · 67 min · 133 steps · exploration→save

- `21:32:37` views chart “None”
- `21:37:55` views chart “None”
- `21:37:55` chartView · activities — starts: 1 metric, 2 dimensions, 1 sort
- `21:46:06` exploreView · deals — -1 dimension
- `21:48:28` views chart “None” (+1 more)
- `21:48:28` views dashboard “Comparison Dashboard”
- `21:48:29` dashboardView · deals — +2 filters; -1 sort (2 queries)
- `21:50:50` exploreView · leads — -2 filters; +1 sort
- `21:51:32` views dashboard “Plumly Sales”
- `21:51:34` chartView · leads — re-run, same shape
- `21:51:36` views chart “None” (+17 more)
- `21:51:36` dashboardView · deals — +1 metric; +1 dimension; +3 filters; -1 sort (17 queries)
- `21:51:40` dashboardView · accounts — re-run, same shape (5 queries)
- `21:51:56` saves dashboard “Plumly Sales”
- `21:52:05` dashboardView · accounts — re-run, same shape (5 queries)
- `21:52:05` dashboardView · deals — re-run, same shape (19 queries)
- `21:52:15` views dashboard “Plumly Sales”
- `21:52:16` views chart “None” (+16 more)
- `21:52:27` saves dashboard “Plumly Sales”
- `21:52:47` exploreView · leads — -1 metric; -1 dimension; -3 filters; +1 sort
- `21:53:35` views dashboard “Plumly Sales”
- `21:53:37` saves dashboard “Plumly Sales”
- `21:53:37` chartView · leads — re-run, same shape
- `21:53:42` views chart “Monthly Won Deals and Cumulative Deal Value” (+3 more)
- `21:53:43` dashboardView · deals — +1 metric; +3 filters; -1 sort (4 queries)
- `21:53:43` dashboardView · leads — -1 metric; -2 filters
- `21:54:01` views chart “None” (+13 more)
- `21:54:01` views dashboard “Plumly Sales”
- `21:54:09` dashboardView · deals — +1 dimension; +2 filters
- `21:54:59` saves dashboard “Plumly Sales”
- `21:55:00` views chart “None” (+17 more)
- `21:55:00` views dashboard “Plumly Sales”
- `21:55:00` dashboardView · leads — -1 dimension; -2 filters
- `21:55:00` dashboardView · deals — +1 metric; +1 dimension; +2 filters (5 queries)
- `21:57:57` views chart “Sales Funnel” (+1 more)
- `21:57:59` views dashboard “Plumly Sales”
- `21:58:00` views chart “None” (+17 more)
- `21:58:30` saves dashboard “Plumly Sales”
- `21:58:30` views dashboard “Plumly Sales”
- `21:58:31` dashboardView · leads — -1 metric; -1 dimension; -2 filters
- `21:58:31` dashboardView · deals — +1 metric; +2 filters (4 queries)
- `21:58:35` exploreView · leads — -1 metric; -3 filters; +1 sort
- `21:59:04` views chart “Monthly Won Deals and Cumulative Deal Value” (+13 more)
- `21:59:04` views dashboard “Plumly Product Pulse Dashboard”
- `21:59:05` dashboardView · tracks — +1 metric; +1 dimension; +2 filters; -1 sort (8 queries)
- `21:59:05` dashboardView · users — -1 metric; -1 filter
- `21:59:10` views dashboard “Plumly Sales”
- `21:59:11` dashboardView · deals — +1 metric; -1 dimension; +2 filters (4 queries)
- `21:59:11` dashboardView · leads — -1 metric; -2 filters
- `22:02:03` views dashboard “Plumly Sales”
- `22:02:04` views chart “None” (+17 more)
- `22:02:04` dashboardView · deals — +1 metric; +1 dimension; +2 filters (17 queries)
- `22:02:08` dashboardView · leads — -1 metric; -1 dimension; -2 filters (2 queries)
- `22:02:36` saves dashboard “Plumly Sales”
- `22:02:40` dashboardView · accounts — +1 metric; +1 dimension; +2 filters (5 queries)
- `22:03:16` saves dashboard “Plumly Sales”
- `22:03:17` views chart “Monthly Won Deals and Cumulative Deal Value” (+4 more)
- `22:03:17` views dashboard “Plumly Sales”
- `22:03:17` dashboardView · deals — -1 metric (8 queries)
- `22:03:17` dashboardView · accounts — +1 metric; -1 dimension
- `22:03:38` exploreView · activities — -1 metric; -3 filters; +1 sort
- `22:04:05` exploreView · activities — +1 dimension
- `22:05:20` views dashboard “Plumly Sales”
- `22:05:21` saves dashboard “Plumly Sales”
- `22:05:21` chartView · activities — re-run, same shape
- `22:05:25` views chart “None” (+18 more)
- `22:05:25` dashboardView · leads — -1 dimension; +1 filter; -1 sort
- `22:05:25` dashboardView · activities — +1 dimension; -1 filter
- `22:05:25` dashboardView · deals — +1 metric; +3 filters (12 queries)
- `22:05:38` dashboardView · accounts — re-run, same shape (5 queries)
- `22:06:02` views chart “None” (+18 more)
- `22:06:02` saves dashboard “Plumly Sales”
- `22:06:02` views dashboard “Plumly Sales”
- `22:06:03` dashboardView · activities — -1 metric; -3 filters
- `22:06:03` dashboardView · accounts — +1 metric; +2 filters (4 queries)
- `22:06:20` exploreView · accounts — -1 metric; -2 filters; +1 sort
- `22:09:50` views chart “None” (+13 more)
- `22:09:51` dashboardView · accounts — +1 metric; -1 dimension; +3 filters; -1 sort
- `22:09:51` dashboardView · deals — +1 dimension (12 queries)
- `22:09:54` dashboardView · leads — -1 metric; -1 dimension; -2 filters
- … 53 more steps

## Episode 18 · 19f38854e0 · 2026-08-12 21:50Z · 26 min · 27 steps · exploration→save

- `21:50:44` metricsExplorer · linear_customer_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `21:50:44` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `22:04:14` exploreView · github_activity — -1 dimension; -2 filters; +1 sort
- `22:05:14` exploreView · pylon_issues — -1 metric; +1 dimension
- `22:05:19` exploreView · pylon_issues — +1 dimension
- `22:05:27` exploreView · pylon_issues — -1 dimension
- `22:05:28` exploreView · pylon_issues — +1 dimension
- `22:05:38` exploreView · pylon_issues — +1 metric
- `22:05:46` exploreView · pylon_issues — re-run, same shape
- `22:05:46` exploreView · pylon_issues — re-run, same shape
- `22:05:46` exploreView · pylon_issues — re-run, same shape
- `22:07:24` chartView · pylon_issues — re-run, same shape
- `22:07:29` viewUnderlyingData · pylon_issues — -1 metric; +24 dimensions; +2 filters; -1 sort
- `22:08:21` exploreView · pylon_issues — re-run, same shape
- `22:09:07` metricsExplorer · organizations_daily — -1 dimension; +2 filters; -1 sort (2 queries)
- `22:09:07` metricsExplorer · linear_customer_requests — re-run, same shape (2 queries)
- `22:09:09` views chart “wobbley-wobble”
- `22:09:09` chartView · pylon_issues — +1 dimension; -2 filters; +1 sort
- `22:09:36` viewUnderlyingData · pylon_issues — -1 metric; +24 dimensions; +2 filters; -1 sort
- `22:13:46` metricsExplorer · linear_customer_requests — -1 dimension; +2 filters; -1 sort (2 queries)
- `22:13:46` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `22:13:48` views chart “wobbley-wobble”
- `22:13:48` chartView · pylon_issues — +1 dimension; -2 filters; +1 sort
- `22:13:50` exploreView · pylon_issues — re-run, same shape
- `22:14:38` updates chart “wobbley-wobble” (data_app_viz, None)
- `22:15:34` viewUnderlyingData · pylon_issues — -1 metric; +24 dimensions; +2 filters; -1 sort
- `22:16:44` updates chart “wobbley-wobble” (data_app_viz, None)

## Episode 19 · bf2e32cdfc · 2026-08-13 08:39Z · 23 min · 23 steps · exploration, no save

- `08:39:03` asks agent: “”
- `08:39:13` metricsExplorer · linear_customer_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `08:39:14` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `08:39:24` asks agent: “”
- `08:39:26` ai · organizations — -1 metric; +10 dimensions; -1 filter
- `08:40:18` ai · ai_agent_usage — +1 metric; -10 dimensions; +1 sort
- `08:40:23` ai · ai_agent_usage — re-run, same shape
- `08:40:28` ai · ai_agent_usage — +1 filter
- `08:40:36` viewUnderlyingData · ai_agent_usage — -1 metric; +49 dimensions; +1 filter; -1 sort
- `08:40:38` ai · events — +2 dimensions; +2 filters
- `08:40:43` ai · events — -2 dimensions; -3 filters
- `08:41:26` asks agent: “”
- `08:41:28` ai · ai_agent_usage — +1 filter
- `08:41:46` ai · events — +2 dimensions; +2 filters
- `08:42:15` asks agent: “”
- `08:42:22` ai · organizations — -1 metric; +8 dimensions; -3 filters; -1 sort
- `08:42:36` ai · ai_agent_usage — +1 metric; -7 dimensions; +2 sorts
- `08:44:32` exploreView · apps — -1 metric; -3 dimensions; -1 filter; -1 sort
- `08:44:37` exploreView · apps — +1 metric
- `08:45:52` exploreView · merge — +1 metric; -1 sort
- `09:01:54` ai · ai_agent_usage — -1 metric; +3 dimensions; +1 filter; +2 sorts
- `09:02:22` ai · organizations — -1 metric; +7 dimensions; -2 sorts
- `09:02:24` ai · organizations — re-run, same shape

## Episode 20 · 995966fd22 · 2026-08-13 13:19Z · 6 min · 26 steps · exploration→save

- `13:19:03` exploreView · deals — starts: 1 metric, 1 sort
- `13:19:03` exploreView · deals — -1 sort
- `13:19:04` exploreView · deals — +1 sort
- `13:19:05` exploreView · deals — +1 dimension
- `13:19:11` exploreView · deals — re-run, same shape
- `13:19:47` saves dashboard “Test params embed”
- `13:19:48` chartView · deals — re-run, same shape
- `13:19:48` chartView · deals — re-run, same shape
- `13:19:49` views dashboard “Test params embed”
- `13:19:50` dashboardView · deals — -1 sort
- `13:20:06` exploreView · deals — -1 dimension
- `13:20:06` exploreView · deals — +1 sort
- `13:20:20` views chart “None”
- `13:20:20` dashboardView · deals — +1 dimension; -1 sort (3 queries)
- `13:20:24` saves dashboard “Test params embed”
- `13:20:24` views dashboard “Test params embed”
- `13:21:59` views chart “None”
- `13:21:59` views dashboard “Test params embed”
- `13:21:59` dashboardView · deals — re-run, same shape
- `13:22:03` views chart “How many unique deals are in the pipeline?”
- `13:22:03` dashboardView · deals — re-run, same shape (2 queries)
- `13:23:47` views chart “None”
- `13:23:47` views dashboard “Test params embed”
- `13:24:14` views chart “None” (+1 more)
- `13:24:50` views dashboard “Test params embed”
- `13:25:31` views chart “None” (+1 more)

## Episode 21 · 2bb4036c9c · 2026-08-13 19:22Z · 29 min · 13 steps · exploration, no save

- `19:22:57` exploreView · linear_issues — starts: 5 metrics
- `19:34:17` exploreView · pylon_issues — -4 metrics; +1 dimension
- `19:36:20` exploreView · merge — +1 metric
- `19:39:53` exploreView · merge — re-run, same shape
- `19:40:27` exploreView · merge — re-run, same shape
- `19:40:35` exploreView · merge — re-run, same shape
- `19:47:58` exploreView · apps — -1 metric; +1 filter
- `19:47:58` exploreView · merge — +1 metric; -1 filter
- `19:47:58` exploreView · apps — -1 metric; +1 filter; +1 sort
- `19:52:21` views chart “None” (+9 more)
- `19:52:21` views dashboard “None”
- `19:52:22` dashboardView · events — +1 metric; +1 filter; -1 sort (5 queries)
- `19:52:22` dashboardView · ai_token_usage — +5 metrics; +1 dimension (5 queries)

## Episode 22 · 60f838975e · 2026-08-13 19:28Z · 13 min · 6 steps · exploration, no save

- `19:28:54` exploreView · merge — starts: 2 metrics, 1 dimension
- `19:38:35` exploreView · merge — re-run, same shape
- `19:41:23` exploreView · apps — -1 metric; +1 filter
- `19:41:27` exploreView · apps — re-run, same shape
- `19:41:28` exploreView · apps — re-run, same shape
- `19:41:44` exploreView · merge — +1 metric; -1 filter

## Episode 23 · 995966fd22 · 2026-08-14 08:09Z · 3 min · 4 steps · exploration, no save

- `08:09:46` exploreView · dbt_orders — starts: 1 metric, 1 custom metric
- `08:10:07` exploreView · dbt_orders — +1 dimension; +1 sort
- `08:12:19` metricsExplorer · dbt_orders — +2 filters; -1 sort; -1 custom metric (6 queries)
- `08:12:19` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)

## Episode 24 · 2bb4036c9c · 2026-08-14 10:20Z · 19 min · 14 steps · exploration, no save

- `10:20:20` viewUnderlyingData · linear_issues — starts: 11 dimensions, 2 filters
- `10:24:08` viewUnderlyingData · linear_issues — starts: 11 dimensions
- `10:24:20` exploreView · merge — starts: 3 metrics, 1 dimension
- `10:24:20` exploreView · linear_customer_requests — -2 metrics; +1 sort
- `10:25:12` exploreView · linear_customer_requests — re-run, same shape
- `10:25:13` exploreView · merge — +2 metrics; -1 sort
- `10:26:48` exploreView · merge — re-run, same shape
- `10:27:51` exploreView · merge — re-run, same shape
- `10:29:03` exploreView · merge — +1 metric
- `10:29:21` exploreView · merge — re-run, same shape
- `10:36:39` viewUnderlyingData · linear_issues — -4 metrics; +11 dimensions
- `10:38:06` viewUnderlyingData · linear_issues — -4 metrics; +11 dimensions; +2 filters
- `10:38:33` viewUnderlyingData · linear_issues — -4 metrics; +11 dimensions; +2 filters
- `10:38:51` viewUnderlyingData · linear_issues — -4 metrics; +11 dimensions; +2 filters

## Episode 25 · 995966fd22 · 2026-08-17 13:58Z · 0 min · 2 steps · exploration, no save

- `13:58:38` exploreView · dbt_orders — starts: 2 metrics, 1 dimension, 1 filter, 1 sort, 1 table calc
- `13:58:50` exploreView · dbt_orders — +1 metric; +1 custom metric

## Episode 26 · 995966fd22 · 2026-08-17 15:02Z · 0 min · 8 steps · exploration, no save

- `15:02:38` exploreView · dbt_orders — starts: 1 dimension, 1 sort
- `15:02:38` exploreView · dbt_orders — +1 dimension
- `15:02:47` views dashboard “🧭 KPI dashboard”
- `15:02:48` views chart “How much revenue are we making each month?” (+21 more)
- `15:02:48` dashboardView · dbt_orders — +5 metrics; +1 filter; -1 sort (14 queries)
- `15:02:49` dashboardView · dbt_users — -4 metrics; -1 dimension; -1 filter (2 queries)
- `15:02:49` dashboardView · dbt_baskets — +2 metrics; +1 dimension; +1 filter (4 queries)
- `15:02:55` dashboardView · dbt_support_requests — -2 metrics; -1 filter (2 queries)

## Episode 27 · 86b2015856 · 2026-08-18 09:24Z · 20 min · 24 steps · exploration, no save

- `09:24:34` metricsExplorer · dbt_orders — starts: 1 metric, 1 dimension, 2 filters (6 queries)
- `09:24:34` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:24:39` exploreView · dbt_orders — -2 filters; +1 sort
- `09:25:29` metricsExplorer · dbt_support_requests — +2 filters; -1 sort (14 queries)
- `09:25:29` metricsExplorer · dbt_orders — re-run, same shape (42 queries)
- `09:25:48` exploreView · dbt_orders — -2 filters; +1 sort
- `09:26:08` metricsExplorer · dbt_orders — +2 filters; -1 sort (6 queries)
- `09:26:08` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `09:26:40` exploreView · dbt_orders — -2 filters; +1 sort
- `09:32:40` exploreView · dbt_orders — re-run, same shape
- `09:33:57` asks agent: “”
- `09:34:10` ai · dbt_orders — re-run, same shape
- `09:34:12` ai · dbt_orders — re-run, same shape
- `09:34:34` asks agent: “”
- `09:34:43` ai · dbt_orders — re-run, same shape
- `09:34:44` ai · dbt_orders — re-run, same shape
- `09:41:05` asks agent: “”
- `09:41:18` ai · dbt_orders — re-run, same shape
- `09:41:21` ai · dbt_orders — re-run, same shape
- `09:41:34` asks agent: “”
- `09:41:41` ai · dbt_orders — +1 dimension
- `09:41:43` ai · dbt_orders — re-run, same shape
- `09:44:20` exploreView · dbt_orders — -1 dimension; -1 sort
- `09:44:38` exploreView · dbt_orders — +1 sort

## Episode 28 · 555ac5650c · 2026-08-18 09:46Z · 10 min · 18 steps · exploration, no save

- `09:46:38` exploreView · ai_token_usage — starts: 1 metric, 2 dimensions, 2 filters, 1 sort
- `09:46:38` exploreView · ai_token_usage — re-run, same shape
- `09:48:13` exploreView · ai_token_usage — re-run, same shape
- `09:48:13` exploreView · ai_token_usage — re-run, same shape
- `09:50:12` exploreView · ai_token_usage — +1 dimension
- `09:50:12` exploreView · ai_token_usage — re-run, same shape
- `09:50:26` metricsExplorer · linear_customer_requests — -2 dimensions; -1 sort (2 queries)
- `09:50:26` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `09:50:35` views chart “None” (+1 more)
- `09:50:35` views dashboard “[customer] Usage”
- `09:50:36` dashboardView · organizations_daily — re-run, same shape
- `09:50:36` dashboardView · ai_agent_usage — +1 metric
- `09:51:49` exploreView · ai_token_usage — -1 metric; +1 dimension; +1 sort
- `09:51:49` exploreView · ai_token_usage — re-run, same shape
- `09:53:57` exploreView · ai_token_usage — re-run, same shape
- `09:53:58` exploreView · ai_token_usage — re-run, same shape
- `09:56:17` exploreView · ai_token_usage — re-run, same shape
- `09:56:17` exploreView · ai_token_usage — re-run, same shape

## Episode 29 · 770e22bd81 · 2026-08-18 15:54Z · 10 min · 4 steps · exploration, no save

- `15:54:22` exploreView · dbt_orders — starts: 1 metric, 2 dimensions, 1 sort
- `15:57:48` exploreView · dbt_orders — re-run, same shape
- `16:04:37` metricsExplorer · dbt_orders — -1 dimension; +2 filters; -1 sort (6 queries)
- `16:04:37` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)

## Episode 30 · 995966fd22 · 2026-08-19 09:22Z · 31 min · 42 steps · exploration→save

- `09:22:42` views chart “Deal funnel (number of deals)” (+7 more)
- `09:22:42` views dashboard “Sales Pipeline”
- `09:22:43` dashboardView · accounts — starts: 2 metrics, 1 dimension, 2 filters (2 queries)
- `09:22:43` dashboardView · deals — +1 dimension (6 queries)
- `09:23:10` views chart “Deal funnel (number of deals)” (+13 more)
- `09:23:10` views dashboard “Copy of Sales Pipeline”
- `09:23:10` dashboardView · accounts — -1 dimension; +1 filter (7 queries)
- `09:23:10` dashboardView · deals — +1 dimension; -1 filter (23 queries)
- `09:23:48` saves dashboard “Copy of Sales Pipeline”
- `09:24:05` views dashboard “Copy of Sales Pipeline”
- `09:24:10` saves dashboard “Copy of Sales Pipeline”
- `09:24:10` dashboardView · deals — +1 filter (23 queries)
- `09:24:10` dashboardView · accounts — -1 dimension; +1 filter (7 queries)
- `09:24:26` saves dashboard “Copy of Sales Pipeline”
- `09:24:27` views chart “Deal funnel (number of deals)” (+13 more)
- `09:34:05` exploreView · deals — -2 metrics; -4 filters; +1 sort
- `09:34:05` exploreView · deals — -1 sort
- `09:34:09` exploreView · deals — re-run, same shape
- `09:34:10` exploreView · deals — +1 metric
- `09:34:14` exploreView · deals — re-run, same shape
- `09:34:22` exploreView · deals — +1 table calc
- `09:34:50` exploreView · deals — +1 sort
- `09:34:58` exploreView · deals — re-run, same shape
- `09:46:08` exploreView · deals — -1 dimension; -1 table calc
- `09:46:08` exploreView · deals — -1 sort
- `09:46:12` exploreView · deals — +1 dimension; +1 sort
- `09:46:19` exploreView · deals — +1 metric
- `09:46:30` exploreView · deals — +1 sort
- `09:46:43` exploreView · deals — -1 sort
- `09:46:47` exploreView · deals — re-run, same shape
- `09:47:43` exploreView · deals — +1 dimension
- `09:50:32` exploreView · deals — +1 metric; +1 custom metric
- `09:51:12` exploreView · deals — +1 metric; +1 custom metric
- `09:51:27` exploreView · deals — re-run, same shape
- `09:51:40` exploreView · deals — -1 metric; -1 custom metric
- `09:51:49` exploreView · deals — +1 metric; +1 custom metric
- `09:51:57` exploreView · deals — -1 metric; -1 custom metric
- `09:52:01` exploreView · deals — -1 metric
- `09:52:05` exploreView · deals — -1 metric; -1 custom metric
- `09:53:12` exploreView · deals — +1 metric; +1 custom metric
- `09:53:42` exploreView · deals — +1 metric; +1 custom metric
- `09:54:10` exploreView · deals — +1 filter

## Episode 31 · 995966fd22 · 2026-08-20 07:40Z · 14 min · 11 steps · exploration, no save

- `07:40:49` views chart “Won Revenue (Period-to-Date)”
- `07:40:49` exploreView · deals — starts: 2 metrics, 1 dimension, 1 filter, 1 sort, 1 custom metric
- `07:42:49` exploreView · deals — -2 metrics; -1 filter; -1 sort; -1 custom metric
- `07:42:49` exploreView · deals — +1 sort
- `07:42:56` exploreView · deals — +1 metric
- `07:43:03` views chart “None”
- `07:43:04` chartView · deals — re-run, same shape
- `07:45:32` views chart “None”
- `07:45:33` chartView · deals — re-run, same shape
- `07:55:08` views chart “None”
- `07:55:11` chartView · activities — +1 dimension

## Episode 32 · 2bb4036c9c · 2026-08-20 10:32Z · 20 min · 29 steps · exploration→save

- `10:32:23` metricsExplorer · dbt_orders — starts: 1 metric, 1 dimension, 2 filters (6 queries)
- `10:32:23` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `10:33:35` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `10:33:35` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `10:34:59` exploreView · dbt_baskets — -1 metric; -2 filters; +1 sort
- `10:35:00` exploreView · dbt_baskets — +1 metric
- `10:35:59` views chart “None”
- `10:35:59` saves dashboard “Josh Test”
- `10:36:00` chartView · dbt_baskets — re-run, same shape
- `10:39:06` exploreView · dbt_baskets — re-run, same shape
- `10:39:30` views dashboard “Josh Test”
- `10:39:31` views chart “None”
- `10:39:31` dashboardView · dbt_baskets — -1 sort
- `10:39:44` exploreView · dbt_baskets — -1 dimension; +1 sort
- `10:39:44` exploreView · dbt_baskets — -1 sort
- `10:42:05` exploreView · dbt_users — -1 metric; +1 dimension; +1 sort
- `10:43:04` exploreView · dbt_baskets — -1 sort
- `10:43:05` exploreView · dbt_baskets — +1 sort
- `10:43:10` exploreView · dbt_baskets — +1 metric
- `10:43:16` exploreView · merge — +1 metric; -1 sort
- `10:47:14` exploreView · dbt_support_requests — -1 metric; +1 filter; +1 sort
- `10:50:21` views dashboard “🧭 KPI dashboard”
- `10:50:22` views chart “How much revenue are we making each month?” (+12 more)
- `10:50:23` dashboardView · dbt_orders — +4 metrics; +1 dimension; -1 sort (10 queries)
- `10:50:23` dashboardView · dbt_baskets — -4 metrics (2 queries)
- `10:50:23` dashboardView · dbt_users — -1 dimension; -1 filter
- `10:51:19` viewUnderlyingData · dbt_orders — -1 metric; +42 dimensions; +1 filter
- `10:51:36` exploreView · dbt_orders — -1 metric; +42 dimensions; +1 filter; +1 sort
- `10:52:18` exploreView · dbt_orders — -1 sort

## Episode 33 · 995966fd22 · 2026-08-20 11:39Z · 10 min · 29 steps · exploration, no save

- `11:39:25` exploreView · deals — starts: 1 metric, 1 sort
- `11:39:25` exploreView · deals — -1 sort
- `11:39:27` exploreView · deals — +1 dimension; +1 sort
- `11:39:37` exploreView · deals — -1 dimension
- `11:39:40` exploreView · deals — +1 dimension
- `11:39:57` exploreView · deals — +1 metric; +1 custom metric
- `11:40:01` exploreView · deals — +1 filter
- `11:40:05` exploreView · deals — re-run, same shape
- `11:40:07` exploreView · deals — re-run, same shape
- `11:40:38` exploreView · deals — +1 dimension
- `11:40:46` exploreView · deals — -1 metric; -1 custom metric
- `11:40:57` exploreView · deals — -1 dimension
- `11:41:13` exploreView · deals — +1 metric; +1 custom metric
- `11:41:23` exploreView · deals — +1 sort
- `11:41:24` exploreView · deals — -1 sort
- `11:41:26` exploreView · deals — re-run, same shape
- `11:42:14` exploreView · deals — +1 dimension
- `11:42:21` exploreView · deals — +1 sort
- `11:42:22` exploreView · deals — re-run, same shape
- `11:42:26` exploreView · deals — re-run, same shape
- `11:43:45` exploreView · deals — re-run, same shape
- `11:43:52` exploreView · deals — -1 dimension; -1 sort
- `11:49:22` exploreView · deals — -2 metrics; -1 filter; -1 sort; -1 custom metric
- `11:49:22` exploreView · deals — +1 sort
- `11:49:23` exploreView · deals — +1 dimension
- `11:49:33` exploreView · deals — +1 metric
- `11:49:38` exploreView · deals — +1 metric
- `11:49:51` exploreView · deals — +1 metric
- `11:49:52` exploreView · deals — re-run, same shape

## Episode 34 · 995966fd22 · 2026-08-20 12:37Z · 6 min · 3 steps · exploration, no save

- `12:37:54` exploreView · deals — starts: 1 metric, 4 dimensions, 1 sort
- `12:37:57` exploreView · deals — -1 dimension; -1 sort
- `12:43:47` exploreView · deals — +1 dimension

## Episode 35 · 995966fd22 · 2026-08-21 10:08Z · 16 min · 25 steps · exploration→save

- `10:08:24` exploreView · dbt_orders — starts: 1 dimension
- `10:08:24` exploreView · dbt_orders — +1 sort
- `10:08:25` exploreView · dbt_orders — +1 dimension
- `10:08:26` exploreView · dbt_orders — +2 dimensions
- `10:08:26` exploreView · dbt_orders — -1 dimension
- `10:08:28` exploreView · dbt_orders — +1 metric; +1 dimension
- `10:08:29` exploreView · dbt_orders — +2 metrics
- `10:08:29` exploreView · dbt_orders — -1 metric
- `10:08:30` exploreView · dbt_orders — +2 metrics
- `10:08:55` views dashboard “Copy of 🧭 KPI dashboard”
- `10:08:57` saves dashboard “Copy of 🧭 KPI dashboard”
- `10:09:00` exploreView · dbt_orders — re-run, same shape
- `10:09:12` views chart “How much revenue are we making each month?” (+11 more)
- `10:09:12` views dashboard “Copy of 🧭 KPI dashboard”
- `10:09:13` dashboardView · dbt_orders — +1 metric; +2 filters; -1 sort (11 queries)
- `10:09:13` dashboardView · dbt_users — -4 metrics; -3 dimensions; -1 filter
- `10:09:47` exploreView · dbt_orders — +3 metrics; +3 dimensions; -1 filter; +1 sort
- `10:10:37` views dashboard “Copy of 🧭 KPI dashboard”
- `10:10:38` views chart “How much revenue are we making each month?” (+11 more)
- `10:24:27` metricsExplorer · dbt_orders — -3 metrics; -3 dimensions; +2 filters; -1 sort (6 queries)
- `10:24:27` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `10:24:30` views dashboard “Copy of 🧭 KPI dashboard”
- `10:24:31` views chart “How much revenue are we making each month?” (+11 more)
- `10:24:32` dashboardView · dbt_users — -1 filter
- `10:24:32` dashboardView · dbt_orders — +4 metrics; +3 dimensions; +1 filter (11 queries)

## Episode 36 · 995966fd22 · 2026-08-21 10:53Z · 8 min · 13 steps · exploration→save

- `10:53:38` views chart “None”
- `10:53:39` exploreView · dbt_orders — starts: 4 metrics, 4 dimensions, 1 sort
- `10:53:41` exploreView · dbt_orders — -1 dimension
- `10:53:41` exploreView · dbt_orders — -1 dimension
- `10:53:42` exploreView · dbt_orders — -1 dimension
- `10:54:15` exploreView · dbt_orders — +1 table calc
- `10:54:20` updates chart “What are the order metrics by referrer and partner?” (table, None)
- `10:54:21` exploreView · dbt_orders — re-run, same shape
- `10:54:22` views dashboard “Copy of 🧭 KPI dashboard”
- `10:54:23` views chart “How much revenue are we making each month?” (+10 more)
- `10:54:24` dashboardView · dbt_orders — +1 filter; -1 sort; -1 table calc
- `11:02:07` views chart “None”
- `11:02:07` exploreView · dbt_orders — -1 filter; +1 sort; +1 table calc

## Episode 37 · 60f838975e · 2026-08-25 09:45Z · 3 min · 5 steps · exploration, no save

- `09:45:41` exploreView · dbt_orders — starts: 1 dimension, 1 sort
- `09:45:41` exploreView · dbt_orders — -1 sort
- `09:45:43` exploreView · dbt_orders — +1 metric; +1 sort
- `09:48:49` exploreView · dbt_orders — -1 dimension; -1 sort
- `09:48:49` exploreView · dbt_orders — +1 sort

## Episode 38 · 4754d59202 · 2026-08-25 17:57Z · 4 min · 2 steps · exploration, no save

- `17:57:29` sqlRunner · sql_query_explorer — runs SQL
- `18:01:42` sqlRunner · sql_query_explorer — runs SQL

## Episode 39 · 60f838975e · 2026-08-26 13:18Z · 13 min · 20 steps · exploration, no save

- `13:18:39` metricsExplorer · organizations_daily — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `13:18:39` metricsExplorer · linear_customer_requests — re-run, same shape (2 queries)
- `13:18:51` exploreView · sales_pipeline — -1 dimension; -2 filters
- `13:18:51` exploreView · sales_pipeline — +1 sort
- `13:18:52` exploreView · sales_pipeline — +1 dimension
- `13:19:06` exploreView · sales_pipeline — +1 dimension
- `13:19:16` exploreView · sales_pipeline — +1 dimension
- `13:19:17` exploreView · sales_pipeline — +1 metric
- `13:19:17` exploreView · sales_pipeline — +1 metric
- `13:19:24` exploreView · sales_accounts — -2 metrics; -3 dimensions
- `13:19:24` exploreView · sales_accounts — -1 sort
- `13:19:28` exploreView · sales_accounts — +1 dimension; +1 sort
- `13:23:32` metricsExplorer · linear_customer_requests — +2 filters; -1 sort (2 queries)
- `13:23:32` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `13:27:51` exploreView · charts — -1 metric; -2 filters; +1 sort
- `13:27:51` exploreView · charts — -1 sort
- `13:27:52` exploreView · charts — +1 dimension; +1 sort
- `13:27:54` exploreView · charts — +1 dimension
- `13:27:55` exploreView · charts — +1 metric
- `13:31:39` exploreView · charts — re-run, same shape

## Episode 40 · 770e22bd81 · 2026-08-26 13:32Z · 0 min · 2 steps · exploration, no save

- `13:32:24` exploreView · custom_chart_types — starts: 1 metric, 2 dimensions, 1 sort
- `13:32:29` exploreView · custom_chart_types — -1 dimension

## Episode 41 · 6ca2547ca4 · 2026-08-27 13:09Z · 15 min · 14 steps · exploration, no save

- `13:09:08` exploreView · ai_token_usage — starts: 3 metrics, 4 dimensions, 2 filters, 1 sort, 1 custom metric
- `13:20:48` exploreView · ai_token_usage — +1 dimension
- `13:21:13` exploreView · ai_token_usage — re-run, same shape
- `13:21:15` exploreView · ai_token_usage — -1 filter
- `13:21:33` exploreView · ai_token_usage — -1 dimension
- `13:21:35` exploreView · ai_token_usage — -1 dimension
- `13:21:44` exploreView · ai_token_usage — -1 metric; -1 custom metric
- `13:21:53` exploreView · ai_token_usage — -1 metric
- `13:21:56` exploreView · ai_token_usage — -1 dimension
- `13:23:08` exploreView · ai_token_usage — +1 filter
- `13:23:13` exploreView · ai_token_usage — re-run, same shape
- `13:23:27` exploreView · ai_token_usage — re-run, same shape
- `13:23:53` exploreView · ai_token_usage — re-run, same shape
- `13:24:10` exploreView · ai_token_usage — -1 sort

## Episode 42 · 5aa80fd8b1 · 2026-08-27 17:23Z · 19 min · 15 steps · exploration, no save

- `17:23:02` metricsExplorer · deals — starts: 2 metrics, 1 dimension, 1 filter (3 queries)
- `17:27:01` views chart “None” (+11 more)
- `17:27:17` views dashboard “LumaLeaf GTM Strategy”
- `17:27:35` chartView · deals — -1 metric; +1 dimension; -1 filter; +1 sort
- `17:28:44` metricsExplorer · deals — -1 dimension; +1 filter; -1 sort
- `17:28:47` views chart “None” (+26 more)
- `17:28:47` views dashboard “LumaLeaf GTM Strategy”
- `17:30:54` views dashboard “Plumly Sales”
- `17:30:55` views chart “None” (+13 more)
- `17:30:55` dashboardView · deals — +1 metric; +1 dimension; +2 filters (12 queries)
- `17:30:57` dashboardView · accounts — -1 dimension
- `17:37:09` views chart “None” (+1 more)
- `17:37:22` chartView · deals — -1 metric; -3 filters; +1 sort
- `17:38:37` exploreView · deals — re-run, same shape
- `17:41:46` exploreView · deals — re-run, same shape

## Episode 43 · 770e22bd81 · 2026-08-28 11:21Z · 31 min · 8 steps · exploration, no save

- `11:21:56` metricsExplorer · dbt_orders — starts: 1 metric, 1 dimension, 2 filters (6 queries)
- `11:21:56` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `11:22:12` exploreView · dbt_orders — +1 dimension; -2 filters; +1 sort
- `11:22:34` exploreView · dbt_orders — -1 sort
- `11:34:03` metricsExplorer · dbt_support_requests — -1 dimension; +2 filters (2 queries)
- `11:34:03` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `11:43:37` exploreView · dbt_orders — +1 dimension; -2 filters; +1 sort
- `11:52:46` viewUnderlyingData · dbt_orders — -1 metric; +41 dimensions; +2 filters; -1 sort

## Episode 44 · d585e72a02 · 2026-08-28 15:33Z · 30 min · 51 steps · exploration, no save

- `15:33:48` metricsExplorer · organizations_daily — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `15:33:48` metricsExplorer · linear_customer_requests — re-run, same shape (2 queries)
- `15:37:09` exploreView · charts — -1 metric; -2 filters
- `15:37:09` exploreView · charts — +1 sort
- `15:37:10` exploreView · charts — +1 metric
- `15:46:17` views chart “None” (+43 more)
- `15:46:17` views dashboard “[customer] Usage”
- `15:46:17` chartView · ai_agent_usage — +1 dimension
- `15:46:18` dashboardView · ai_agent_usage — +1 metric; -1 dimension; +2 filters; -1 sort
- `15:46:21` views dashboard “🪙 AI Token Spend”
- `15:46:21` dashboardView · organizations_daily — -1 metric
- `15:46:21` dashboardView · ai_token_usage — +6 metrics; +3 dimensions; +2 filters (27 queries)
- `15:46:22` views dashboard “None”
- `15:46:22` dashboardView · ai_agent_usage — -4 metrics; -2 dimensions; +1 filter (11 queries)
- `15:46:55` views dashboard “Deep-Dive: 🚛 Engineering velocity”
- `15:46:55` dashboardView · github_activity — -1 metric; -1 dimension (4 queries)
- `15:46:58` asks agent: “”
- `15:48:01` chartView · sales_accounts — -1 metric; -1 dimension; -5 filters
- `15:48:03` views chart “None” (+1 more)
- `15:48:05` chartView · sales_accounts — re-run, same shape
- `15:48:06` chartView · sales_accounts — re-run, same shape
- `15:48:07` chartView · sales_accounts — re-run, same shape
- `15:48:08` chartView · sales_accounts — re-run, same shape
- `15:48:08` chartView · sales_accounts — re-run, same shape
- `15:48:17` chartView · ai_agent_usage — +1 dimension; +1 sort
- `15:48:29` chartView · ai_agent_usage — re-run, same shape
- `15:48:31` chartView · ai_agent_usage — re-run, same shape
- `15:48:34` chartView · ai_agent_usage — re-run, same shape
- `15:48:37` chartView · ai_agent_usage — re-run, same shape
- `15:48:40` chartView · ai_agent_usage — re-run, same shape
- `15:49:35` chartView · ai_agent_usage — -1 dimension; -1 sort
- `15:49:37` views chart “None” (+1 more)
- `15:49:39` chartView · ai_agent_usage — re-run, same shape
- `15:49:42` chartView · ai_agent_usage — re-run, same shape
- `15:49:45` chartView · ai_agent_usage — re-run, same shape
- `15:49:48` chartView · ai_agent_usage — +1 dimension; +1 sort
- `15:49:52` chartView · ai_agent_usage — re-run, same shape
- `15:50:59` chartView · homepage_usage — re-run, same shape
- `15:51:01` views chart “None”
- `15:55:35` asks agent: “”
- `15:56:03` views chart “None” (+2 more)
- `15:56:16` ai · pylon_issues — +1 filter; +1 table calc
- `15:59:02` views chart “None”
- `15:59:02` chartView · pylon_issues — re-run, same shape
- `16:00:47` asks agent: “”
- `16:00:59` ai · pylon_issues — +1 filter; -1 table calc
- `16:02:47` asks agent: “”
- `16:03:14` ai · pylon_issues — -1 metric; +7 dimensions; +1 filter
- `16:03:23` ai · pylon_issues — +1 metric; -7 dimensions
- `16:03:33` ai · pylon_issues — +2 metrics; +2 custom metrics
- `16:03:55` ai · pylon_issues — -3 metrics; +7 dimensions; -2 custom metrics

## Episode 45 · a45abc0c1d · 2026-08-31 14:56Z · 20 min · 33 steps · exploration, no save

- `14:56:41` views chart “None” (+10 more)
- `14:56:41` views dashboard “None”
- `14:56:42` dashboardView · fct_fpa — starts: 3 metrics, 3 dimensions, 3 filters (11 queries)
- `14:57:40` views chart “None” (+22 more)
- `14:57:40` views dashboard “None”
- `14:57:40` dashboardView · dim_study — -2 metrics; -2 dimensions; -3 filters (3 queries)
- `14:57:40` dashboardView · fct_fpa — +5 metrics; +2 dimensions; +1 filter (8 queries)
- `14:57:41` dashboardView · dim_patient — -5 metrics; -2 dimensions; -1 filter
- `14:57:49` views dashboard “None”
- `15:08:46` views dashboard “None”
- `15:08:47` views chart “None” (+10 more)
- `15:08:47` dashboardView · fct_fpa — +2 metrics; +2 dimensions; +3 filters (11 queries)
- `15:09:17` exploreView · fct_fpa — -3 metrics; -2 dimensions; -3 filters; +1 sort
- `15:09:58` exploreView · fct_fpa — +3 metrics; +2 dimensions
- `15:10:07` exploreView · fct_fpa — re-run, same shape
- `15:10:28` exploreView · fct_fpa — +1 dimension
- `15:10:29` exploreView · fct_fpa — re-run, same shape
- `15:11:01` exploreView · fct_fpa — re-run, same shape
- `15:11:01` exploreView · fct_fpa — re-run, same shape
- `15:11:13` exploreView · fct_fpa — re-run, same shape
- `15:11:13` exploreView · fct_fpa — re-run, same shape
- `15:11:35` exploreView · fct_fpa — re-run, same shape
- `15:11:35` exploreView · fct_fpa — re-run, same shape
- `15:11:50` exploreView · fct_fpa — re-run, same shape
- `15:11:50` exploreView · fct_fpa — re-run, same shape
- `15:13:22` exploreView · fct_fpa — -3 metrics; -3 dimensions
- `15:13:33` exploreView · fct_fpa — +1 dimension
- `15:13:39` exploreView · fct_fpa — +1 dimension
- `15:14:34` exploreView · fct_fpa — +14 metrics; +6 dimensions; -1 sort
- `15:14:43` exploreView · fct_fpa — re-run, same shape
- `15:16:51` views dashboard “None”
- `15:16:55` views chart “None” (+11 more)
- `15:16:56` dashboardView · fct_fpa — +3 filters (12 queries)

## Episode 46 · 323aadea7d · 2026-09-01 09:05Z · 13 min · 14 steps · exploration, no save

- `09:05:09` exploreView · github_activity — starts: 2 metrics, 1 dimension, 6 filters, 1 sort, 2 table calcs, 2 custom metrics
- `09:05:40` exploreView · github_activity — +1 filter; -1 sort
- `09:17:40` views chart “None” (+7 more)
- `09:17:40` views dashboard “Event Analytics”
- `09:17:40` chartView · ai_token_usage — -1 metric; +2 dimensions; -5 filters; +1 sort; -2 table calcs; -2 custom metrics
- `09:17:40` chartView · ai_token_usage — re-run, same shape
- `09:17:43` chartView · ai_token_usage — re-run, same shape
- `09:17:44` dashboardView · events — +1 metric; -1 dimension; -1 filter; -1 sort (4 queries)
- `09:17:46` chartView · ai_token_usage — -1 metric; +1 dimension; +1 filter; +1 sort
- `09:17:49` chartView · ai_token_usage — re-run, same shape
- `09:17:51` views dashboard “Deep-Dive: 🚛 Engineering velocity”
- `09:17:51` dashboardView · github_activity — +1 metric; -2 dimensions; +3 filters; -1 sort (3 queries)
- `09:17:54` views dashboard “None”
- `09:17:54` dashboardView · ai_agent_usage — +1 metric; -2 filters (2 queries)

## Episode 47 · 19f38854e0 · 2026-09-02 07:19Z · 11 min · 14 steps · exploration, no save

- `07:19:50` metricsExplorer · linear_customer_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `07:19:50` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `07:19:58` exploreView · charts — -1 metric; -2 filters
- `07:19:58` exploreView · charts — +1 sort
- `07:19:59` exploreView · charts — +1 metric
- `07:20:57` metricsExplorer · organizations_daily — +2 filters; -1 sort (2 queries)
- `07:20:57` metricsExplorer · linear_customer_requests — re-run, same shape (2 queries)
- `07:28:06` exploreView · custom_chart_types — -1 metric; -2 filters
- `07:28:06` exploreView · custom_chart_types — +1 sort
- `07:28:07` exploreView · custom_chart_types — +1 dimension
- `07:28:08` exploreView · custom_chart_types — +1 metric
- `07:28:18` metricsExplorer · linear_customer_requests — -1 dimension; +2 filters; -1 sort (2 queries)
- `07:28:19` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `07:31:16` sqlRunner · sql_query_explorer — runs SQL

## Episode 48 · dec4584234 · 2026-09-02 14:52Z · 1 min · 6 steps · exploration, no save

- `14:52:51` metricsExplorer · linear_customer_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `14:52:51` metricsExplorer · organizations_daily — re-run, same shape (2 queries)
- `14:53:40` exploreView · pre_aggregate_usage — -1 metric; -2 filters; +1 sort
- `14:53:40` exploreView · pre_aggregate_usage — -1 sort
- `14:53:41` exploreView · pre_aggregate_usage — +1 dimension; +1 sort
- `14:54:10` exploreView · pre_aggregate_usage — +1 dimension

## Episode 49 · 555ac5650c · 2026-09-02 15:59Z · 3 min · 14 steps · exploration→save

- `15:59:55` views chart “None” (+1 more)
- `15:59:55` views dashboard “[customer] Usage”
- `15:59:56` dashboardView · ai_agent_usage — starts: 2 metrics, 1 dimension, 2 filters
- `15:59:56` dashboardView · organizations_daily — -1 metric
- `16:00:08` exploreView · ai_agent_usage — +1 metric; +1 sort; +1 table calc
- `16:00:36` exploreView · ai_agent_usage — -1 sort
- `16:00:41` views chart “None”
- `16:00:42` exploreView · ai_agent_usage — re-run, same shape
- `16:00:42` exploreView · ai_agent_usage — +1 sort
- `16:02:43` updates chart “What is the weekly AI agent usage and overage cost for the past 12 weeks?” (table, None)
- `16:02:44` exploreView · ai_agent_usage — re-run, same shape
- `16:02:47` views dashboard “[customer] Usage”
- `16:02:48` views chart “None”
- `16:02:48` dashboardView · ai_agent_usage — -1 sort; -1 table calc

## Episode 50 · 555ac5650c · 2026-09-02 17:40Z · 72 min · 135 steps · exploration, no save

- `17:40:08` metricsExplorer · dbt_support_requests — starts: 1 metric, 1 dimension, 2 filters (2 queries)
- `17:40:08` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:42:03` ai · dbt_orders — +1 metric; -1 filter; +1 sort
- `17:43:30` metricsExplorer · dbt_orders — -1 metric; +1 filter; -1 sort (6 queries)
- `17:43:30` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:43:58` views chart “How much revenue are we making each month?” (+13 more)
- `17:43:58` views dashboard “🧭 KPI dashboard”
- `17:43:59` dashboardView · dbt_orders — +4 metrics; +1 dimension; -1 filter (11 queries)
- `17:43:59` dashboardView · dbt_users — -4 metrics; -1 dimension; -1 filter
- `17:43:59` dashboardView · dbt_baskets — +2 dimensions; +1 filter (2 queries)
- `17:44:17` metricsExplorer · dbt_orders — -2 dimensions; +1 filter (6 queries)
- `17:44:17` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:45:08` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:45:08` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:46:00` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:46:00` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:46:03` views chart “How much revenue are we making each month?” (+13 more)
- `17:46:03` views dashboard “🧭 KPI dashboard”
- `17:46:10` exploreView · dbt_orders — -1 filter; +1 sort
- `17:47:08` metricsExplorer · dbt_support_requests — +1 filter; -1 sort (2 queries)
- `17:47:08` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:48:23` metricsExplorer · dbt_orders — re-run, same shape (12 queries)
- `17:48:23` metricsExplorer · dbt_support_requests — re-run, same shape (4 queries)
- `17:49:34` ai · dbt_orders — +1 metric; -1 filter; +1 sort
- `17:50:33` metricsExplorer · dbt_users — -1 metric; +1 filter; -1 sort (2 queries)
- `17:50:42` metricsExplorer · dbt_orders_no_preagg — re-run, same shape (2 queries)
- `17:50:55` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:50:56` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:51:05` views chart “How much revenue are we making each month?” (+13 more)
- `17:51:05` views dashboard “🧭 KPI dashboard”
- `17:51:55` exploreView · dbt_baskets — -2 filters; +1 sort
- `17:52:21` exploreView · dbt_baskets — +1 table calc
- `17:52:37` exploreView · dbt_baskets — re-run, same shape
- `17:53:31` metricsExplorer · dbt_orders — +2 filters; -1 sort; -1 table calc (6 queries)
- `17:53:32` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:54:53` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:54:53` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:55:13` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:55:13` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:56:15` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:56:15` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:57:48` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:57:48` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:58:21` views chart “None”
- `17:58:50` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `17:58:50` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `17:59:04` views chart “None”
- `18:04:06` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `18:04:06` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `18:09:35` metricsExplorer · dbt_support_requests — re-run, same shape (2 queries)
- `18:09:35` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `18:09:58` views chart “How much revenue are we making each month?” (+13 more)
- `18:09:58` views dashboard “🧭 KPI dashboard”
- `18:09:59` dashboardView · dbt_orders — +4 metrics; +1 dimension; -1 filter (11 queries)
- `18:09:59` dashboardView · dbt_users — -4 metrics; -1 dimension; -1 filter
- `18:09:59` dashboardView · dbt_baskets — +2 dimensions; +1 filter (2 queries)
- `18:10:25` views dashboard “🧭 KPI dashboard”
- `18:10:25` dashboardView · dbt_baskets — re-run, same shape (4 queries)
- `18:10:25` dashboardView · dbt_orders — +4 metrics; -1 dimension; +1 filter (22 queries)
- `18:10:26` dashboardView · dbt_users — -4 metrics; -1 dimension; -2 filters (2 queries)
- `18:10:52` views chart “None”
- `18:11:09` asks agent: “”
- `18:11:14` views chart “None”
- `18:11:18` ai · dbt_baskets — +1 sort
- `18:11:45` metricsExplorer · dbt_support_requests — +2 filters; -1 sort (4 queries)
- `18:11:45` metricsExplorer · dbt_orders — re-run, same shape (12 queries)
- `18:11:47` ai · dbt_orders — +4 metrics; -1 filter; +1 sort
- `18:11:59` ai · dbt_orders — re-run, same shape
- `18:12:02` views dashboard “🧭 KPI dashboard”
- `18:12:24` views chart “What is our weekly average feedback rating (out of 10)?” (+11 more)
- `18:13:15` ai · dbt_orders — -3 metrics
- `18:13:29` exploreView · dbt_orders — re-run, same shape
- `18:14:16` exploreView · dbt_orders — re-run, same shape
- `18:14:51` metricsExplorer · dbt_support_requests — -1 metric; +1 filter; -1 sort (2 queries)
- `18:14:51` metricsExplorer · dbt_orders — re-run, same shape (6 queries)
- `18:14:53` views chart “How much revenue are we making each month?” (+13 more)
- `18:14:53` views dashboard “🧭 KPI dashboard”
- `18:14:54` dashboardView · dbt_orders — +4 metrics; +1 dimension; -1 filter (11 queries)
- `18:14:54` dashboardView · dbt_baskets — -4 metrics; +1 dimension (2 queries)
- `18:14:54` dashboardView · dbt_users — -2 dimensions; -1 filter
- … 55 more steps

