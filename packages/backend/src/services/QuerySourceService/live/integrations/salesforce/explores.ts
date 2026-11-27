import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    type LiveExploreDefinition,
} from '../../sdk';
import {
    SALESFORCE_MAX_AGGREGATE_ROWS,
    SALESFORCE_MAX_RECORD_ROWS,
} from './api';
import { SALESFORCE_DATE_FILTERS, SALESFORCE_METRIC_FILTERS } from './filters';

export const SALESFORCE_OPPORTUNITIES_EXPLORE: LiveExploreDefinition = {
    name: 'opportunities',
    label: 'Opportunities',
    description:
        'Opportunities in Salesforce, one row per opportunity, with their fields.',
    aiHint: `Read live with SOQL. With a metric, Salesforce groups and totals the records itself and returns at most ${SALESFORCE_MAX_AGGREGATE_ROWS.toLocaleString('en-US')} rows in one call. Without a metric it lists records, at most ${SALESFORCE_MAX_RECORD_ROWS.toLocaleString('en-US')} per query. Date and time fields group by day, month, quarter or year (UTC); filter the base date field, not its grains. Long text, multi-select picklists and decimal fields are not offered as dimensions. Lookup fields have a companion "<name> name" field read through the lookup. Picklist values are listed in the field's description.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'Id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
            description: "Salesforce's 18-character ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'CreatedDate',
            label: 'Created',
            type: DimensionType.TIMESTAMP,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
            aiHint: 'Listed as is; with a metric it groups by day, month, quarter or year.',
        }),
        dimension({
            name: 'created_at_day',
            apiName: 'DAY_ONLY(CreatedDate)',
            label: 'Created day',
            type: DimensionType.DATE,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_month',
            apiName: 'CALENDAR_MONTH(CreatedDate)',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'created_at_quarter',
            apiName: 'CALENDAR_QUARTER(CreatedDate)',
            label: 'Created quarter',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Quarter the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.QUARTER },
        }),
        dimension({
            name: 'created_at_year',
            apiName: 'CALENDAR_YEAR(CreatedDate)',
            label: 'Created year',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Year the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.YEAR },
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'COUNT(Id)',
            label: 'Count',
            type: MetricType.COUNT,
            filterOperators: SALESFORCE_METRIC_FILTERS,
            description: 'Number of records that match.',
            aiHint: 'Counted by Salesforce in one call, whatever the number of records.',
            aggregation: ADDITIVE,
        }),
    ],
};

export const SALESFORCE_ACCOUNTS_EXPLORE: LiveExploreDefinition = {
    name: 'accounts',
    label: 'Accounts',
    description:
        'Accounts in Salesforce, one row per account, with their fields.',
    aiHint: `Read live with SOQL. With a metric, Salesforce groups and totals the records itself and returns at most ${SALESFORCE_MAX_AGGREGATE_ROWS.toLocaleString('en-US')} rows in one call. Without a metric it lists records, at most ${SALESFORCE_MAX_RECORD_ROWS.toLocaleString('en-US')} per query. Date and time fields group by day, month, quarter or year (UTC); filter the base date field, not its grains. Long text, multi-select picklists and decimal fields are not offered as dimensions. Lookup fields have a companion "<name> name" field read through the lookup. Picklist values are listed in the field's description.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'Id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
            description: "Salesforce's 18-character ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'CreatedDate',
            label: 'Created',
            type: DimensionType.TIMESTAMP,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
            aiHint: 'Listed as is; with a metric it groups by day, month, quarter or year.',
        }),
        dimension({
            name: 'created_at_day',
            apiName: 'DAY_ONLY(CreatedDate)',
            label: 'Created day',
            type: DimensionType.DATE,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_month',
            apiName: 'CALENDAR_MONTH(CreatedDate)',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'created_at_quarter',
            apiName: 'CALENDAR_QUARTER(CreatedDate)',
            label: 'Created quarter',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Quarter the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.QUARTER },
        }),
        dimension({
            name: 'created_at_year',
            apiName: 'CALENDAR_YEAR(CreatedDate)',
            label: 'Created year',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Year the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.YEAR },
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'COUNT(Id)',
            label: 'Count',
            type: MetricType.COUNT,
            filterOperators: SALESFORCE_METRIC_FILTERS,
            description: 'Number of records that match.',
            aiHint: 'Counted by Salesforce in one call, whatever the number of records.',
            aggregation: ADDITIVE,
        }),
    ],
};

