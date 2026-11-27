import { DimensionType, MetricType } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    type LiveExploreDefinition,
} from '../../sdk';
import { HUBSPOT_MAX_FILTERS, HUBSPOT_MAX_ROWS } from './api';
import { HUBSPOT_CHOICE_FILTERS, HUBSPOT_DATE_FILTERS } from './filters';

export const HUBSPOT_DEALS_EXPLORE: LiveExploreDefinition = {
    name: 'deals',
    label: 'Deals',
    description: 'Deals in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the built-in fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of deals that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Contacts in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the built-in fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of contacts that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_COMPANIES_EXPLORE: LiveExploreDefinition = {
    name: 'companies',
    label: 'Companies',
    description:
        'Companies in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the built-in fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of companies that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_TICKETS_EXPLORE: LiveExploreDefinition = {
    name: 'tickets',
    label: 'Tickets',
    description:
        'Tickets in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the built-in fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of tickets that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_LEADS_EXPLORE: LiveExploreDefinition = {
    name: 'leads',
    label: 'Leads',
    description: 'Leads in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the built-in fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of leads that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

/**
 * Every deal and ticket pipeline with its stages, one row per stage, from
 * HubSpot's pipelines API: one call per object. Records hold stage and
 * pipeline ids, so this explains them and can be merged with them.
 */
export const HUBSPOT_PIPELINE_STAGES_EXPLORE: LiveExploreDefinition = {
    name: 'pipeline_stages',
    label: 'Pipeline stages',
    description:
        'Deal and ticket pipelines in HubSpot and their stages, one row per stage, with the names HubSpot shows.',
    aiHint: 'Use to translate IDs: Stage ID matches Deal Stage (internal value) on deals and Ticket status (internal value) on tickets; Pipeline ID matches Pipeline (internal value). Filter Object to Deals or Tickets to read only one. No metrics; count rows if needed.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'object_type',
            apiName: 'objectType',
            label: 'Object',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: 'Object the pipeline belongs to: Deals or Tickets.',
        }),
        dimension({
            name: 'pipeline_id',
            apiName: 'pipelineId',
            label: 'Pipeline ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "Pipeline's internal ID, as records store it.",
            aiHint: 'Matches Pipeline (internal value) on deals and tickets.',
        }),
        dimension({
            name: 'pipeline_label',
            apiName: 'pipelineLabel',
            label: 'Pipeline',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Pipeline name as HubSpot shows it.',
        }),
        dimension({
            name: 'pipeline_display_order',
            apiName: 'pipelineDisplayOrder',
            label: 'Pipeline order',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Pipeline's position in HubSpot's list, starting at 0.",
        }),
        dimension({
            name: 'stage_id',
            apiName: 'stageId',
            label: 'Stage ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "Stage's internal ID, as records store it.",
            aiHint: 'Matches Deal Stage (internal value) on deals and Ticket status (internal value) on tickets.',
        }),
        dimension({
            name: 'stage_label',
            apiName: 'stageLabel',
            label: 'Stage',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Stage name as HubSpot shows it.',
        }),
        dimension({
            name: 'stage_display_order',
            apiName: 'stageDisplayOrder',
            label: 'Stage order',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: "Stage's position in its pipeline, starting at 0.",
        }),
        dimension({
            name: 'probability',
            label: 'Deal probability',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'For deal stages, the probability that a deal in this stage closes as won, from 0 to 1. Empty for ticket stages.',
        }),
        dimension({
            name: 'is_closed',
            apiName: 'isClosed',
            label: 'Is closed',
            type: DimensionType.BOOLEAN,
            filterOperators: [],
            description:
                'Whether records in this stage are closed: won or lost deals, or closed tickets.',
        }),
    ],
    metrics: [],
};

/** Deals first: an integration's first explore is its main one. */
export const HUBSPOT_EXPLORES = [
    HUBSPOT_DEALS_EXPLORE,
    HUBSPOT_CONTACTS_EXPLORE,
    HUBSPOT_COMPANIES_EXPLORE,
    HUBSPOT_TICKETS_EXPLORE,
    HUBSPOT_LEADS_EXPLORE,
    HUBSPOT_PIPELINE_STAGES_EXPLORE,
] as const;
