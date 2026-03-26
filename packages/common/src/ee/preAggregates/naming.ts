import type { TimeFrames } from '../../types/timeFrames';

export const PRE_AGGREGATE_EXPLORE_PREFIX = '__preagg__';

export const getPreAggregateExploreName = (
    exploreName: string,
    preAggregateName: string,
): string =>
    `${PRE_AGGREGATE_EXPLORE_PREFIX}${exploreName}__${preAggregateName}`;

export const getPreAggregateJoinedDimensionColumnName = (
    tableName: string,
    dimensionName: string,
): string => `ldj__${tableName}__${dimensionName}`;

export const getPreAggregateMetricColumnName = (fieldId: string): string =>
    fieldId;

export const getPreAggregateMetricComponentColumnName = (
    fieldId: string,
    component: 'sum' | 'count',
): string => `${fieldId}__${component}`;

export const getPreAggregateTimeDimensionColumnName = (
    dimensionName: string,
    granularity: TimeFrames,
): string => `${dimensionName}_${granularity.toLowerCase()}`;
