import { type FieldId, type MetricType } from './field';
import { type MetricQuery } from './metricQuery';
import { type ResultColumns } from './results';
import { type PreAggregateMaterializationTrigger } from './scheduler';
import { type TimeFrames } from './timeFrames';

export type MaterializationMetricComponent = {
    componentFieldId: string;
    aggregation: MetricType.SUM | MetricType.MIN | MetricType.MAX;
};

export type MaterializationMetricQueryPayload = {
    metricQuery: MetricQuery;
    metricComponents: Record<string, MaterializationMetricComponent[]>;
};

export type PreAggregateMaterializationStatus =
    | 'in_progress'
    | 'active'
    | 'superseded'
    | 'failed';

export type ActiveMaterializationDetails = {
    materializationUuid: string;
    queryUuid: string;
    resultsFileName: string;
    format: 'jsonl';
    columns: ResultColumns | null;
    materializedAt: Date;
};

export type PreAggregateDef = {
    name: string;
    dimensions: string[];
    metrics: string[];
    // Parser validation enforces that timeDimension and granularity are provided together
    timeDimension?: string;
    granularity?: TimeFrames;
    refresh?: {
        cron?: string;
    };
};

export enum PreAggregateMissReason {
    NO_PRE_AGGREGATES_DEFINED = 'no_pre_aggregates_defined',
    DIMENSION_NOT_IN_PRE_AGGREGATE = 'dimension_not_in_pre_aggregate',
    METRIC_NOT_IN_PRE_AGGREGATE = 'metric_not_in_pre_aggregate',
    NON_ADDITIVE_METRIC = 'non_additive_metric',
    CUSTOM_SQL_METRIC = 'custom_sql_metric',
    FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE = 'filter_dimension_not_in_pre_aggregate',
    GRANULARITY_TOO_FINE = 'granularity_too_fine',
    CUSTOM_DIMENSION_PRESENT = 'custom_dimension_present',
    CUSTOM_METRIC_PRESENT = 'custom_metric_present',
    TABLE_CALCULATION_PRESENT = 'table_calculation_present',
}

export type PreAggregateMatchMiss =
    | {
          reason: PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED;
      }
    | {
          reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE;
          fieldId: FieldId;
      }
    | {
          reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE;
          fieldId: FieldId;
      }
    | {
          reason: PreAggregateMissReason.NON_ADDITIVE_METRIC;
          fieldId: FieldId;
      }
    | {
          reason: PreAggregateMissReason.CUSTOM_SQL_METRIC;
          fieldId: FieldId;
      }
    | {
          reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE;
          fieldId: FieldId;
      }
    | {
          reason: PreAggregateMissReason.GRANULARITY_TOO_FINE;
          fieldId: FieldId;
          queryGranularity: TimeFrames;
          preAggregateGranularity: TimeFrames;
          preAggregateTimeDimension: string;
      }
    | {
          reason: PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT;
      }
    | {
          reason: PreAggregateMissReason.CUSTOM_METRIC_PRESENT;
      }
    | {
          reason: PreAggregateMissReason.TABLE_CALCULATION_PRESENT;
      };

export type PreAggregateDefinition = {
    preAggregateDefinitionUuid: string;
    projectUuid: string;
    sourceCachedExploreUuid: string;
    preAggCachedExploreUuid: string;
    preAggregateDefinition: PreAggregateDef;
    materializationMetricQuery: MaterializationMetricQueryPayload | null;
    materializationQueryError: string | null;
    refreshCron: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PreAggregateDefinitionWithExploreName = PreAggregateDefinition & {
    preAggExploreName: string;
};

export type PreAggregateMaterialization = {
    materializationUuid: string;
    projectUuid: string;
    preAggregateDefinitionUuid: string;
    status: PreAggregateMaterializationStatus;
    trigger: PreAggregateMaterializationTrigger;
    queryUuid: string | null;
    materializedAt: Date | null;
    rowCount: number | null;
    columns: ResultColumns | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export const preAggregateMissReasonLabels: Record<
    PreAggregateMissReason,
    string
> = {
    [PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED]:
        'No pre-aggregates defined',
    [PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE]:
        'Dimension not in pre-aggregate',
    [PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE]:
        'Metric not in pre-aggregate',
    [PreAggregateMissReason.NON_ADDITIVE_METRIC]: 'Non-additive metric',
    [PreAggregateMissReason.CUSTOM_SQL_METRIC]: 'Custom SQL metric',
    [PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE]:
        'Filter dimension not in pre-aggregate',
    [PreAggregateMissReason.GRANULARITY_TOO_FINE]: 'Granularity too fine',
    [PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT]:
        'Custom dimension present',
    [PreAggregateMissReason.CUSTOM_METRIC_PRESENT]: 'Custom metric present',
    [PreAggregateMissReason.TABLE_CALCULATION_PRESENT]:
        'Table calculation present',
};

export type PreAggregateSchedulerDetails = {
    projectUuid: string;
    organizationUuid: string;
    createdByUserUuid: string | null;
    schedulerTimezone: string;
    preAggregateDefinitionUuid: string;
    preAggExploreName: string;
    refreshCron: string;
};
