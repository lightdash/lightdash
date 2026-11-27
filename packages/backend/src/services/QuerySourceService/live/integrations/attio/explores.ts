import { DimensionType } from '@lightdash/common';
import { dimension } from '../../explores/declare';
import type { LiveExploreDefinition } from '../../explores/definition';
import { ATTIO_MAX_RECORDS } from './api';
import { ATTIO_CHOICE_FILTERS, ATTIO_DATE_FILTERS } from './filters';

export const ATTIO_COMPANIES_EXPLORE: LiveExploreDefinition = {
    name: 'companies',
    label: 'Companies',
    description:
        'Company records in Attio, one row per company, with their attributes.',
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_PEOPLE_EXPLORE: LiveExploreDefinition = {
    name: 'people',
    label: 'People',
    description:
        'People records in Attio, one row per person, with their attributes.',
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_DEALS_EXPLORE: LiveExploreDefinition = {
    name: 'deals',
    label: 'Deals',
    description:
        'Deal records in Attio, one row per deal, with their attributes.',
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_USERS_EXPLORE: LiveExploreDefinition = {
    name: 'users',
    label: 'Users',
    description:
        "User records in Attio (users of your product, from Attio's Users object), one row per user, with their attributes.",
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_WORKSPACES_EXPLORE: LiveExploreDefinition = {
    name: 'workspaces',
    label: 'Workspaces',
    description:
        "Workspace records in Attio (your product's customer workspaces, from Attio's Workspaces object), one row per workspace, with their attributes.",
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

/** Companies first: an integration's first explore is its main one. */
export const ATTIO_EXPLORES = [
    ATTIO_COMPANIES_EXPLORE,
    ATTIO_PEOPLE_EXPLORE,
    ATTIO_DEALS_EXPLORE,
    ATTIO_USERS_EXPLORE,
    ATTIO_WORKSPACES_EXPLORE,
] as const;
