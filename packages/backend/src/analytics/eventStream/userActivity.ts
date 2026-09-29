import type { StreamName } from './projection';
import type { CompactedStreamColumn } from './types';

// Keep the existing Explore order stable; every captured stream is covered.
export const analyticsStreams = [
    'query_events',
    'ai_usage',
    'data_app_events',
    'export_events',
    'agent_steps',
] as const satisfies readonly StreamName[];

export const userActivityColumns: CompactedStreamColumn[] = [
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'activity_date', type: 'TIMESTAMP' },
    { name: 'stream', type: 'VARCHAR' },
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'format', type: 'VARCHAR' },
    { name: 'event_count', type: 'BIGINT' },
    { name: 'query_count', type: 'BIGINT' },
    ...[
        'input_tokens',
        'output_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'reasoning_tokens',
        'total_tokens',
    ].map((name) => ({ name, type: 'BIGINT' as const })),
];

// Same tenant prefix as the signed event/dimension manifest, separate model namespace.
export const userActivityKey = (
    orgId: string,
    stream: StreamName,
    date: string,
): string =>
    `events/compacted/org_id=${orgId}/model=user_activity/stream=${stream}/dt=${date}/activity.parquet`;
