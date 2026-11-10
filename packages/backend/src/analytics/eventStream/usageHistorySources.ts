import { aiUsageCompactedColumns } from './aiUsageStream';
import { queryEventsCompactedColumns } from './queryEventsStream';
import { QUERY_HISTORY_BACKFILL_EVENT } from './queryHistoryBackfill';
import type { CompactedStreamColumn } from './types';

// These database facts have different identities/counting rules from captured
// events. Keep them separate rather than adding them to native view totals.
export const historicalActivityColumns: CompactedStreamColumn[] = [
    ...[
        'history_source',
        'record_id',
        'activity_type',
        'org_id',
        'project_id',
        'user_id',
        'content_id',
        'content_type',
        'app_id',
        'current_status',
        'context',
        'dashboard_id',
        'tool_name',
        'agent_id',
        'thread_id',
        'prompt_id',
        'direction',
        'stage',
        'query_id',
        'file_type',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'event_ts', type: 'TIMESTAMP' },
    ...['schema_version', 'version', 'human_score'].map((name) => ({
        name,
        type: 'INTEGER' as const,
    })),
    ...['duration_ms', 'input_tokens', 'output_tokens', 'total_tokens'].map(
        (name) => ({ name, type: 'BIGINT' as const }),
    ),
    { name: 'success', type: 'BOOLEAN' },
];

export type UsageHistorySource = {
    name: 'query_events' | 'ai_usage' | 'historical_activity';
    columns: CompactedStreamColumn[];
    keyColumns: string[];
    fallbackRows?: {
        keyColumns: string[];
        markerColumn: string;
        markerValue: string;
    };
    replaceExisting?: boolean;
};

export const usageHistorySources: UsageHistorySource[] = [
    {
        name: 'query_events',
        columns: queryEventsCompactedColumns,
        keyColumns: ['org_id', 'project_id', 'query_id'],
        fallbackRows: {
            keyColumns: ['org_id', 'project_id', 'query_id'],
            markerColumn: 'event_name',
            markerValue: QUERY_HISTORY_BACKFILL_EVENT,
        },
    },
    {
        name: 'ai_usage',
        columns: [
            ...aiUsageCompactedColumns,
            { name: 'history_origin', type: 'VARCHAR' },
        ],
        keyColumns: ['org_id', 'event_id'],
        fallbackRows: {
            keyColumns: ['org_id', 'event_id'],
            markerColumn: 'history_origin',
            markerValue: 'database',
        },
    },
    {
        name: 'historical_activity',
        columns: historicalActivityColumns,
        keyColumns: ['org_id', 'history_source', 'record_id'],
        replaceExisting: true,
    },
];

export const usageHistoryKey = (org: string, source: string) =>
    `events/compacted/org_id=${org}/history=${source}/history.parquet`;
