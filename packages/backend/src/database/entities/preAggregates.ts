import {
    type MaterializationMetricQueryPayload,
    type PreAggregateDef,
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationTrigger,
    type ResultColumns,
} from '@lightdash/common';
import { Knex } from 'knex';

export const PreAggregateDefinitionsTableName = 'pre_aggregate_definitions';
export const PreAggregateMaterializationsTableName =
    'pre_aggregate_materializations';

export type DbPreAggregateDefinition = {
    pre_aggregate_definition_uuid: string;
    project_uuid: string;
    source_cached_explore_uuid: string;
    pre_agg_cached_explore_uuid: string;
    pre_aggregate_definition: PreAggregateDef;
    materialization_metric_query: MaterializationMetricQueryPayload | null;
    materialization_query_error: string | null;
    refresh_cron: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbPreAggregateDefinitionIn = Omit<
    DbPreAggregateDefinition,
    'pre_aggregate_definition_uuid' | 'created_at' | 'updated_at'
>;

export type DbPreAggregateDefinitionUpdate = Partial<
    Pick<
        DbPreAggregateDefinition,
        | 'source_cached_explore_uuid'
        | 'pre_agg_cached_explore_uuid'
        | 'pre_aggregate_definition'
        | 'materialization_metric_query'
        | 'materialization_query_error'
        | 'refresh_cron'
        | 'updated_at'
    >
>;

export type PreAggregateDefinitionsTable = Knex.CompositeTableType<
    DbPreAggregateDefinition,
    DbPreAggregateDefinitionIn,
    DbPreAggregateDefinitionUpdate
>;

export type DbPreAggregateMaterialization = {
    pre_aggregate_materialization_uuid: string;
    project_uuid: string;
    pre_aggregate_definition_uuid: string;
    status: PreAggregateMaterializationStatus;
    trigger: PreAggregateMaterializationTrigger;
    query_uuid: string | null;
    materialized_at: Date | null;
    row_count: number | null;
    columns: ResultColumns | null;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbPreAggregateMaterializationIn = Omit<
    DbPreAggregateMaterialization,
    'pre_aggregate_materialization_uuid' | 'created_at' | 'updated_at'
>;

export type DbPreAggregateMaterializationUpdate = Partial<
    Pick<
        DbPreAggregateMaterialization,
        | 'status'
        | 'query_uuid'
        | 'materialized_at'
        | 'row_count'
        | 'columns'
        | 'error_message'
        | 'updated_at'
    >
>;

export type PreAggregateMaterializationsTable = Knex.CompositeTableType<
    DbPreAggregateMaterialization,
    DbPreAggregateMaterializationIn,
    DbPreAggregateMaterializationUpdate
>;
