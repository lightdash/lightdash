import { MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const dataAppReachColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'app_id',
        'user_id',
        'view_context',
        'event_name',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'event_ts', type: 'TIMESTAMP' },
];

// Reuse raw HTML loads. No history windows, additional stream or materialization.
// The embed token issuer is not the person viewing the embedded app.
export const dataAppReachSql = `(SELECT org_id, project_id, app_id,
    CASE WHEN view_context = 'embed' THEN NULL ELSE user_id END AS user_id,
    event_name, event_ts, COALESCE(view_context, 'unknown') AS view_context
FROM data_app_events WHERE event_name = 'data_app.view')`;

export const dataAppReachMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_loads',
        type: MetricType.COUNT,
        column: 'event_name',
        description:
            'Recorded app HTML loads, including previews and reloads. Filter View context to select a surface. Loads do not confirm successful rendering or human attention.',
    },
    {
        name: 'distinct_viewers',
        type: MetricType.COUNT_DISTINCT,
        column: 'user_id',
        description:
            'Distinct recorded users in the selected period. Identified embed loads have no known viewer and are excluded; historical unknown context cannot distinguish embeds. Do not sum across apps or dates.',
    },
    {
        name: 'apps_loaded',
        type: MetricType.COUNT_DISTINCT,
        column: 'app_id',
        description:
            'Apps with at least one recorded load in the selected period.',
    },
    {
        name: 'last_loaded_at',
        type: MetricType.MAX,
        column: 'event_ts',
        description: 'Latest recorded app HTML load in the selected period.',
    },
];
