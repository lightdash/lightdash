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
        name: 'Passed and failed assessments by day',
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
        name: 'Runs and assessment outcomes by agent and evaluation',
        description:
            'Recorded runs and assessment outcomes for each agent and evaluation.',
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
            'The 100 most recent completed or failed runs in the selected period. An execution error is not a failed assessment.',
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
        name: 'Queries per field',
        description:
            'Distinct queries per field, counting fields that were selected, filtered, grouped or sorted.',
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
        name: 'Most-used fields, sized by queries',
        description: 'Fields sized by distinct queries in the selected period.',
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
                    'Fields sized by distinct queries in the selected period.',
            },
        },
    },
    {
        key: 'people-using-fields',
        name: 'Field use by person',
        description:
            'Distinct queries per user and field. A missing name does not mean the activity was anonymous.',
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
        name: 'Field use by content',
        description:
            'Charts, dashboards and data apps whose queries used each field. Queries from exploring directly, and some others, are not linked to saved content.',
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
            'Distinct queries by how much field detail was recorded, including older history and SQL queries. Missing detail does not mean a query used no fields.',
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
        name: 'Data app loads and viewers by day',
        description: '',
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
        name: 'Data app viewers',
        description:
            'Distinct identified people who loaded a data app. Anonymous visitors are not counted.',
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
        name: 'Most-used data apps',
        description: 'Loads and viewers for each data app and project.',
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
        name: 'Most active data app viewers',
        description: '',
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
        name: 'Data app loads',
        description: 'Number of times a data app was loaded. Reloads count.',
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
        name: 'Data app loads by person and app',
        description: 'Loads for each person, data app and project.',
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
        name: 'Data apps loaded',
        description: 'Distinct data apps loaded at least once.',
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
            'Requests to agents in the selected period. A request counts once, however many steps the agent takes.',
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
                    'Requests to agents in the selected period. A request counts once, however many steps the agent takes.',
            },
        },
    },
    {
        key: 'agent-requesters-trend',
        name: 'People asking agents',
        description:
            'People who asked an agent on the latest day in the selected period.',
        explore: 'agent_requests',
        // Newest day first: the big number reads the first row, so it shows the latest day.
        dimensions: ['agent_requests_requested_at_day'],
        metrics: ['agent_requests_distinct_requesters'],
        limit: 1,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_requested_at_day',
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
        description: '',
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
        name: 'Requests by day, one row per agent',
        description:
            'Each agent has its own scale, so row heights cannot be compared.',
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
            // One full-width row per agent over a shared date axis, each a
            // smooth filled line in its own palette colour. Points stay
            // hidden: at up to 90 daily points they would bury the line.
            optionValues: {
                arrangement: 'rows',
                minPanelHeight: 70,
                sharedY: false,
                markType: 'area',
                curve: 'smooth',
                fillOpacity: 25,
                showLine: true,
                showPoints: false,
            },
            query: null,
        },
    },
    {
        key: 'agent-adoption-by-week',
        name: 'Requests by person and agent',
        description: '',
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
            minVersion: '0.14.1',
            fieldMapping: {
                rowDimension: 'agent_requests_user_name',
                rowDimension2: 'agent_requests_agent_name',
                metric: ['agent_requests_total_requests'],
            },
            optionValues: {
                defaultCollapsed: 'collapsed',
                initialSort: 'firstValue',
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
                    'Requests per person and agent in the selected period. People without a display name are grouped as Unknown user.',
            },
        },
    },
    {
        key: 'agent-feedback-rating-and-sample-coverage',
        name: 'Agent feedback: ratings and share of requests rated',
        description:
            'The negative feedback rate leaves out unrated requests. Read it with the share of requests rated and the request count.',
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
                xName: 'Agent',
                yName: 'Agent requests',
                yRightName: 'Share rated and negative feedback rate',
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
            'Requests per day with the completion rate. Pending requests may not have an outcome yet.',
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
                xName: 'Day',
                yName: 'Agent requests',
                yRightName: 'Completion rate',
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
        name: 'Requests by outcome',
        description: 'Pending requests may not have an outcome yet.',
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
        name: 'Requests and latency by retry count',
        description:
            'Requests, time spent on failed attempts, average latency and tokens for each retry count. Waiting time between attempts is not included. Token totals can be incomplete. An agent step is not a retry.',
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
                yName: 'Agent requests',
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
                    'Requests and average request latency by recorded retry count. An agent step is not a retry.',
            },
        },
    },
    {
        key: 'ai-consumption-by-person-feature-and-model',
        name: 'Tokens by person and model',
        description: 'Tokens and AI calls for each person, model and feature.',
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
                xName: 'Person',
                yName: 'Tokens',
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
                    'Top 24 person and model pairs by tokens in the selected period, so a person near the cut-off can be missing their smaller models. People without a display name are grouped as Unknown user.',
            },
        },
    },
    {
        key: 'ai-tokens-by-feature-and-model',
        name: 'Tokens by feature and model',
        description: '',
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
        name: 'Data app generation tokens by builder, model and week',
        description:
            'Tokens used to generate data apps, by builder, week and model.',
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
        name: 'Build activity versus loads by data app',
        description:
            'Number of recorded events for each data app and project, split by event type, such as created, iterated and loaded. Unknown or deleted apps are included.',
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
        name: 'Loads and viewers by data app',
        description:
            'Loads and viewers for each data app and project, including unknown or deleted apps.',
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
        name: 'Content created by month',
        description:
            'Items in the latest inventory by the month they were created, including deleted items (recoverable). This is not a full history of all content. The date filter does not apply.',
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
        name: 'Content ownership (current)',
        description:
            'Owner status reflects current Lightdash membership, not whether the person is still employed.',
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
        name: 'Viewers and views by content',
        description:
            'Distinct people who viewed each item, with the number of views.',
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
        name: 'People with any recorded activity by day',
        description: 'Distinct people with any recorded activity each day.',
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
        name: 'Data app builders: creations and iterations by week',
        description:
            'People who created or iterated on data apps, grouped by week.',
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
        name: 'Exports by user, content and outcome',
        description:
            'Downloads of results only. A blank content link means the content is unknown, not that there was none.',
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
        name: 'People querying from Google Sheets',
        description:
            'Recorded Google Sheets queries only. The first recorded activity is not necessarily when the person joined or first used the integration.',
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
        name: 'High-compute dashboards: viewers versus warehouse time',
        description:
            'Top 25 dashboards by warehouse execution time (ms), across all recorded history. The date filter does not apply. Each point is a dashboard; open the underlying results to see names.',
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
        name: 'MCP tool calls by user, client and tool',
        description: 'Latency is in milliseconds.',
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
        name: 'New content adoption after the first week',
        description:
            'Creation date stands in for launch date. Return activity after the first seven days only shows when enough history has been recorded.',
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
        name: 'People with any recorded activity',
        description:
            'Distinct people with any recorded activity. This is not the percentage of people with access who use Lightdash.',
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
        name: 'Recorded activity by person and week',
        description: '',
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
        name: 'Activity history by person, date and activity stream',
        description:
            'Recorded activity in the selected period by person, day and activity stream, most recent first. Shows up to 500 rows.',
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
        name: 'Power users: queries, AI and exports',
        description: '',
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
        name: 'Query failures by users affected',
        description:
            'Failed queries, ranked by users affected. Failures not linked to any content are still shown.',
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
        name: 'Queries by origin and who started them',
        description: '',
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
        name: 'Tokens linked to requests by outcome',
        description:
            'Requests, tokens and AI calls by outcome and feedback rating. Only tokens linked to recorded requests are counted. Unlinked AI calls and unknown token counts are not zero tokens.',
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
                xName: 'Outcome',
                yName: 'Tokens linked to requests',
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
                    'Tokens linked to requests by technical outcome in the selected period. Unlinked AI calls and unknown token counts are not zero tokens.',
            },
        },
    },
    {
        key: 'review-candidates-activity-and-known-dependencies',
        name: 'Review candidates: activity and known dependencies',
        description:
            'Content with no recorded activity, with its known schedule and dashboard dependencies. Uses all recorded history; the date filter does not apply.',
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
        name: 'Slow dashboards: P95 response time and queries',
        description: 'Queries and P95 response time for each dashboard.',
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
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'query_events_dashboard_name',
                m1: 'query_events_total_queries',
                m2: 'query_events_p95_response_time_ms',
            },
            optionValues: {
                xName: 'Dashboard',
                seriesType: 'bar',
                m2Type: 'scatter',
                dualAxis: true,
                m2Right: true,
                xAxisType: 'category',
                xLabelAutoRotate: false,
                xLabelRotate: 45,
                yName: 'Queries',
                yRightName: 'P95 response time (ms)',
            },
            query: null,
        },
    },
    {
        key: 'verified-content-audience-share',
        name: 'Share of viewers who viewed verified content',
        description:
            'Viewers of verified content as a share of viewers of content with a known verification status.',
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
        name: 'Warehouse versus cached queries',
        description:
            'Queries by cache hit and by what ran or served them, such as the warehouse, the results cache or a pre-aggregate.',
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
        name: 'Dashboard views by person',
        description: '',
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
