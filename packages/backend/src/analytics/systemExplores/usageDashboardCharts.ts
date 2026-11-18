import { FilterOperator } from '@lightdash/common';
import { monthlyQueryComparisonCharts } from './monthlyQueryComparisonCharts';
import type { UsageChartSpec } from './usageDashboardTypes';

export const usageChartSpecs: UsageChartSpec[] = [
    ...monthlyQueryComparisonCharts,
    {
        key: 'assessment-pass-rate-by-day',
        name: 'Assessment pass rate by day',
        description:
            'Passing assessments divided by all assessments, grouped by the day the run started. Runs without assessments do not contribute to the rate.',
        explore: 'agent_evaluation_runs',
        dimensions: ['agent_evaluation_runs_event_ts_day'],
        metrics: ['agent_evaluation_runs_pass_rate'],
        visualization: 'line',
        timezone: 'UTC',
        limit: 365,
        sorts: [
            {
                fieldId: 'agent_evaluation_runs_event_ts_day',
                descending: false,
            },
        ],
    },
    {
        key: 'assessment-volume-by-day',
        name: 'Passing and failing assessments by day',
        description:
            'Assessment count behind each day’s pass rate. Human and AI assessments count separately, matching the run summary.',
        explore: 'agent_evaluation_runs',
        dimensions: ['agent_evaluation_runs_event_ts_day'],
        metrics: [
            'agent_evaluation_runs_passed_assessments',
            'agent_evaluation_runs_failed_assessments',
        ],
        visualization: 'line',
        timezone: 'UTC',
        limit: 365,
        sorts: [
            {
                fieldId: 'agent_evaluation_runs_event_ts_day',
                descending: false,
            },
        ],
    },
    {
        key: 'quality-by-evaluation',
        name: 'Quality by agent and evaluation',
        description:
            'Compare retained runs and assessment outcomes across agents and evaluations.',
        explore: 'agent_evaluation_runs',
        dimensions: [
            'agent_evaluation_runs_agent_name',
            'agent_evaluation_runs_agent_id',
            'agent_evaluation_runs_evaluation_name',
            'agent_evaluation_runs_evaluation_id',
        ],
        metrics: [
            'agent_evaluation_runs_total_runs',
            'agent_evaluation_runs_pass_rate',
            'agent_evaluation_runs_passed_assessments',
            'agent_evaluation_runs_failed_assessments',
            'agent_evaluation_runs_unassessed_results',
            'agent_evaluation_runs_execution_errors',
        ],
        limit: 100,
        sorts: [
            { fieldId: 'agent_evaluation_runs_total_runs', descending: true },
        ],
    },
    {
        key: 'recent-evaluation-runs',
        name: 'Recent evaluation runs',
        description:
            'The 100 most recent completed or failed runs in the selected period. Execution errors and negative assessments are different outcomes.',
        explore: 'agent_evaluation_runs',
        dimensions: [
            'agent_evaluation_runs_event_ts_raw',
            'agent_evaluation_runs_agent_name',
            'agent_evaluation_runs_evaluation_name',
            'agent_evaluation_runs_run_status',
            'agent_evaluation_runs_run_id',
        ],
        metrics: [
            'agent_evaluation_runs_pass_rate',
            'agent_evaluation_runs_passed_assessments',
            'agent_evaluation_runs_failed_assessments',
            'agent_evaluation_runs_unassessed_results',
            'agent_evaluation_runs_execution_errors',
        ],
        timezone: 'UTC',
        limit: 100,
        sorts: [
            { fieldId: 'agent_evaluation_runs_event_ts_raw', descending: true },
        ],
    },
    {
        key: 'most-used-fields',
        name: 'Most-used metrics and dimensions',
        description:
            'Distinct query attempts per field, including selected, filtered, grouped and sorted references. Names are those captured at execution; a renamed label can appear separately. Field totals overlap.',
        explore: 'semantic_usage',
        dimensions: [
            'semantic_usage_field_label',
            'semantic_usage_table_name',
            'semantic_usage_field_kind',
            'semantic_usage_field_origin',
            'semantic_usage_field_id',
            'semantic_usage_project_id',
        ],
        metrics: [
            'semantic_usage_total_queries',
            'semantic_usage_unique_users',
            'semantic_usage_unique_charts',
            'semantic_usage_unique_dashboards',
            'semantic_usage_unique_apps',
        ],
        filters: [
            {
                field: 'semantic_usage_field_kind',
                values: ['metric', 'dimension'],
            },
        ],
        limit: 40,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
    },
    {
        key: 'most-used-fields-cloud',
        name: 'Most-used fields at a glance',
        description:
            'Fields sized by distinct query attempts over the selected period. Names are those captured at execution; a renamed label can appear separately.',
        explore: 'semantic_usage',
        dimensions: ['semantic_usage_field_label'],
        metrics: ['semantic_usage_total_queries'],
        filters: [
            {
                field: 'semantic_usage_field_kind',
                values: ['metric', 'dimension'],
            },
        ],
        limit: 20,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
        visualization: 'bar',
        xField: 'semantic_usage_field_label',
        flipAxes: true,
        libraryChart: {
            slug: 'word-cloud',
            minVersion: '0.4.0',
            fieldMapping: {
                word: 'semantic_usage_field_label',
                size: 'semantic_usage_total_queries',
            },
            optionValues: { showLegend: false },
            query: {
                dimensions: ['semantic_usage_field_label'],
                metrics: ['semantic_usage_total_queries'],
                sorts: [
                    {
                        fieldId: 'semantic_usage_total_queries',
                        descending: true,
                    },
                ],
                limit: 80,
                description:
                    'Fields sized by distinct query attempts over the selected period. Names are those captured at execution; a renamed label can appear separately.',
            },
        },
    },
    {
        key: 'people-using-fields',
        name: 'Who uses each metric and dimension?',
        description:
            'Recorded users and fields, with distinct query attempts. A missing user name does not imply anonymous activity. One query can use several fields.',
        explore: 'semantic_usage',
        dimensions: [
            'semantic_usage_user_name',
            'semantic_usage_user_id',
            'semantic_usage_field_label',
            'semantic_usage_table_name',
            'semantic_usage_field_kind',
            'semantic_usage_field_origin',
            'semantic_usage_field_id',
            'semantic_usage_project_id',
        ],
        metrics: ['semantic_usage_total_queries'],
        filters: [
            {
                field: 'semantic_usage_field_kind',
                values: ['metric', 'dimension'],
            },
        ],
        limit: 50,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
    },
    {
        key: 'content-using-fields',
        name: 'Where are metrics and dimensions used?',
        description:
            'Charts, dashboards and apps associated with recorded field use. Direct exploration and other queries can have no saved-content attribution. Query counts overlap across fields.',
        explore: 'semantic_usage',
        dimensions: [
            'semantic_usage_field_label',
            'semantic_usage_table_name',
            'semantic_usage_field_origin',
            'semantic_usage_field_id',
            'semantic_usage_project_id',
            'semantic_usage_chart_name',
            'semantic_usage_chart_id',
            'semantic_usage_dashboard_name',
            'semantic_usage_dashboard_id',
            'semantic_usage_app_name',
            'semantic_usage_app_id',
            'semantic_usage_context',
        ],
        metrics: ['semantic_usage_total_queries'],
        filters: [
            {
                field: 'semantic_usage_field_kind',
                values: ['metric', 'dimension'],
            },
        ],
        limit: 50,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
    },
    {
        key: 'field-capture-coverage',
        name: 'Queries with field details',
        description:
            'Distinct query attempts by available field detail, including old history and SQL queries. Partial capture can identify some fields; missing details are not evidence of no field use.',
        explore: 'semantic_usage',
        dimensions: ['semantic_usage_lineage_status'],
        metrics: ['semantic_usage_total_queries'],
        limit: 10,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
        visualization: 'bar',
        flipAxes: true,
    },
    {
        key: 'daily-trend',
        name: 'Daily app loads and viewers',
        description:
            'Recorded app activity over the available history, including unknown or removed apps.',
        explore: 'data_app_events',
        dimensions: ['data_app_events_event_ts_day'],
        metrics: [
            'data_app_events_total_views',
            'data_app_events_unique_viewers',
        ],
        limit: 500,
        sorts: [
            {
                descending: false,
                fieldId: 'data_app_events_event_ts_day',
            },
        ],
        visualization: 'line',
        xField: 'data_app_events_event_ts_day',
        yFields: [
            'data_app_events_total_views',
            'data_app_events_unique_viewers',
        ],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'distinct-viewers',
        name: 'Distinct app viewers',
        description:
            'Recorded app activity over the available history, including unknown or removed apps.',
        explore: 'data_app_events',
        dimensions: [],
        metrics: ['data_app_events_unique_viewers'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_unique_viewers',
            },
        ],
        visualization: 'number',
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'top-apps',
        name: 'Most-used apps',
        description:
            'Recorded app loads and viewers by app and project, including unknown or removed apps. Loads include reloads and are not distinct visits.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_app_name',
            'data_app_events_project_name',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: [
            'data_app_events_total_views',
            'data_app_events_unique_viewers',
        ],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_total_views',
            },
        ],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'top-people',
        name: 'Most active app viewers',
        description:
            'Recorded app activity over the available history, including unknown or removed apps.',
        explore: 'data_app_events',
        dimensions: ['data_app_events_user_name', 'data_app_events_user_id'],
        metrics: ['data_app_events_total_views', 'data_app_events_unique_apps'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_total_views',
            },
        ],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'total-loads',
        name: 'Recorded app loads',
        description:
            'Recorded app activity over the available history, including unknown or removed apps.',
        explore: 'data_app_events',
        dimensions: [],
        metrics: ['data_app_events_total_views'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_total_views',
            },
        ],
        visualization: 'number',
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'user-app-detail',
        name: 'Who uses which app? · user-by-app detail',
        description:
            'Recorded app loads and viewers by app and project, including unknown or removed apps. Loads include reloads and are not distinct visits.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_user_name',
            'data_app_events_project_name',
            'data_app_events_user_id',
            'data_app_events_app_name',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: ['data_app_events_total_views'],
        limit: 5000,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_total_views',
            },
        ],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'viewed-apps',
        name: 'Apps with recorded loads',
        description:
            'Recorded app activity over the available history, including unknown or removed apps.',
        explore: 'data_app_events',
        dimensions: [],
        metrics: ['data_app_events_unique_apps'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_unique_apps',
            },
        ],
        visualization: 'number',
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view'],
            },
        ],
    },
    {
        key: 'agent-requests-trend',
        name: 'Agent requests',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'agent_requests',
        dimensions: [],
        metrics: ['agent_requests_total_requests'],
        limit: 1,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_total_requests',
            },
        ],
        visualization: 'number',
        libraryChart: {
            slug: 'big-number-with-sparkline-trend',
            minVersion: '0.7.1',
            fieldMapping: {
                value: 'agent_requests_total_requests',
                sparklineMetric: 'agent_requests_total_requests',
                time: 'agent_requests_requested_at_day',
            },
            optionValues: {
                valueAggregation: 'sum',
                style: 'compact',
                colorSparklineByTrend: false,
                showLabel: true,
                label: 'Selected period',
                showCardBorder: false,
                showCardShadow: false,
            },
            query: {
                dimensions: ['agent_requests_requested_at_day'],
                metrics: ['agent_requests_total_requests'],
                sorts: [
                    {
                        fieldId: 'agent_requests_requested_at_day',
                        descending: false,
                    },
                ],
                limit: 500,
                description:
                    'All retained captured history. Recent capture is not a full historical census.',
            },
        },
    },
    {
        key: 'agent-requesters-trend',
        name: 'People asking agents',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'agent_requests',
        dimensions: [],
        metrics: ['agent_requests_distinct_requesters'],
        limit: 1,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_distinct_requesters',
            },
        ],
        visualization: 'number',
        libraryChart: {
            slug: 'big-number-with-sparkline-trend',
            minVersion: '0.7.1',
            fieldMapping: {
                value: 'agent_requests_distinct_requesters',
                sparklineMetric: 'agent_requests_distinct_requesters',
                time: 'agent_requests_requested_at_day',
            },
            optionValues: {
                valueAggregation: 'latest',
                showComparison: false,
                colorSparklineByTrend: false,
                showLabel: true,
                label: 'Latest day',
                showCardBorder: false,
                showCardShadow: false,
            },
            query: {
                dimensions: ['agent_requests_requested_at_day'],
                metrics: ['agent_requests_distinct_requesters'],
                sorts: [
                    {
                        fieldId: 'agent_requests_requested_at_day',
                        descending: false,
                    },
                ],
                limit: 500,
                description:
                    'People who asked an agent on the latest day in the selected period, with the daily trend. A person active on several days is counted on each of those days.',
            },
        },
    },
    {
        key: 'agent-requests-by-agent-and-day',
        name: 'Requests by agent and day',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'agent_requests',
        dimensions: [
            'agent_requests_agent_name',
            'agent_requests_requested_at_day',
        ],
        metrics: ['agent_requests_total_requests'],
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_agent_name', descending: false },
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ],
        libraryChart: {
            slug: 'heatmap',
            minVersion: '0.4.2',
            fieldMapping: {
                x: 'agent_requests_requested_at_day',
                y: 'agent_requests_agent_name',
                value: 'agent_requests_total_requests',
            },
            optionValues: {},
            query: null,
        },
    },
    {
        key: 'agent-daily-requests-per-agent',
        name: 'Daily requests per agent',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'agent_requests',
        dimensions: [
            'agent_requests_requested_at_day',
            'agent_requests_agent_name',
        ],
        metrics: ['agent_requests_total_requests'],
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_agent_name', descending: false },
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ],
        libraryChart: {
            slug: 'vega-trellis',
            minVersion: '0.6.2',
            fieldMapping: {
                x: 'agent_requests_requested_at_day',
                value: 'agent_requests_total_requests',
                panel: 'agent_requests_agent_name',
            },
            optionValues: {
                markType: 'bar',
                arrangement: 'grid',
                columns: '4',
            },
            query: null,
        },
    },
    {
        key: 'agent-adoption-by-week',
        name: 'Requests by person and agent',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'agent_requests',
        dimensions: [
            'agent_requests_agent_name',
            'agent_requests_user_name',
            'agent_requests_user_id',
            'agent_requests_requested_at_week',
            'agent_requests_agent_id',
        ],
        metrics: ['agent_requests_total_requests'],
        limit: 100,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_requested_at_week',
            },
        ],
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.13.1',
            fieldMapping: {
                rowDimension: 'agent_requests_user_name',
                rowDimension2: 'agent_requests_agent_name',
                metric: ['agent_requests_total_requests'],
            },
            optionValues: {
                defaultCollapsed: 'collapsed',
                decimalPlaces: 0,
                density: 'compact',
            },
            query: {
                dimensions: [
                    'agent_requests_user_name',
                    'agent_requests_agent_name',
                ],
                metrics: ['agent_requests_total_requests'],
                sorts: [
                    {
                        fieldId: 'agent_requests_total_requests',
                        descending: true,
                    },
                ],
                limit: 500,
                description:
                    'Requests per person and agent over the selected period. People without a display name are grouped as Unknown user. This is not an eligible-user adoption rate.',
            },
        },
    },
    {
        key: 'agent-feedback-rating-and-sample-coverage',
        name: 'Agent feedback · rating and sample coverage',
        description:
            'Negative feedback rate excludes unrated requests. Read it with feedback coverage and request count; small samples are not reliable rankings.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_agent_name', 'agent_requests_agent_id'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_feedback_coverage',
            'agent_requests_negative_feedback_rate',
            'agent_requests_completion_rate',
            'agent_requests_response_coverage',
        ],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_total_requests',
            },
        ],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'agent_requests_agent_name',
                m1: 'agent_requests_total_requests',
                m2: 'agent_requests_feedback_coverage',
                m3: 'agent_requests_negative_feedback_rate',
            },
            optionValues: {
                seriesType: 'bar',
                m2Type: 'scatter',
                m3Type: 'scatter',
                dualAxis: true,
                m2Right: true,
                m3Right: true,
                xAxisType: 'category',
            },
            query: null,
        },
    },
    {
        key: 'agent-requests-and-completion-by-day',
        name: 'Requests and completion rate by day',
        description:
            'Logical requests, not individual agent steps. Pending requests may still lack an observed outcome.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_requested_at_day'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_completion_rate',
        ],
        limit: 1000,
        sorts: [
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ],
        visualization: 'line',
        xField: 'agent_requests_requested_at_day',
        yFields: ['agent_requests_total_requests'],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'agent_requests_requested_at_day',
                m1: 'agent_requests_total_requests',
                m2: 'agent_requests_completion_rate',
            },
            optionValues: {
                seriesType: 'bar',
                m2Type: 'line',
                dualAxis: true,
                m2Right: true,
                xAxisType: 'time',
                xTimeFormat: '{MMM} {d}',
            },
            query: null,
        },
    },
    {
        key: 'agent-request-outcomes',
        name: 'Agent request outcomes',
        description:
            'Logical requests, not individual agent steps. Pending requests may still lack an observed outcome.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_status'],
        metrics: ['agent_requests_total_requests'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_total_requests',
            },
        ],
        visualization: 'donut',
    },
    {
        key: 'agent-retries-latency-and-consumption',
        name: 'Agent retries · latency and consumption',
        description:
            'Captured retry count and overhead; incomplete token attribution is possible. Agent steps are not equivalent to retries.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_retry_count'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_total_retry_overhead_ms',
            'agent_requests_average_request_latency_ms',
            'agent_requests_total_request_tokens',
        ],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_total_requests',
            },
        ],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'agent_requests_retry_count',
                m1: 'agent_requests_total_requests',
                m2: 'agent_requests_average_request_latency_ms',
            },
            optionValues: {
                seriesType: 'bar',
                m2Type: 'line',
                dualAxis: true,
                m2Right: true,
                xAxisType: 'category',
                showSymbols: true,
                xName: 'Retries',
                yName: 'Requests',
                yRightName: 'Average latency (ms)',
            },
            query: {
                dimensions: ['agent_requests_retry_count'],
                metrics: [
                    'agent_requests_total_requests',
                    'agent_requests_average_request_latency_ms',
                ],
                sorts: [
                    {
                        fieldId: 'agent_requests_retry_count',
                        descending: false,
                    },
                ],
                limit: 30,
                description:
                    'Requests and average request latency by captured retry count. Agent steps are not equivalent to retries.',
            },
        },
    },
    {
        key: 'ai-consumption-by-person-feature-and-model',
        name: 'AI consumption by person, feature and model',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'ai_usage',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_model',
            'ai_usage_feature',
            'ai_usage_user_id',
        ],
        metrics: ['ai_usage_total_tokens_used', 'ai_usage_total_ai_calls'],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'ai_usage_total_tokens_used',
            },
        ],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'ai_usage_user_name',
                m1: 'ai_usage_total_tokens_used',
                splitBy: 'ai_usage_model',
            },
            optionValues: {
                seriesType: 'bar',
                stack: 'normal',
                xAxisType: 'category',
                xLabelAutoRotate: false,
                xLabelRotate: 45,
            },
            query: {
                dimensions: ['ai_usage_user_name', 'ai_usage_model'],
                metrics: ['ai_usage_total_tokens_used'],
                sorts: [
                    {
                        fieldId: 'ai_usage_total_tokens_used',
                        descending: true,
                    },
                ],
                limit: 24,
                description:
                    'Top 24 person and model pairs by tokens over the selected period, so a person near the cut-off can be missing smaller models. People without a display name are grouped as Unknown user. Tokens are not monetary cost.',
            },
        },
    },
    {
        key: 'ai-tokens-by-feature-and-model',
        name: 'Tokens by feature and model',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'ai_usage',
        dimensions: ['ai_usage_feature', 'ai_usage_model'],
        metrics: ['ai_usage_total_tokens_used'],
        limit: 100,
        sorts: [
            {
                descending: true,
                fieldId: 'ai_usage_total_tokens_used',
            },
        ],
        libraryChart: {
            slug: 'heatmap',
            minVersion: '0.4.2',
            fieldMapping: {
                x: 'ai_usage_model',
                y: 'ai_usage_feature',
                value: 'ai_usage_total_tokens_used',
            },
            optionValues: {},
            query: null,
        },
    },
    {
        key: 'app-generation-consumption',
        name: 'App generation · weekly tokens by builder and model',
        description:
            'AI usage for app generation, by builder, week and AI model. Tokens do not measure monetary spend, and usage cannot yet be attributed to individual apps or builds.',
        explore: 'ai_usage',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_event_ts_week',
            'ai_usage_model',
            'ai_usage_feature',
            'ai_usage_user_id',
        ],
        metrics: ['ai_usage_total_tokens_used', 'ai_usage_total_ai_calls'],
        limit: 100,
        sorts: [
            {
                descending: true,
                fieldId: 'ai_usage_event_ts_week',
            },
            {
                descending: true,
                fieldId: 'ai_usage_total_tokens_used',
            },
        ],
        filters: [
            {
                field: 'ai_usage_feature',
                values: ['data-app'],
            },
        ],
    },
    {
        key: 'app-lifecycle-build-activity-versus-loads',
        name: 'App lifecycle · build activity versus loads',
        description:
            'Recorded app loads and viewers by app and project, including unknown or removed apps. Loads include reloads and are not distinct visits.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_app_name',
            'data_app_events_project_name',
            'data_app_events_app_id',
            'data_app_events_event_name',
            'data_app_events_project_id',
        ],
        metrics: ['data_app_events_total_events'],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_total_events',
            },
        ],
    },
    {
        key: 'apps-loads-and-observed-viewers',
        name: 'Apps · loads and observed viewers',
        description:
            'Recorded app loads and viewers by app and project, including unknown or removed apps. Loads include reloads and are not distinct visits.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_app_name',
            'data_app_events_project_name',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: [
            'data_app_events_total_views',
            'data_app_events_unique_viewers',
        ],
        limit: 15,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_total_views',
            },
        ],
        visualization: 'bar',
        xField: 'data_app_events_app_name',
        yFields: [
            'data_app_events_total_views',
            'data_app_events_unique_viewers',
        ],
        flipAxes: true,
    },
    {
        key: 'content-creation-by-month',
        name: 'Content creation by month',
        description:
            'Creation dates of items in the latest inventory, including soft-deleted items; not complete historical inventory.',
        explore: 'content_inventory',
        dimensions: ['content_health_created_at_month'],
        metrics: ['content_health_total_content'],
        limit: 500,
        sorts: [
            {
                descending: false,
                fieldId: 'content_health_created_at_month',
            },
        ],
        visualization: 'line',
        xField: 'content_health_created_at_month',
        yFields: ['content_health_total_content'],
    },
    {
        key: 'content-ownership-current-snapshot',
        name: 'Content ownership · current snapshot',
        description:
            'Owner status reflects current application membership, not verified employment status.',
        explore: 'content_inventory',
        dimensions: ['content_health_owner_status'],
        metrics: ['content_health_total_content'],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'content_health_total_content',
            },
        ],
        visualization: 'bar',
        xField: 'content_health_owner_status',
        yFields: ['content_health_total_content'],
        flipAxes: true,
    },
    {
        key: 'content-reach-distinct-people-not-just-views',
        name: 'Content reach · distinct people, not just views',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'content_reach',
        dimensions: [
            'content_reach_content_type',
            'content_reach_content_name',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_distinct_viewers',
            'content_reach_qualifying_views',
        ],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'content_reach_distinct_viewers',
            },
        ],
    },
    {
        key: 'daily-observed-active-people',
        name: 'Daily observed active people',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'user_activity',
        dimensions: ['user_activity_activity_date_day'],
        metrics: ['user_activity_unique_users'],
        limit: 500,
        sorts: [
            {
                descending: false,
                fieldId: 'user_activity_activity_date_day',
            },
        ],
        visualization: 'line',
        xField: 'user_activity_activity_date_day',
        yFields: ['user_activity_unique_users'],
    },
    {
        key: 'data-app-builders-creation-and-iterations-by-week',
        name: 'Data App builders · creation and iterations by week',
        description:
            'People who created or iterated on apps, grouped by week. Uploads are excluded.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_user_name',
            'data_app_events_user_id',
            'data_app_events_event_ts_week',
        ],
        metrics: [
            'data_app_events_total_events',
            'data_app_events_unique_apps',
        ],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'data_app_events_event_ts_week',
            },
        ],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.created', 'data_app.iterated'],
            },
        ],
    },
    {
        key: 'export-audit-actor-content-and-outcome',
        name: 'Export audit · actor, content and outcome',
        description:
            'Result downloads only. Content links can be missing; null is unattributed, not proof there was no content.',
        explore: 'export_events',
        dimensions: [
            'export_events_user_name',
            'export_events_chart_name',
            'export_events_dashboard_name',
            'export_events_format',
            'export_events_event_name',
            'export_events_user_id',
            'export_events_chart_id',
            'export_events_dashboard_id',
        ],
        metrics: [
            'export_events_total_events',
            'export_events_total_downloads',
            'export_events_total_csv_downloads',
        ],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'export_events_total_events',
            },
        ],
    },
    {
        key: 'google-sheets-query-audience',
        name: 'Google Sheets query audience',
        description:
            'Recorded Sheets queries only; first observed activity is not acquisition or first-ever usage.',
        explore: 'query_events',
        dimensions: [
            'query_events_user_name',
            'query_events_user_id',
            'query_events_event_ts_week',
        ],
        metrics: ['query_events_total_queries'],
        limit: 100,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_total_queries',
            },
        ],
        filters: [
            {
                field: 'query_events_context',
                values: ['gsheets'],
            },
        ],
    },
    {
        key: 'high-compute-dashboards-audience-versus-warehouse-time',
        name: 'High-compute dashboards · audience versus warehouse time',
        description:
            'Retained warehouse execution milliseconds are a performance proxy, not currency cost. Compare per dashboard; cross-type attribution can overlap. Top 25 by execution time. Each point is a dashboard; inspect underlying results for names.',
        explore: 'content_health',
        dimensions: [
            'content_health_content_name',
            'content_health_observed_viewers',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: [
            'content_health_total_observed_queries',
            'content_health_total_warehouse_execution_time_ms',
        ],
        limit: 25,
        sorts: [
            {
                descending: true,
                fieldId: 'content_health_total_warehouse_execution_time_ms',
            },
        ],
        visualization: 'scatter',
        xField: 'content_health_observed_viewers',
        yFields: ['content_health_total_warehouse_execution_time_ms'],
        filters: [
            {
                field: 'content_health_content_type',
                values: ['dashboard'],
            },
        ],
    },
    {
        key: 'mcp-users-clients-tools-and-error-rates',
        name: 'MCP users · clients, tools and error rates',
        description:
            'Error rate uses known outcomes only; historical unknown outcomes remain unknown. Latency is in milliseconds.',
        explore: 'tool_activity',
        dimensions: [
            'tool_activity_user_name',
            'tool_activity_user_id',
            'tool_activity_actor_type',
            'tool_activity_client_name',
            'tool_activity_tool_name',
        ],
        metrics: [
            'tool_activity_total_calls',
            'tool_activity_failed_calls',
            'tool_activity_error_rate',
            'tool_activity_p90_duration_ms',
        ],
        limit: 40,
        sorts: [
            {
                descending: true,
                fieldId: 'tool_activity_total_calls',
            },
        ],
        filters: [
            {
                field: 'tool_activity_source',
                values: ['mcp'],
            },
        ],
    },
    {
        key: 'new-content-adoption-creation-week-proxy',
        name: 'New-content adoption · creation-week proxy',
        description:
            'Creation date is a launch proxy. Returning after the first seven creation days requires an adequate captured window.',
        explore: 'content_reach',
        dimensions: [
            'content_reach_content_name',
            'content_reach_content_created_at_day',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_distinct_viewers',
            'content_reach_first_week_returning_viewers',
        ],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'content_reach_distinct_viewers',
            },
        ],
    },
    {
        key: 'observed-active-people',
        name: 'Observed active people',
        description:
            'Distinct people with recorded activity. Background activity may be included; this is not the percentage of people with access who use Lightdash.',
        explore: 'user_activity',
        dimensions: [],
        metrics: ['user_activity_unique_users'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'user_activity_unique_users',
            },
        ],
        visualization: 'number',
    },
    {
        key: 'observed-activity-by-person-and-week',
        name: 'Observed activity by person and week',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'user_activity',
        dimensions: [
            'user_activity_user_name',
            'user_activity_user_id',
            'user_activity_activity_date_week',
        ],
        metrics: [
            'user_activity_total_events',
            'user_activity_total_queries',
            'user_activity_total_ai_calls',
        ],
        limit: 100,
        sorts: [
            {
                descending: true,
                fieldId: 'user_activity_activity_date_week',
            },
        ],
    },
    {
        key: 'observed-history-stable-user-and-project-uuids',
        name: 'Observed history · people, date and activity stream',
        description:
            'Recent recorded activity by person and project. The table shows up to 5,000 results.',
        explore: 'user_activity',
        dimensions: [
            'user_activity_user_name',
            'user_activity_user_id',
            'user_activity_project_id',
            'user_activity_activity_date_day',
            'user_activity_stream',
        ],
        metrics: ['user_activity_total_events', 'user_activity_unique_users'],
        limit: 500,
        sorts: [
            {
                descending: true,
                fieldId: 'user_activity_activity_date_day',
            },
        ],
    },
    {
        key: 'power-users-queries-ai-and-exports',
        name: 'Power users · queries, AI and exports',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'user_activity',
        dimensions: ['user_activity_user_name', 'user_activity_user_id'],
        metrics: [
            'user_activity_total_queries',
            'user_activity_total_ai_calls',
            'user_activity_total_downloads',
            'user_activity_total_tokens_used',
        ],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'user_activity_total_queries',
            },
        ],
    },
    {
        key: 'query-failures-affected-people',
        name: 'Query failures · affected people',
        description:
            'Recorded error outcomes ranked by affected people. Missing content attribution is retained; no root-cause inference.',
        explore: 'query_events',
        dimensions: [
            'query_events_status',
            'query_events_dashboard_name',
            'query_events_explore_name',
            'query_events_dashboard_id',
        ],
        metrics: ['query_events_unique_users', 'query_events_total_queries'],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_unique_users',
            },
        ],
        filters: [
            {
                field: 'query_events_status',
                values: ['error'],
            },
        ],
    },
    {
        key: 'query-origin-and-initiating-actor',
        name: 'Query origin and initiating actor',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'query_events',
        dimensions: [
            'query_events_workload_origin',
            'query_events_initiating_actor_type',
            'query_events_context',
        ],
        metrics: ['query_events_total_queries'],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_total_queries',
            },
        ],
    },
    {
        key: 'request-consumption-by-outcome-and-feedback',
        name: 'Request consumption by outcome and feedback',
        description:
            'Tokens linked to captured requests only; unlinked calls and unknown token accounting are not zero cost.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_status', 'agent_requests_feedback_score'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_total_request_tokens',
            'agent_requests_total_ai_calls',
        ],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_total_requests',
            },
        ],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'agent_requests_status',
                m1: 'agent_requests_total_request_tokens',
            },
            optionValues: {
                seriesType: 'bar',
                stack: 'normal',
                xAxisType: 'category',
            },
            query: {
                dimensions: ['agent_requests_status'],
                metrics: ['agent_requests_total_request_tokens'],
                sorts: [
                    {
                        fieldId: 'agent_requests_total_request_tokens',
                        descending: true,
                    },
                ],
                limit: 30,
                description:
                    'Request-linked tokens by technical outcome over the selected period. Tokens linked to captured requests only; unlinked calls and unknown token accounting are not zero cost.',
            },
        },
    },
    {
        key: 'review-candidates-activity-and-known-dependencies',
        name: 'Review candidates · activity and known dependencies',
        description:
            'Known schedule/dashboard dependencies only. Missing observed activity never establishes safe deletion.',
        explore: 'content_health',
        dimensions: [
            'content_health_content_name',
            'content_health_content_type',
            'content_health_activity_status',
            'content_health_enabled_schedules',
            'content_health_dashboard_references',
            'content_health_dependency_coverage',
            'content_health_capture_coverage',
            'content_health_is_deleted',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: ['content_health_total_content'],
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'content_health_total_content',
            },
        ],
        filters: [
            {
                field: 'content_health_activity_status',
                values: [
                    'No activity observed; known dependency',
                    'No activity observed; coverage incomplete',
                ],
            },
        ],
    },
    {
        key: 'slow-dashboards-tail-latency-and-demand',
        name: 'Slow dashboards · tail latency and demand',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'query_events',
        dimensions: [
            'query_events_dashboard_name',
            'query_events_dashboard_id',
        ],
        metrics: [
            'query_events_total_queries',
            'query_events_unique_users',
            'query_events_p95_response_time_ms',
            'query_events_avg_warehouse_execution_time_ms',
        ],
        filters: [
            {
                field: 'query_events_dashboard_name',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_p95_response_time_ms',
            },
        ],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.0',
            fieldMapping: {
                x: 'query_events_dashboard_name',
                m1: 'query_events_total_queries',
                m2: 'query_events_p95_response_time_ms',
            },
            optionValues: {
                seriesType: 'bar',
                m2Type: 'scatter',
                dualAxis: true,
                m2Right: true,
                xAxisType: 'category',
                xLabelAutoRotate: false,
                xLabelRotate: 45,
            },
            query: null,
        },
    },
    {
        key: 'verified-content-audience-share',
        name: 'Verified-content audience share',
        description:
            'Share of viewers with known verification state who visited verified content; viewer may also visit unverified content.',
        explore: 'content_reach',
        dimensions: [],
        metrics: ['content_reach_verified_audience_share'],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'content_reach_verified_audience_share',
            },
        ],
        visualization: 'number',
    },
    {
        key: 'warehouse-versus-cached-demand',
        name: 'Warehouse versus cached demand',
        description:
            'Request demand by cache hit and execution source; this is not currency saved.',
        explore: 'query_events',
        dimensions: ['query_events_cache_hit', 'query_events_execution_source'],
        metrics: ['query_events_total_queries'],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_total_queries',
            },
        ],
    },
    {
        key: 'who-visited-which-dashboard',
        name: 'Who visited which dashboard?',
        description:
            'All retained captured history. Recent capture is not a full historical census.',
        explore: 'content_reach',
        dimensions: [
            'content_reach_content_name',
            'content_reach_user_name',
            'content_reach_user_id',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_qualifying_views',
            'content_reach_last_viewed_at',
        ],
        limit: 100,
        sorts: [
            {
                descending: true,
                fieldId: 'content_reach_qualifying_views',
            },
        ],
        filters: [
            {
                field: 'content_reach_content_type',
                values: ['dashboard'],
            },
        ],
    },
];