export const SALESFORCE_LEADS_EXPLORE: LiveExploreDefinition = {
    name: 'leads',
    label: 'Leads',
    description: 'Leads in Salesforce, one row per lead, with their fields.',
    aiHint: `Read live with SOQL. With a metric, Salesforce groups and totals the records itself and returns at most ${SALESFORCE_MAX_AGGREGATE_ROWS.toLocaleString('en-US')} rows in one call. Without a metric it lists records, at most ${SALESFORCE_MAX_RECORD_ROWS.toLocaleString('en-US')} per query. Date and time fields group by day, month, quarter or year (UTC); filter the base date field, not its grains. Long text, multi-select picklists and decimal fields are not offered as dimensions. Lookup fields have a companion "<name> name" field read through the lookup. Picklist values are listed in the field's description.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'Id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
            description: "Salesforce's 18-character ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'CreatedDate',
            label: 'Created',
            type: DimensionType.TIMESTAMP,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
            aiHint: 'Listed as is; with a metric it groups by day, month, quarter or year.',
        }),
        dimension({
            name: 'created_at_day',
            apiName: 'DAY_ONLY(CreatedDate)',
            label: 'Created day',
            type: DimensionType.DATE,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_month',
            apiName: 'CALENDAR_MONTH(CreatedDate)',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'created_at_quarter',
            apiName: 'CALENDAR_QUARTER(CreatedDate)',
            label: 'Created quarter',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Quarter the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.QUARTER },
        }),
        dimension({
            name: 'created_at_year',
            apiName: 'CALENDAR_YEAR(CreatedDate)',
            label: 'Created year',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Year the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.YEAR },
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'COUNT(Id)',
            label: 'Count',
            type: MetricType.COUNT,
            filterOperators: SALESFORCE_METRIC_FILTERS,
            description: 'Number of records that match.',
            aiHint: 'Counted by Salesforce in one call, whatever the number of records.',
            aggregation: ADDITIVE,
        }),
    ],
};

export const SALESFORCE_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Contacts in Salesforce, one row per contact, with their fields.',
    aiHint: `Read live with SOQL. With a metric, Salesforce groups and totals the records itself and returns at most ${SALESFORCE_MAX_AGGREGATE_ROWS.toLocaleString('en-US')} rows in one call. Without a metric it lists records, at most ${SALESFORCE_MAX_RECORD_ROWS.toLocaleString('en-US')} per query. Date and time fields group by day, month, quarter or year (UTC); filter the base date field, not its grains. Long text, multi-select picklists and decimal fields are not offered as dimensions. Lookup fields have a companion "<name> name" field read through the lookup. Picklist values are listed in the field's description.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'Id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
            description: "Salesforce's 18-character ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'CreatedDate',
            label: 'Created',
            type: DimensionType.TIMESTAMP,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
            aiHint: 'Listed as is; with a metric it groups by day, month, quarter or year.',
        }),
        dimension({
            name: 'created_at_day',
            apiName: 'DAY_ONLY(CreatedDate)',
            label: 'Created day',
            type: DimensionType.DATE,
            filterOperators: SALESFORCE_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_month',
            apiName: 'CALENDAR_MONTH(CreatedDate)',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'created_at_quarter',
            apiName: 'CALENDAR_QUARTER(CreatedDate)',
            label: 'Created quarter',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Quarter the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.QUARTER },
        }),
        dimension({
            name: 'created_at_year',
            apiName: 'CALENDAR_YEAR(CreatedDate)',
            label: 'Created year',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Year the record was created, shown as its first day, in UTC.',
            aiHint: 'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.',
            timeInterval: { base: 'created_at', grain: TimeFrames.YEAR },
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'COUNT(Id)',
            label: 'Count',
            type: MetricType.COUNT,
            filterOperators: SALESFORCE_METRIC_FILTERS,
            description: 'Number of records that match.',
            aiHint: 'Counted by Salesforce in one call, whatever the number of records.',
            aggregation: ADDITIVE,
        }),
    ],
};

/** Opportunities first: an integration's first explore is its main one. */
export const SALESFORCE_EXPLORES = [
    SALESFORCE_OPPORTUNITIES_EXPLORE,
    SALESFORCE_ACCOUNTS_EXPLORE,
    SALESFORCE_LEADS_EXPLORE,
    SALESFORCE_CONTACTS_EXPLORE,
] as const;
