import {
    ChartType,
    convertFieldRefToFieldId,
    type CreateSavedChartVersion,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import cronstrue from 'cronstrue';

// ponytail: one page of the project's pre-aggregates; filter on the server if a project outgrows it.
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
    }[],
    exploreName: string,
) => {
    const mine = stats.filter((stat) => stat.exploreName === exploreName);
    const hits = mine.reduce((total, stat) => total + stat.hitCount, 0);
    const misses = mine.reduce((total, stat) => total + stat.missCount, 0);
    const hitsByName = new Map<string, number>();
    const missesByReason = new Map<string, number>();
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
    });
    return {
        hits,
        misses,
        hitsByName,
        topMisses: [...missesByReason]
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3),
    };
};

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
