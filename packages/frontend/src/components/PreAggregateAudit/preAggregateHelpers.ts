import {
    preAggregateMissReasonLabels,
    type PreAggregateDailyStatResult,
    type PreAggregateMissReason,
} from '@lightdash/common';

export type QueryType = 'explorer' | 'chart' | 'dashboard';

export const QUERY_TYPE_LABELS: Record<QueryType, string> = {
    explorer: 'Ad-hoc Explorer',
    chart: 'Saved Chart',
    dashboard: 'Dashboard Chart',
};

export const ALL_QUERY_TYPES: QueryType[] = ['explorer', 'chart', 'dashboard'];

export type AggregatedRow = {
    chartName: string | null;
    chartUuid: string | null;
    dashboardName: string | null;
    dashboardUuid: string | null;
    exploreName: string;
    queryContext: string;
    queryType: QueryType;
    hitCount: number;
    missCount: number;
    topMissReason: string | null;
    preAggregateName: string | null;
    updatedAt: string;
};

function getQueryType(row: PreAggregateDailyStatResult): QueryType {
    if (row.dashboardUuid) return 'dashboard';
    if (row.chartUuid) return 'chart';
    return 'explorer';
}

export function aggregateStats(
    stats: PreAggregateDailyStatResult[],
): AggregatedRow[] {
    const grouped = new Map<string, AggregatedRow>();

    for (const stat of stats) {
        const key = `${stat.exploreName}|${stat.chartUuid ?? 'adhoc'}|${stat.dashboardUuid ?? 'none'}|${stat.queryContext}`;

        const existing = grouped.get(key);
        if (existing) {
            existing.hitCount += stat.hitCount;
            existing.missCount += stat.missCount;
            existing.topMissReason ??= stat.missReason;
            if (stat.updatedAt > existing.updatedAt) {
                existing.updatedAt = stat.updatedAt;
            }
        } else {
            grouped.set(key, {
                chartName: stat.chartName,
                chartUuid: stat.chartUuid,
                dashboardName: stat.dashboardName,
                dashboardUuid: stat.dashboardUuid,
                exploreName: stat.exploreName,
                queryContext: stat.queryContext,
                queryType: getQueryType(stat),
                hitCount: stat.hitCount,
                missCount: stat.missCount,
                topMissReason: stat.missReason,
                preAggregateName: stat.preAggregateName,
                updatedAt: stat.updatedAt,
            });
        }
    }

    return Array.from(grouped.values());
}

export function formatMissReason(reason: string | null): string {
    if (!reason) return '\u2014';
    return (
        preAggregateMissReasonLabels[reason as PreAggregateMissReason] ?? reason
    );
}
