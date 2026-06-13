import { type DbtModelNode } from '../types/dbt';
import {
    type DbtSemanticLayerMetric,
    type DbtSemanticModel,
} from '../types/dbtSemanticLayer';

export const CLAIMS_MODEL: DbtModelNode & { relation_name: string } = {
    alias: 'mart_reporting_fact_claim',
    checksum: { name: '', checksum: '' },
    fqn: [],
    language: '',
    package_name: '',
    path: '',
    raw_code: '',
    compiled: true,
    unique_id: 'model.project.mart_reporting_fact_claim',
    description: 'Claim facts',
    resource_type: 'model',
    columns: {},
    meta: {},
    config: { materialized: 'table' },
    database: 'myDatabase',
    schema: 'mySchema',
    name: 'mart_reporting_fact_claim',
    tags: [],
    relation_name: 'relation_name',
    depends_on: { nodes: [] },
    patch_path: null,
    original_file_path: '',
};

export const CLAIMS_SEMANTIC_MODEL: DbtSemanticModel = {
    unique_id: 'semantic_model.project.mart_reporting_fact_claim',
    name: 'mart_reporting_fact_claim',
    label: 'Claims',
    description: 'Semantic model on claim facts',
    model: "ref('mart_reporting_fact_claim')",
    defaults: { agg_time_dimension: 'claim_created_at' },
    depends_on: { nodes: ['model.project.mart_reporting_fact_claim'] },
    entities: [
        {
            name: 'claim',
            type: 'primary',
            expr: 'fact_claim_id',
            label: 'Claim',
            description: 'Primary entity for claim-level metrics.',
            config: { meta: { group_label: 'Entities' } },
        },
    ],
    dimensions: [
        {
            name: 'clean_claim_category',
            type: 'categorical',
            expr: 'clean_claim_category',
            label: 'Clean Claim Category',
            description: 'Claim categorization.',
            config: { meta: { group_label: 'Claim Details' } },
        },
        {
            name: 'claim_created_at',
            type: 'time',
            expr: 'claim_created_at',
            label: 'Claim Created',
            type_params: { time_granularity: 'day' },
            config: { meta: { group_label: 'Claim Timestamps' } },
        },
        {
            name: 'claim_adjudication_date',
            type: 'time',
            expr: 'claim_adjudication_date',
            label: 'Claim Adjudication',
            type_params: { time_granularity: 'day' },
            config: { meta: { group_label: 'Claim Timestamps' } },
        },
    ],
    measures: [
        {
            name: 'count_distinct_fact_claim_id',
            label: 'Count of Distinct Claims',
            description: 'Distinct count of claims.',
            expr: 'fact_claim_id',
            agg: 'count_distinct',
            agg_time_dimension: 'claim_created_at',
            create_metric: true,
            config: { meta: { group_label: 'Claim Metrics' } },
        },
        {
            name: 'clean_claim_distinct_count',
            label: 'Clean Claim Count',
            expr: "case when clean_claim_category = 'clean' then fact_claim_id end",
            agg: 'count_distinct',
            agg_time_dimension: 'claim_adjudication_date',
            create_metric: true,
            config: { meta: { group_label: 'Clean Claim Metrics' } },
        },
        {
            name: 'dirty_claim_distinct_count',
            label: 'Dirty Claim Count',
            expr: "case when clean_claim_category = 'dirty' then fact_claim_id end",
            agg: 'count_distinct',
            agg_time_dimension: 'claim_adjudication_date',
            create_metric: true,
            config: { meta: { group_label: 'Clean Claim Metrics' } },
        },
        {
            name: 'clean_or_dirty_claim_distinct_count',
            label: 'Clean or Dirty Claim Count',
            expr: "case when clean_claim_category in ('clean', 'dirty') then fact_claim_id end",
            agg: 'count_distinct',
            agg_time_dimension: 'claim_adjudication_date',
            create_metric: true,
            config: {
                meta: { group_label: 'Clean Claim Metrics', hidden: true },
            },
        },
    ],
};

export const CLEAN_CLAIM_RATE_METRIC: DbtSemanticLayerMetric = {
    unique_id: 'metric.project.clean_claim_rate',
    name: 'clean_claim_rate',
    label: 'Clean Claim Rate',
    description: 'Percent of clean claims.',
    type: 'ratio',
    type_params: {
        numerator: { name: 'clean_claim_distinct_count' },
        denominator: { name: 'clean_or_dirty_claim_distinct_count' },
    },
    config: { meta: { group_label: 'Clean Claim Metrics' } },
};

export const SIMPLE_METRIC: DbtSemanticLayerMetric = {
    unique_id: 'metric.project.total_claims',
    name: 'total_claims',
    label: 'Total Claims',
    description: 'All claims ever.',
    type: 'simple',
    type_params: {
        measure: { name: 'count_distinct_fact_claim_id' },
    },
};
