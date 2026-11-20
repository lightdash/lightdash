import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
} from '@lightdash/common';
import { card } from './chartBuilders';
import { monthlyQueryComparisonCharts } from './monthlyQueryComparisonCharts';
import type { UsageChartSpec } from './usageDashboardTypes';

export const usageChartSpecs: UsageChartSpec[] = [
    ...monthlyQueryComparisonCharts,
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
            'Distinct queries per field, counting fields that were selected, filtered, grouped or sorted. Cached and failed queries count. A field missing here can still be in use. Names are those recorded when the query ran, so a renamed field can appear more than once.',
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
            'Distinct queries by how much field detail was recorded, including older history and SQL queries. Missing detail does not mean a query used no fields. Captured means the fields were recorded, partial that some could not be, unavailable includes SQL queries, and not captured includes older history.',
        explore: 'semantic_usage',
        dimensions: ['semantic_usage_lineage_status'],
        metrics: ['semantic_usage_total_queries'],
        limit: 10,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
        visualization: 'bar',
        flipAxes: true,
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
                showComparison: false,
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
            minVersion: '0.5.0',
            fieldMapping: {
                x: 'agent_requests_requested_at_day',
                y: 'agent_requests_agent_name',
                value: 'agent_requests_total_requests',
            },
            optionValues: {
                xTitle: 'Day',
                yTitle: 'Agent',
                legendTitle: 'Agent requests',
                legendFormat: 'compact',
            },
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
            minVersion: '0.7.0',
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
                showPeakLabel: true,
                zeroFillGaps: true,
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
            minVersion: '0.14.0',
            fieldMapping: {
                rowDimension: 'agent_requests_user_name',
                rowDimension2: 'agent_requests_agent_name',
                metric: ['agent_requests_total_requests'],
            },
            optionValues: {
                defaultCollapsed: 'collapsed',
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Person / Agent',
                valueNames: 'Agent requests',
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
        name: 'Feedback by agent',
        description:
            'Rated is the number of requests a person gave a positive or negative rating. Negative is how many of those ratings were negative.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_agent_name', 'agent_requests_agent_id'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_feedback_coverage',
            'agent_requests_negative_feedback_rate',
            'agent_requests_completion_rate',
            'agent_requests_response_coverage',
        ],
        // The explore has the two shares but not the counts behind them. Each share is a count divided
        // by a count that is also in the query, so multiplying back gives the exact whole number.
        tableCalculations: [
            {
                name: 'rated_requests',
                displayName: 'Rated',
                type: TableCalculationType.NUMBER,
                sql: 'ROUND(${agent_requests.feedback_coverage} * ${agent_requests.total_requests})',
                format: { type: CustomFormatType.NUMBER, round: 0 },
            },
            {
                name: 'share_rated_percent',
                displayName: 'Share rated (%)',
                type: TableCalculationType.NUMBER,
                sql: 'ROUND(100.0 * ${agent_requests.feedback_coverage})',
                format: { type: CustomFormatType.NUMBER, round: 0 },
            },
            {
                name: 'negative_ratings',
                displayName: 'Negative',
                type: TableCalculationType.NUMBER,
                sql: 'ROUND(COALESCE(${agent_requests.negative_feedback_rate}, 0) * ${agent_requests.feedback_coverage} * ${agent_requests.total_requests})',
                format: { type: CustomFormatType.NUMBER, round: 0 },
            },
        ],
        // The plain table shows the share as a percentage already
        hiddenColumns: ['share_rated_percent'],
        fieldLabels: {
            agent_requests_total_requests: 'Requests',
            agent_requests_feedback_coverage: 'Share rated',
            agent_requests_negative_feedback_rate: 'Negative share',
        },
        limit: 50,
        sorts: [
            {
                descending: true,
                fieldId: 'agent_requests_total_requests',
            },
        ],
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.14.0',
            fieldMapping: {
                rowDimension: 'agent_requests_agent_name',
                metric: [
                    'agent_requests_total_requests',
                    'rated_requests',
                    'share_rated_percent',
                    'negative_ratings',
                ],
            },
            // The table draws bars in every value column or in none. A bar on a count of one or two
            // ratings would make a small sample look large, so there are none.
            optionValues: {
                showMiniBars: false,
                showTotalsRow: false,
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Agent',
                valueNames: 'Requests,Rated,Share rated (%),Negative',
            },
            // Shares the plain table's query: the counts are table calculations
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
            minVersion: '0.18.0',
            fieldMapping: {
                x: 'agent_requests_requested_at_day',
                m1: 'agent_requests_total_requests',
                m2: 'agent_requests_completion_rate',
            },
            optionValues: {
                m1Name: 'Agent requests',
                m2Name: 'Completion rate',
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
        description:
            'Pending requests may not have an outcome yet. A request counts once, however many steps the agent takes.',
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
            minVersion: '0.18.0',
            fieldMapping: {
                x: 'agent_requests_retry_count',
                m1: 'agent_requests_total_requests',
                m2: 'agent_requests_average_request_latency_ms',
            },
            optionValues: {
                m1Name: 'Agent requests',
                m2Name: 'Average latency (ms)',
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
            minVersion: '0.18.1',
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
                splitSort: 'total',
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
            minVersion: '0.5.0',
            fieldMapping: {
                x: 'ai_usage_model',
                y: 'ai_usage_feature',
                value: 'ai_usage_total_tokens_used',
            },
            optionValues: {
                xTitle: 'Model',
                yTitle: 'Feature',
                legendTitle: 'Tokens',
                legendFormat: 'compact',
            },
            query: null,
        },
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
        description: 'Older queries with unknown values are still shown.',
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
    card({
        key: 'request-consumption-by-outcome-and-feedback',
        name: 'Tokens spent on failed or cancelled requests',
        description:
            'Tokens from AI calls linked to agent requests that ended in an error or were cancelled. Requests still pending or waiting for a clarification are not counted. Unlinked AI calls and unknown token counts are not zero tokens.',
        explore: 'agent_requests',
        day: 'agent_requests_requested_at_day',
        metric: 'agent_requests_total_request_tokens',
        filters: [
            {
                field: 'agent_requests_status',
                values: ['error', 'cancelled'],
            },
        ],
    }),
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
            minVersion: '0.18.0',
            fieldMapping: {
                x: 'query_events_dashboard_name',
                m1: 'query_events_total_queries',
                m2: 'query_events_p95_response_time_ms',
            },
            optionValues: {
                m1Name: 'Queries',
                m2Name: 'P95 response time (ms)',
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
            'Viewers of verified content as a share of viewers of content with a known verification status. A viewer can also view unverified content.',
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
];
