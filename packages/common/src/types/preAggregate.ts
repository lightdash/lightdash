import { type FieldId } from './field';
import { type TimeFrames } from './timeFrames';

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
