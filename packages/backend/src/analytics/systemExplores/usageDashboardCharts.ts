import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
} from '@lightdash/common';
import { positive } from './analyticsChartPresentation';
import { modelProviderColors, modelTierRanks } from './analyticsColorPalette';
import {
    heatmapColorClamp,
    heatmapColorClampNote,
    numberCard,
    ranking,
    wholeShare,
} from './chartBuilders';
import { monthlyQueryComparisonCharts } from './monthlyQueryComparisonCharts';
import type { UsageChartSpec } from './usageDashboardTypes';

const failedTokens = 'agent_requests_failed_or_cancelled_request_tokens';
const failedTokenShare = 'failed_token_share';
const failedTokensDescription =
    'Tokens from AI calls linked to agent requests that ended in an error or were cancelled. Tokens are not cost.';

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
            'agent_evaluation_runs_run_status_name',
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
        // "Nov 19, 02:13": the recorded time shows to the millisecond with its offset
        tableCalculations: [
            {
                name: 'run_finished',
                displayName: 'Run finished (UTC)',
                type: TableCalculationType.STRING,
                sql: `strftime(\${agent_evaluation_runs.event_ts_raw}, '%b %-d, %H:%M')`,
            },
        ],
        hiddenColumns: ['agent_evaluation_runs_event_ts_raw'],
        columnOrder: [
            'run_finished',
            'agent_evaluation_runs_agent_name',
            'agent_evaluation_runs_evaluation_name',
            'agent_evaluation_runs_run_status_name',
            'agent_evaluation_runs_pass_rate',
            'agent_evaluation_runs_passed_assessments',
            'agent_evaluation_runs_failed_assessments',
            'agent_evaluation_runs_unassessed_results',
            'agent_evaluation_runs_execution_errors',
            'agent_evaluation_runs_event_ts_raw',
            'agent_evaluation_runs_run_id',
        ],
    },
    {
        key: 'most-used-fields',
        name: 'Queries per field',
        description:
            'Distinct queries per field, counting fields that were selected, filtered, grouped or sorted. A renamed field can appear more than once.',
        explore: 'semantic_usage',
        dimensions: [
            'semantic_usage_field_label',
            'semantic_usage_table_name',
            'semantic_usage_field_kind_name',
            'semantic_usage_field_origin_name',
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
            'semantic_usage_field_kind_name',
            'semantic_usage_field_origin_name',
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
            'Charts, dashboards and data apps whose queries used each field. Queries not linked to saved content, such as exploring directly, are left out.',
        explore: 'semantic_usage',
        dimensions: [
            'semantic_usage_field_label',
            'semantic_usage_table_name',
            'semantic_usage_field_origin_name',
            'semantic_usage_field_id',
            'semantic_usage_project_id',
            'semantic_usage_chart_name',
            'semantic_usage_chart_id',
            'semantic_usage_dashboard_name',
            'semantic_usage_dashboard_id',
            'semantic_usage_app_name',
            'semantic_usage_app_id',
            'semantic_usage_context_name',
        ],
        metrics: ['semantic_usage_total_queries'],
        filters: [
            {
                field: 'semantic_usage_field_kind',
                values: ['metric', 'dimension'],
            },
            // Without this the busiest rows are all queries with no content, and say nothing
            { field: 'semantic_usage_has_content', values: [true] },
        ],
        // One name and one type for each row, where three columns were mostly empty
        tableCalculations: [
            {
                name: 'field_content_type',
                displayName: 'Content type',
                type: TableCalculationType.STRING,
                sql: `CASE WHEN \${semantic_usage.chart_id} IS NOT NULL THEN 'Chart' WHEN \${semantic_usage.app_id} IS NOT NULL THEN 'Data app' ELSE 'Dashboard' END`,
            },
            {
                name: 'field_content',
                displayName: 'Content',
                type: TableCalculationType.STRING,
                sql: `CASE WHEN \${semantic_usage.chart_id} IS NOT NULL THEN COALESCE(\${semantic_usage.chart_name}, 'Unknown chart') WHEN \${semantic_usage.app_id} IS NOT NULL THEN COALESCE(\${semantic_usage.app_name}, 'Unknown data app') ELSE COALESCE(\${semantic_usage.dashboard_name}, 'Unknown dashboard') END`,
            },
            {
                name: 'field_on_dashboard',
                displayName: 'On dashboard',
                type: TableCalculationType.STRING,
                sql: `CASE WHEN \${semantic_usage.chart_id} IS NOT NULL AND \${semantic_usage.dashboard_id} IS NOT NULL THEN COALESCE(\${semantic_usage.dashboard_name}, 'Unknown dashboard') ELSE '' END`,
            },
        ],
        hiddenColumns: [
            'semantic_usage_chart_name',
            'semantic_usage_dashboard_name',
            'semantic_usage_app_name',
        ],
        columnOrder: [
            'semantic_usage_field_label',
            'semantic_usage_table_name',
            'field_content',
            'field_content_type',
            'field_on_dashboard',
            'semantic_usage_context_name',
            'semantic_usage_total_queries',
            'semantic_usage_field_origin_name',
            'semantic_usage_field_id',
            'semantic_usage_project_id',
            'semantic_usage_chart_id',
            'semantic_usage_dashboard_id',
            'semantic_usage_app_id',
        ],
        limit: 50,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
    },
    {
        key: 'field-capture-coverage',
        name: 'Share of queries with a full field list',
        description:
            'Queries in the selected period where Lightdash has the full list of metrics and dimensions the query used, as a share of all queries. SQL queries and queries from before the list was switched on have no list, and very large queries can have only part of one.',
        explore: 'semantic_usage',
        dimensions: [],
        metrics: [
            'semantic_usage_queries_with_field_details',
            'semantic_usage_total_queries',
        ],
        tableCalculations: [
            wholeShare,
            {
                name: 'field_list_share',
                displayName: 'Share of queries with a full field list',
                type: TableCalculationType.NUMBER,
                sql: '${semantic_usage.queries_with_field_details} * 1.0 / NULLIF(${semantic_usage.total_queries}, 0)',
                format: { type: CustomFormatType.PERCENT, round: 0 },
            },
        ],
        limit: 1,
        sorts: [{ fieldId: 'semantic_usage_total_queries', descending: true }],
        visualization: 'number',
        // The number shown is the share, not the first measure
        yFields: ['field_list_share'],
        libraryChart: numberCard(
            'field_list_share',
            'Of all queries in the selected period',
            { percent: true, whole: wholeShare.name, color: positive },
        ),
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
            minVersion: '0.8.4',
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
            minVersion: '0.8.4',
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
            minVersion: '0.5.1',
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
                ...heatmapColorClamp,
            },
            // The plain table has no colours, so only the heatmap says where its scale stops
            description: `Requests by agent and day. ${heatmapColorClampNote}`,
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
                    'Requests per person and agent in the selected period. Requests with no person recorded are grouped as No user recorded.',
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
                displayName: 'Share rated',
                type: TableCalculationType.NUMBER,
                // A fraction with a percent format, so the table writes it as 42%
                sql: '${agent_requests.feedback_coverage}',
                format: { type: CustomFormatType.PERCENT, round: 0 },
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
            minVersion: '0.14.2',
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
                valueNames: 'Requests,Rated,Share rated,Negative',
                useFieldFormats: true,
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
            'Requests, time spent on failed attempts, average latency and tokens for each retry count. Each retry runs the request again with new AI calls, so more retries mean a longer wait and more tokens.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_retry_count'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_total_retry_overhead_s',
            'agent_requests_average_request_latency_s',
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
                m2: 'agent_requests_average_request_latency_s',
            },
            optionValues: {
                m1Name: 'Agent requests',
                m2Name: 'Average latency (s)',
                seriesType: 'bar',
                m2Type: 'line',
                dualAxis: true,
                m2Right: true,
                xAxisType: 'category',
                showSymbols: true,
                xName: 'Retries',
                yName: 'Agent requests',
                yRightName: 'Average latency (s)',
            },
            query: {
                dimensions: ['agent_requests_retry_count'],
                metrics: [
                    'agent_requests_total_requests',
                    'agent_requests_average_request_latency_s',
                ],
                sorts: [
                    {
                        fieldId: 'agent_requests_retry_count',
                        descending: false,
                    },
                ],
                limit: 30,
                description:
                    'Requests and average request latency by retry count. Each retry runs the request again with new AI calls, so more retries mean a longer wait and more tokens.',
            },
        },
    },
    {
        key: 'ai-consumption-by-person-feature-and-model',
        name: 'Tokens by person and model',
        description:
            'Tokens and AI calls for each person, model and feature. Usage with no person recorded is left out.',
        explore: 'ai_usage',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_model_name',
            'ai_usage_feature_name',
            'ai_usage_user_id',
        ],
        metrics: ['ai_usage_total_tokens_used', 'ai_usage_total_ai_calls'],
        filters: [
            {
                field: 'ai_usage_user_id',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ],
        limit: 30,
        sorts: [
            {
                descending: true,
                fieldId: 'ai_usage_total_tokens_used',
            },
        ],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.8',
            fieldMapping: {
                x: 'ai_usage_user_name',
                m1: 'ai_usage_total_tokens_used',
                splitBy: 'ai_usage_model_name',
            },
            optionValues: {
                splitColorGroups: modelProviderColors,
                splitShadeRank: modelTierRanks,
                legendMode: 'groups',
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
                dimensions: ['ai_usage_user_name', 'ai_usage_model_name'],
                metrics: ['ai_usage_total_tokens_used'],
                sorts: [
                    {
                        fieldId: 'ai_usage_total_tokens_used',
                        descending: true,
                    },
                ],
                limit: 24,
                description:
                    'Top 24 person and model pairs by tokens in the selected period, so a person near the cut-off can be missing their smaller models. Usage with no person recorded is left out.',
            },
        },
    },
    {
        key: 'ai-tokens-by-feature-and-model',
        name: 'Tokens by feature and model',
        description: '',
        explore: 'ai_usage',
        dimensions: ['ai_usage_feature_name', 'ai_usage_model_name'],
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
            minVersion: '0.5.1',
            fieldMapping: {
                x: 'ai_usage_model_name',
                y: 'ai_usage_feature_name',
                value: 'ai_usage_total_tokens_used',
            },
            optionValues: {
                xTitle: 'Model',
                yTitle: 'Feature',
                legendTitle: 'Tokens',
                legendFormat: 'compact',
                ...heatmapColorClamp,
            },
            // Columns keep the order the rows arrive in: providers by their tokens, then each
            // provider's models from the most powerful tier down
            query: {
                dimensions: [
                    'ai_usage_feature_name',
                    'ai_usage_model_name',
                    'ai_usage_model_provider',
                    'ai_usage_model_tier',
                ],
                metrics: ['ai_usage_total_tokens_used'],
                tableCalculations: [
                    {
                        name: 'provider_tokens',
                        displayName: 'Provider tokens',
                        type: TableCalculationType.NUMBER,
                        sql: 'SUM(${ai_usage.total_tokens_used}) OVER (PARTITION BY ${ai_usage.model_provider})',
                    },
                    {
                        name: 'model_tokens',
                        displayName: 'Model tokens',
                        type: TableCalculationType.NUMBER,
                        sql: 'SUM(${ai_usage.total_tokens_used}) OVER (PARTITION BY ${ai_usage.model_name})',
                    },
                ],
                sorts: [
                    { fieldId: 'provider_tokens', descending: true },
                    { fieldId: 'ai_usage_model_provider', descending: false },
                    // The more powerful model first within a provider, as its darker shade elsewhere
                    { fieldId: 'ai_usage_model_tier', descending: false },
                    { fieldId: 'model_tokens', descending: true },
                    { fieldId: 'ai_usage_total_tokens_used', descending: true },
                ],
                limit: 500,
                description: `Tokens for each feature and model, with models grouped by provider and the most powerful first. ${heatmapColorClampNote}`,
            },
        },
    },
    {
        key: 'query-failures-affected-people',
        name: 'Query failures by people affected',
        description:
            'Failed queries, ranked by people affected. Failures not linked to any content are still shown.',
        explore: 'query_events',
        // Every row is a failure, so the outcome is not a column
        dimensions: [
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
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.15.0',
            fieldMapping: {
                rowDimension: 'query_events_dashboard_name',
                rowDimension2: 'query_events_explore_name',
                // The dashboard name opens the dashboard, as it does in the plain table
                link: 'query_events_dashboard_url',
                metric: [
                    'query_events_unique_users',
                    'query_events_total_queries',
                ],
            },
            // The two names sit side by side. A group row would add up people over its explores, and
            // a person who met failures in two of them would be counted twice.
            optionValues: {
                groupSubtotals: false,
                showMiniBars: true,
                showTotalsRow: false,
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Dashboard',
                valueNames: 'People affected,Failed queries',
            },
            // Shares the plain table's query, which carries the address of each dashboard
            query: null,
        },
    },
    // Rows are the origins, with where their queries were run from under each. Who started them is a
    // column for each kind of starter, so the three names fit a table that groups by two.
    ranking({
        key: 'query-origin-and-initiating-actor',
        name: 'Queries by origin and who started them',
        description: 'Older queries with unknown values are still shown.',
        explore: 'query_events',
        by: 'query_events_workload_origin_name',
        then: 'query_events_context_name',
        series: 'query_events_initiating_actor_type_name',
        dimensions: [
            'query_events_workload_origin_name',
            'query_events_initiating_actor_type_name',
            'query_events_context_name',
        ],
        metrics: ['query_events_total_queries'],
        limit: 50,
        libraryDescription:
            'Queries for each origin, with a column for each kind of starter. Open an origin to see where its queries were run from; older queries with unknown values are still shown.',
    }),
    {
        key: 'request-consumption-by-outcome-and-feedback',
        name: 'Tokens spent on failed or cancelled requests',
        description: failedTokensDescription,
        explore: 'agent_requests',
        dimensions: [],
        metrics: [failedTokens],
        limit: 1,
        sorts: [{ fieldId: failedTokens, descending: true }],
        visualization: 'number',
        libraryChart: {
            slug: 'big-number-with-sparkline-trend',
            minVersion: '0.8.4',
            fieldMapping: {
                value: failedTokens,
                sparklineMetric: failedTokens,
                time: 'agent_requests_requested_at_day',
                secondary: failedTokenShare,
            },
            optionValues: {
                valueAggregation: 'sum',
                style: 'compact',
                showComparison: false,
                sizeMode: 'preset',
                bigNumberSize: 6,
                reserveComparisonSpace: false,
                secondaryLabel: 'of all tokens used by agent requests',
                colorSparklineByTrend: false,
                showSparklineArea: true,
                showLabel: true,
                label: 'Selected period',
                showCardBorder: false,
                showCardShadow: false,
            },
            query: {
                dimensions: ['agent_requests_requested_at_day'],
                metrics: [failedTokens, 'agent_requests_total_request_tokens'],
                sorts: [
                    {
                        fieldId: 'agent_requests_requested_at_day',
                        descending: false,
                    },
                ],
                limit: 500,
                // The same share on every row: the card reads it from the latest day
                tableCalculations: [
                    {
                        name: failedTokenShare,
                        displayName: 'Share of all tokens',
                        type: TableCalculationType.NUMBER,
                        sql: 'SUM(${agent_requests.failed_or_cancelled_request_tokens}) OVER () * 1.0 / NULLIF(SUM(${agent_requests.total_request_tokens}) OVER (), 0)',
                        format: { type: CustomFormatType.PERCENT, round: 1 },
                    },
                ],
                description:
                    'Tokens from AI calls linked to agent requests that ended in an error or were cancelled. The percentage is their share of all tokens used by agent requests in the selected period.',
            },
        },
    },
    {
        key: 'slow-dashboards-tail-latency-and-demand',
        name: 'Slowest dashboards: P95 response time in seconds (top 20)',
        description:
            'The 20 dashboards with the longest P95 response time in the selected period. A dashboard with few queries can rank high on one slow query.',
        explore: 'query_events',
        dimensions: [
            'query_events_dashboard_name',
            'query_events_dashboard_id',
        ],
        metrics: ['query_events_p95_response_time_s'],
        filters: [
            {
                field: 'query_events_dashboard_name',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
            // Lightdash's own analytics dashboards are not the organization's to speed up
            { field: 'query_events_in_analytics_project', values: [false] },
        ],
        limit: 20,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_p95_response_time_s',
            },
        ],
        // Ranked bars in both versions; the table beside it has the other measures
        visualization: 'bar',
        xField: 'query_events_dashboard_name',
        yFields: ['query_events_p95_response_time_s'],
        flipAxes: true,
        libraryChart: {
            // Ranked bars with the names beside them: twenty long names under a chart had to be
            // written at an angle. One measure, so one axis.
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.4',
            fieldMapping: {
                x: 'query_events_dashboard_name',
                m1: 'query_events_p95_response_time_s',
            },
            optionValues: {
                seriesType: 'bar',
                orientation: 'horizontal',
                m1Name: 'P95 response time (s)',
                showDataLabels: true,
                lightdashLabels: false,
                showAxisTitles: false,
                showLegend: false,
            },
            query: null,
        },
    },
    {
        // Slow and expensive are different lists: a dashboard can respond quickly and still cost the
        // most because it runs all day. One row for each dashboard, most warehouse time first.
        key: 'dashboards-warehouse-and-response-time',
        name: 'Dashboards by warehouse time (top 25)',
        description:
            'The 25 dashboards whose queries took the most warehouse time in the selected period, with their P95 response time, queries and people. Warehouse time is added up over every query the dashboard ran.',
        explore: 'query_events',
        dimensions: [
            'query_events_dashboard_name',
            'query_events_dashboard_id',
        ],
        metrics: [
            'query_events_total_warehouse_execution_time_s',
            'query_events_p95_response_time_s',
            'query_events_total_queries',
            'query_events_unique_users',
        ],
        filters: [
            {
                field: 'query_events_dashboard_name',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
            // Lightdash's own analytics dashboards are not the organization's to speed up
            { field: 'query_events_in_analytics_project', values: [false] },
        ],
        limit: 25,
        sorts: [
            {
                descending: true,
                fieldId: 'query_events_total_warehouse_execution_time_s',
            },
        ],
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.15.0',
            fieldMapping: {
                rowDimension: 'query_events_dashboard_name',
                // The dashboard name opens the dashboard, as it does in the plain table
                link: 'query_events_dashboard_url',
                metric: [
                    'query_events_total_warehouse_execution_time_s',
                    'query_events_p95_response_time_s',
                    'query_events_total_queries',
                    'query_events_unique_users',
                ],
            },
            optionValues: {
                showMiniBars: true,
                showTotalsRow: false,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Dashboard',
                valueNames:
                    'Warehouse time (s),P95 response time (s),Queries,People',
                // Seconds keep their decimals and counts stay whole
                useFieldFormats: true,
            },
            // Shares the plain table's query, which carries the address of each dashboard
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
        tableCalculations: [wholeShare],
        hiddenColumns: [wholeShare.name],
        yFields: ['content_reach_verified_audience_share'],
        libraryChart: numberCard(
            'content_reach_verified_audience_share',
            'Of viewers of content with a known status',
            {
                percent: true,
                whole: wholeShare.name,
                color: positive,
                // The same line above the number as the three cards beside it
                period: 'Selected period',
            },
        ),
    },
    // A handful of rows, so the groups start open
    ranking({
        key: 'warehouse-versus-cached-demand',
        name: 'Warehouse versus cached queries',
        description:
            'Queries by cache hit and by what ran or served them, such as the warehouse, the results cache or a pre-aggregate.',
        explore: 'query_events',
        by: 'query_events_cache_hit_name',
        then: 'query_events_execution_source_name',
        metrics: ['query_events_total_queries'],
        limit: 30,
        expanded: true,
    }),
];
