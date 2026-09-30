import { MetricType } from '@lightdash/common';
import { contentViewsColumns } from '../eventStream/contentViewsStream';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const contentReachColumns: CompactedStreamColumn[] = [
    ...contentViewsColumns,
    { name: 'qualifying_view_at', type: 'TIMESTAMP' },
    ...[
        'viewer_id',
        'returning_viewer_id',
        'first_week_returning_viewer_id',
        'known_verification_viewer_id',
        'verified_viewer_id',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'first_view_day', type: 'TIMESTAMP' },
    { name: 'creation_week', type: 'TIMESTAMP' },
    { name: 'weeks_since_creation', type: 'BIGINT' },
];

// Dedupe only stable identities, never same-day views. Window calculations run
// before Explore filters so date ranges do not redefine a person's first visit.
export const contentReachSql = `(WITH deduplicated AS (
    SELECT * FROM content_views
    QUALIFY event_id IS NULL OR ROW_NUMBER() OVER (
        PARTITION BY org_id, project_id, content_type, content_id, user_id, event_id
        ORDER BY ingested_at
    ) = 1
), visits AS (
    SELECT *, CASE WHEN is_qualifying AND actor_type = 'user' AND user_id IS NOT NULL
        THEN event_ts END AS qualifying_view_at
    FROM deduplicated
), readership AS (
    SELECT *, MIN(date_trunc('day', qualifying_view_at)) OVER (
        PARTITION BY org_id, project_id, content_type, content_id, user_id
    ) AS first_view_day
    FROM visits
)
SELECT *,
    date_trunc('week', content_created_at) AS creation_week,
    floor(date_diff('day', content_created_at, event_ts) / 7.0)::BIGINT AS weeks_since_creation,
    CASE WHEN qualifying_view_at IS NOT NULL THEN user_id END AS viewer_id,
    CASE WHEN date_trunc('day', qualifying_view_at) > first_view_day THEN user_id END AS returning_viewer_id,
    CASE WHEN qualifying_view_at >= date_trunc('day', content_created_at) + INTERVAL 7 DAY
        AND first_view_day < date_trunc('day', content_created_at) + INTERVAL 7 DAY
        THEN user_id END AS first_week_returning_viewer_id,
    CASE WHEN qualifying_view_at IS NOT NULL AND is_verified IS NOT NULL THEN user_id END AS known_verification_viewer_id,
    CASE WHEN qualifying_view_at IS NOT NULL AND is_verified THEN user_id END AS verified_viewer_id
FROM readership)`;

export const contentReachMetrics: SystemMetricDefinition[] = [
    {
        name: 'qualifying_views',
        description:
            'Successful backend content fetches attributed to users. Excludes known previews, embeds and unclassified legacy events. Refetches count separately; browser-cache-only visits are not captured.',
        type: MetricType.COUNT,
        column: 'qualifying_view_at',
    },
    {
        name: 'distinct_viewers',
        description:
            'Distinct registered users with a qualifying backend fetch in the selected period.',
        type: MetricType.COUNT_DISTINCT,
        column: 'viewer_id',
    },
    {
        name: 'returning_viewers',
        description:
            'Distinct users with a qualifying backend fetch on a later UTC day than their first captured qualifying backend fetch to the same content. First visits are calculated before date filters.',
        type: MetricType.COUNT_DISTINCT,
        column: 'returning_viewer_id',
    },
    {
        name: 'first_week_returning_viewers',
        description:
            'Distinct users first observed in the first seven UTC calendar days from content creation, who visit again on or after the eighth UTC calendar day since creation. Creation is not a known launch date; capture predating this feature is unavailable.',
        type: MetricType.COUNT_DISTINCT,
        column: 'first_week_returning_viewer_id',
    },
    {
        name: 'verified_viewers',
        description:
            'Distinct qualifying viewers who viewed content verified at the time of that visit.',
        type: MetricType.COUNT_DISTINCT,
        column: 'verified_viewer_id',
    },
    {
        name: 'last_viewed_at',
        description:
            'Most recent qualifying backend fetch in the selected period.',
        type: MetricType.MAX,
        column: 'qualifying_view_at',
    },
];
