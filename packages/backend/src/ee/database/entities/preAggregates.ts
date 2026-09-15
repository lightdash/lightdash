import {
    type MaterializationMetricQueryPayload,
    type PhysicalOutputContract,
    type PreAggregateDef,
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationTrigger,
    type PreAggregatePreparationStatus,
    type ResultColumns,
} from '@lightdash/common';
import { Knex } from 'knex';

export const PreAggregateDefinitionsTableName = 'pre_aggregate_definitions';
export const PreAggregateMaterializationsTableName =
    'pre_aggregate_materializations';
export const PreAggregateReuseStateTableName = 'pre_aggregate_reuse_state';

export type DbPreAggregateReuseState = {
    state_key: 'singleton';
    phase: 'compatibility' | 'active';
    reuse_enabled: boolean;
    reuse_updated_by: string | null;
    activated_by: string | null;
    updated_at: Date;
};

export type PreAggregateReuseStateTable = Knex.CompositeTableType<
    DbPreAggregateReuseState,
    Pick<DbPreAggregateReuseState, 'state_key' | 'phase'>,
    Partial<
        Pick<
            DbPreAggregateReuseState,
            | 'phase'
            | 'updated_at'
            | 'activated_by'
            | 'reuse_enabled'
            | 'reuse_updated_by'
        >
    >
>;

export type DbPreAggregateDefinition = {
    pre_aggregate_definition_uuid: string;
    project_uuid: string;
    source_cached_explore_uuid: string | null;
    pre_agg_cached_explore_uuid: string | null;
    source_explore_name: string | null;
    pre_aggregate_name: string | null;
    publication_version: string | null;
    compatibility_hash: string | null;
    schedule_revision: string | null;
    scheduler_timezone: string | null;
    physical_output_contract: PhysicalOutputContract | null;
    preparation_status: PreAggregatePreparationStatus;
    automatic_eligible: boolean;
    pre_aggregate_definition: PreAggregateDef;
    materialization_metric_query: MaterializationMetricQueryPayload | null;
    materialization_query_error: string | null;
    refresh_cron: string | null;
    created_at: Date;
    updated_at: Date;
};

type DbPreAggregateDefinitionLegacyIn = Omit<
    DbPreAggregateDefinition,
    | 'pre_aggregate_definition_uuid'
    | 'created_at'
    | 'updated_at'
    | 'source_explore_name'
    | 'pre_aggregate_name'
    | 'publication_version'
    | 'compatibility_hash'
    | 'schedule_revision'
    | 'scheduler_timezone'
    | 'physical_output_contract'
    | 'preparation_status'
    | 'automatic_eligible'
>;

export type DbPreAggregateDefinitionIn = DbPreAggregateDefinitionLegacyIn &
    Partial<
        Pick<
            DbPreAggregateDefinition,
            | 'source_explore_name'
            | 'pre_aggregate_name'
            | 'publication_version'
            | 'compatibility_hash'
            | 'schedule_revision'
            | 'scheduler_timezone'
            | 'physical_output_contract'
            | 'preparation_status'
            | 'automatic_eligible'
        >
    >;

export type DbPreAggregateDefinitionUpdate = Knex.DbRecord<
    Pick<
        DbPreAggregateDefinition,
        | 'source_cached_explore_uuid'
        | 'pre_agg_cached_explore_uuid'
        | 'source_explore_name'
        | 'pre_aggregate_name'
        | 'publication_version'
        | 'compatibility_hash'
        | 'schedule_revision'
        | 'scheduler_timezone'
        | 'physical_output_contract'
        | 'preparation_status'
        | 'automatic_eligible'
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
    materialization_uri: string | null;
    materialized_at: Date | null;
    row_count: number | null;
    columns: ResultColumns | null;
    error_message: string | null;
    total_bytes: number | null;
    publication_version: string | null;
    schedule_revision: string | null;
    compatibility_hash: string | null;
    pinned_context_hash: string | null;
    execution_scope_key_id: string | null;
    physical_output_contract: PhysicalOutputContract | null;
    evaluated_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type DbPreAggregateMaterializationIn = Omit<
    DbPreAggregateMaterialization,
    | 'pre_aggregate_materialization_uuid'
    | 'created_at'
    | 'updated_at'
    | 'publication_version'
    | 'schedule_revision'
    | 'compatibility_hash'
    | 'pinned_context_hash'
    | 'execution_scope_key_id'
    | 'physical_output_contract'
    | 'evaluated_at'
> &
    Partial<
        Pick<
            DbPreAggregateMaterialization,
            | 'publication_version'
            | 'schedule_revision'
            | 'compatibility_hash'
            | 'pinned_context_hash'
            | 'execution_scope_key_id'
            | 'physical_output_contract'
            | 'evaluated_at'
        >
    >;

export type DbPreAggregateMaterializationUpdate = Partial<
    Pick<
        DbPreAggregateMaterialization,
        | 'status'
        | 'query_uuid'
        | 'materialization_uri'
        | 'materialized_at'
        | 'row_count'
        | 'columns'
        | 'error_message'
        | 'total_bytes'
        | 'updated_at'
    >
>;

export type PreAggregateMaterializationsTable = Knex.CompositeTableType<
    DbPreAggregateMaterialization,
    DbPreAggregateMaterializationIn,
    DbPreAggregateMaterializationUpdate
>;
