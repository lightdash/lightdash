import {
    card,
    cloud,
    ranking,
    stackedByDay,
    trendByCategory,
} from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const toolDay = 'tool_activity_event_ts_day';
const exportDay = 'export_events_event_ts_day';
const mcp: NonNullable<UsageChartSpec['filters']> = [
    { field: 'tool_activity_source', values: ['mcp'] },
];

export const toolsChartSpecs: UsageChartSpec[] = [
    card({
        key: 'tools-mcp-people-latest-day',
        name: 'People using MCP tools',
        description:
            'People who called an MCP tool on the latest day in the selected period. Service accounts are not counted as people.',
        explore: 'tool_activity',
        day: toolDay,
        metric: 'tool_activity_unique_users',
        filters: mcp,
        latestDay: true,
        hero: true,
    }),
    card({
        key: 'tools-mcp-calls',
        name: 'MCP tool calls',
        description:
            'MCP tool calls in the selected period, including calls by service accounts.',
        explore: 'tool_activity',
        day: toolDay,
        metric: 'tool_activity_total_calls',
        filters: mcp,
    }),
    card({
        key: 'tools-mcp-failed-calls',
        name: 'Failed MCP tool calls',
        description:
            'MCP tool calls that ended in an error in the selected period.',
        explore: 'tool_activity',
        day: toolDay,
        metric: 'tool_activity_failed_calls',
        filters: mcp,
    }),
    trendByCategory({
        key: 'tools-mcp-calls-by-tool-and-day',
        name: 'MCP tool calls by day, one row per tool',
        description:
            'The eight most-called MCP tools in the selected period. Each tool has its own scale, so row heights cannot be compared.',
        explore: 'tool_activity',
        day: toolDay,
        metric: 'tool_activity_total_calls',
        category: 'tool_activity_tool_name',
        top: 8,
        filters: mcp,
    }),
    cloud({
        key: 'tools-mcp-tools-cloud',
        name: 'MCP tools, sized by calls',
        description: 'MCP tools sized by calls in the selected period.',
        explore: 'tool_activity',
        word: 'tool_activity_tool_name',
        metric: 'tool_activity_total_calls',
        filters: mcp,
    }),
    ranking({
        key: 'mcp-users-clients-tools-and-error-rates',
        name: 'MCP tool calls by person and tool',
        description:
            'MCP tool calls for each person, client and tool, including service accounts. Duration is in milliseconds. An error rate over a few calls is not reliable.',
        explore: 'tool_activity',
        by: 'tool_activity_user_name',
        then: 'tool_activity_tool_name',
        dimensions: [
            'tool_activity_user_name',
            'tool_activity_user_id',
            'tool_activity_actor_type',
            'tool_activity_client_name',
            'tool_activity_tool_name',
        ],
        metrics: ['tool_activity_total_calls', 'tool_activity_failed_calls'],
        extraMetrics: [
            'tool_activity_error_rate',
            'tool_activity_p90_duration_ms',
        ],
        filters: mcp,
        limit: 40,
        libraryDescription:
            'MCP tool calls and failed calls for each person, including service accounts. Open a person to see the tools they called.',
    }),
    card({
        key: 'tools-downloads',
        name: 'Downloads',
        description:
            'Finished downloads of results in the selected period. Downloads that failed are left out.',
        explore: 'export_events',
        day: exportDay,
        metric: 'export_events_total_downloads',
    }),
    card({
        key: 'tools-people-downloading-latest-day',
        name: 'People downloading',
        description:
            'People who started a download on the latest day in the selected period, including downloads that failed.',
        explore: 'export_events',
        day: exportDay,
        metric: 'export_events_unique_users',
        latestDay: true,
    }),
    card({
        key: 'tools-csv-downloads',
        name: 'CSV downloads',
        description: 'Finished CSV downloads in the selected period.',
        explore: 'export_events',
        day: exportDay,
        metric: 'export_events_total_csv_downloads',
    }),
    stackedByDay({
        key: 'tools-downloads-by-format-and-day',
        name: 'Downloads by format and day',
        description: '',
        explore: 'export_events',
        day: exportDay,
        metric: 'export_events_total_downloads',
        splitBy: 'export_events_format',
        yName: 'Downloads',
        splitDescription: 'Finished downloads per day, split by file format.',
    }),
    ranking({
        key: 'export-audit-actor-content-and-outcome',
        name: 'Downloads by person and format',
        description:
            'Downloads of results only, with the chart or dashboard they came from. A blank content link means the content is unknown, not that there was none.',
        explore: 'export_events',
        by: 'export_events_user_name',
        then: 'export_events_format',
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
        metrics: ['export_events_total_downloads'],
        extraMetrics: [
            'export_events_total_events',
            'export_events_total_csv_downloads',
        ],
        libraryDescription:
            'Finished downloads for each person. Open a person to see the file formats they downloaded.',
    }),
];

export const toolsDashboardSpec: UsageDashboardSpec = {
    key: 'lightdash-analytics-tools',
    name: 'Tools & operations',
    description: 'MCP tool usage and downloads.',
    tabs: [
        {
            key: 'mcp',
            name: 'MCP tools',
            sections: [
                {
                    title: 'Tool usage',
                    description:
                        'MCP tool calls by day, tool and person, including service accounts.',
                    charts: [
                        'tools-mcp-people-latest-day',
                        'tools-mcp-calls',
                        'tools-mcp-failed-calls',
                    ],
                    layout: 'row',
                    rowHeight: 4,
                    widths: [18, 9, 9],
                },
                {
                    title: 'Calls by tool',
                    description: '',
                    note: false,
                    charts: ['tools-mcp-calls-by-tool-and-day'],
                    layout: 'row',
                    // Fits eight tool rows of about 70 to 90px.
                    rowHeight: 14,
                },
                {
                    title: 'Tools and people',
                    description: '',
                    note: false,
                    charts: [
                        'tools-mcp-tools-cloud',
                        'mcp-users-clients-tools-and-error-rates',
                    ],
                    layout: 'row',
                    rowHeight: 9,
                },
            ],
        },
        {
            key: 'exports',
            name: 'Exports',
            sections: [
                {
                    title: 'Export activity',
                    description:
                        'Recorded downloads, with who downloaded and the content it came from where known. This does not show who received the file afterwards or how it was used.',
                    charts: [
                        'tools-downloads',
                        'tools-people-downloading-latest-day',
                        'tools-csv-downloads',
                    ],
                },
                {
                    title: 'Downloads by format',
                    description: '',
                    note: false,
                    charts: ['tools-downloads-by-format-and-day'],
                    layout: 'row',
                    rowHeight: 7,
                },
                {
                    title: 'Downloads by person',
                    description: '',
                    note: false,
                    charts: ['export-audit-actor-content-and-outcome'],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
    ],
};
