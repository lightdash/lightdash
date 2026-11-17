import {
    ChartType,
    convertFieldRefToFieldId,
    type CreateSavedChartVersion,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import dayjs from 'dayjs';

// Read in one page; a project with more pre-aggregates than this shows only the first ones.
export const PRE_AGGREGATES_PAGE_SIZE = 500;

type Status = { label: string; color: string | undefined };

export const getPreAggregateStatus = (
    summary: PreAggregateMaterializationSummary,
): Status => {
    if (summary.definitionError) return { label: 'Not valid', color: 'red' };
    if (summary.externalTable) {
        return { label: 'Your own table', color: undefined };
    }
    switch (summary.materialization?.status) {
        case 'active':
            return { label: 'Ready', color: 'green' };
        case 'in_progress':
            return { label: 'Building', color: 'yellow' };
        case 'failed':
            return { label: 'Failed', color: 'red' };
        default:
            return { label: 'Not built yet', color: undefined };
    }
};

type Labelled = Record<string, { label: string }>;
/** The part of an explore that names its fields. */
export type LabelledExplore = {
    baseTable: string;
    tables: Record<string, { dimensions: Labelled; metrics: Labelled }>;
};

type CoverageExplore = {
    baseTable: string;
    tables: Record<
        string,
        {
            dimensions: Record<
                string,
                {
                    name: string;
                    hidden?: boolean;
                    timeIntervalBaseDimensionName?: string;
                }
            >;
        }
    >;
};

/** How a pre-aggregate's field is named to people; its reference when the model does not have it. */
export const getFieldLabel = (
    explore: LabelledExplore | undefined,
    reference: string,
): string => {
    const [first, second] = reference.split('.');
    const table = explore?.tables[second ? first : explore.baseTable];
    const name = second ?? first;
    return (
        table?.dimensions[name]?.label ?? table?.metrics[name]?.label ?? name
    );
};

/** Whether a pre-aggregate keeps every visible dimension of its model's own table, so it is about as large as the model. */
export const coversEveryDimension = (
    explore: CoverageExplore | undefined,
    summary: Pick<
        PreAggregateMaterializationSummary,
        'dimensions' | 'timeDimension'
    >,
): boolean => {
    const table = explore?.tables[explore.baseTable];
    if (!table) return false;
    const kept = new Set(
        [...summary.dimensions, summary.timeDimension ?? ''].map((reference) =>
            reference.split('.').at(-1),
        ),
    );
    const own = Object.values(table.dimensions).filter(
        (dimension) =>
            !dimension.hidden && !dimension.timeIntervalBaseDimensionName,
    );
    return own.length > 1 && own.every((dimension) => kept.has(dimension.name));
};

export const describeRefresh = (
    summary: PreAggregateMaterializationSummary,
): string => {
    if (summary.externalTable) return 'Kept up to date outside this app';
    const onChange = summary.materializeOnChange
        ? 'when its definition changes'
        : null;
    if (!summary.refreshCron) {
        return onChange
            ? `Rebuilt ${onChange}`
            : 'Rebuilt only when you ask for it';
    }
    const schedule = cronstrue.toString(summary.refreshCron, {
        verbose: false,
        throwExceptionOnParseError: false,
    });
    return `Rebuilt ${schedule.charAt(0).toLowerCase()}${schedule.slice(1)}${onChange ? `, and ${onChange}` : ''}`;
};

/** What a model's queries did over the period: served from a pre-aggregate, or run on the warehouse and why. */
export const summariseUsage = (
    stats: {
        exploreName: string;
        hitCount: number;
        missCount: number;
        missReason: string | null;
        preAggregateName: string | null;
        chartUuid: string | null;
        chartName: string | null;
    }[],
    exploreName: string,
) => {
    const mine = stats.filter((stat) => stat.exploreName === exploreName);
    const hits = mine.reduce((total, stat) => total + stat.hitCount, 0);
    const misses = mine.reduce((total, stat) => total + stat.missCount, 0);
    const hitsByName = new Map<string, number>();
    const missesByReason = new Map<string, number>();
    const missesByChart = new Map<
        string,
        { chartName: string; count: number; reasons: Map<string, number> }
    >();
    mine.forEach((stat) => {
        if (stat.preAggregateName && stat.hitCount > 0) {
            hitsByName.set(
                stat.preAggregateName,
                (hitsByName.get(stat.preAggregateName) ?? 0) + stat.hitCount,
            );
        }
        if (stat.missReason && stat.missCount > 0) {
            missesByReason.set(
                stat.missReason,
                (missesByReason.get(stat.missReason) ?? 0) + stat.missCount,
            );
        }
        if (stat.chartUuid && stat.chartName && stat.missCount > 0) {
            const chart = missesByChart.get(stat.chartUuid) ?? {
                chartName: stat.chartName,
                count: 0,
                reasons: new Map<string, number>(),
            };
            chart.count += stat.missCount;
            if (stat.missReason) {
                chart.reasons.set(
                    stat.missReason,
                    (chart.reasons.get(stat.missReason) ?? 0) + stat.missCount,
                );
            }
            missesByChart.set(stat.chartUuid, chart);
        }
    });
    return {
        hits,
        misses,
        hitsByName,
        topMisses: [...missesByReason]
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3),
        missedCharts: [...missesByChart]
            .map(([chartUuid, { chartName, count, reasons }]) => ({
                chartUuid,
                chartName,
                count,
                reason:
                    [...reasons].sort(([, a], [, b]) => b - a)[0]?.[0] ?? null,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
    };
};

/** One model's queries per day over the last `days` days, oldest first, including days with none. */
export const usageByDay = (
    stats: {
        exploreName: string;
        date: string;
        hitCount: number;
        missCount: number;
    }[],
    exploreName: string,
    today: string,
    days: number,
) =>
    Array.from({ length: days }, (_, index) => {
        const date = dayjs(today)
            .subtract(days - 1 - index, 'day')
            .format('YYYY-MM-DD');
        const ofDay = stats.filter(
            (stat) =>
                stat.exploreName === exploreName &&
                dayjs(stat.date).format('YYYY-MM-DD') === date,
        );
        return {
            date,
            hits: ofDay.reduce((total, stat) => total + stat.hitCount, 0),
            misses: ofDay.reduce((total, stat) => total + stat.missCount, 0),
        };
    });

/** The widest query a pre-aggregate answers, as a table in Explore, to see it served. */
export const getPreAggregateQuery = (
    summary: Pick<
        PreAggregateMaterializationSummary,
        | 'sourceExploreName'
        | 'dimensions'
        | 'metrics'
        | 'timeDimension'
        | 'granularity'
    >,
    baseTable: string,
): CreateSavedChartVersion => {
    const toId = (reference: string) =>
        convertFieldRefToFieldId(reference, baseTable);
    const dimensions = [
        ...(summary.timeDimension && summary.granularity
            ? [
                  toId(
                      `${summary.timeDimension}_${summary.granularity.toLowerCase()}`,
                  ),
              ]
            : []),
        ...summary.dimensions.map(toId),
    ];
    const metrics = summary.metrics.map(toId);
    return {
        tableName: summary.sourceExploreName,
        metricQuery: {
            exploreName: summary.sourceExploreName,
            dimensions,
            metrics,
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: { type: ChartType.TABLE, config: {} },
        tableConfig: { columnOrder: [...dimensions, ...metrics] },
    };
};
