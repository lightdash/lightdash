import { FilterOperator, MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const dataAppOutcomesColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'app_id',
        'user_id',
        'navigation_id',
        'navigation_key',
        'view_context',
        'outcome',
        'event_name',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'version', type: 'INTEGER' },
    { name: 'event_ts', type: 'TIMESTAMP' },
];

export const dataAppOutcomesSql = `(SELECT org_id, project_id, app_id,
    CASE WHEN view_context = 'embed' THEN NULL ELSE user_id END AS user_id,
    version, navigation_id,
    CASE WHEN navigation_id IS NOT NULL THEN
        to_json([org_id, project_id, app_id, CAST(version AS VARCHAR), navigation_id])
    END AS navigation_key,
    COALESCE(view_context, 'unknown') AS view_context,
    outcome, event_name, event_ts
FROM data_app_events WHERE event_name = 'data_app.view_outcome')`;

export const dataAppOutcomesMetrics: SystemMetricDefinition[] = [
    {
        name: 'observed_navigations',
        type: MetricType.COUNT_DISTINCT,
        column: 'navigation_key',
        description:
            'Distinct app navigations with at least one captured technical outcome. Repeated signals are deduplicated. Missing navigation IDs are excluded; this is not a count of people or all app loads.',
    },
    ...(
        [
            ['html_loaded', 'HTML responses completed by the server'],
            ['html_error', 'Failed or interrupted HTML responses'],
            ['sdk_started', 'Navigations with observed SDK startup'],
            [
                'runtime_error',
                'Navigations with an observed browser runtime error',
            ],
        ] as const
    ).map(([outcome, description]) => ({
        name: outcome,
        type: MetricType.COUNT_DISTINCT,
        column: 'navigation_key',
        description: `${description}, deduplicated by app and navigation. Missing navigation IDs are excluded. Technical signals do not prove complete rendering or human attention.`,
        filters: [
            {
                id: `data-app-${outcome}`,
                target: { fieldRef: 'outcome' },
                operator: FilterOperator.EQUALS,
                values: [outcome],
            },
        ],
    })),
    {
        name: 'total_signals',
        type: MetricType.COUNT,
        column: 'event_name',
        description:
            'Captured technical outcome signals, including repeated signals and signals without navigation IDs. Not app activity, loads, people or confirmed readership.',
    },
];
