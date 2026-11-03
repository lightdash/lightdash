import {
    ApiConnectorType,
    DimensionType,
    ExploreType,
    FieldType,
    FilterOperator,
    MetricType,
    type ApiExploreResults,
    type ApiSourceExplore,
} from '@lightdash/common';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { getDefaultDateRangeNote } from '../../../features/externalConnections/liveSources/apiSourceExplore';
import {
    getSemanticLayerFields,
    toSemanticLayerYaml,
} from './semanticLayerView';

const TABLE = 'ga4_abc_report';

const field = {
    table: TABLE,
    tableLabel: 'Google Analytics',
    sql: '',
    compiledSql: '',
    tablesReferences: [TABLE],
    hidden: false,
};

const apiSource: ApiSourceExplore = {
    connectionUuid: 'conn-1',
    integration: ApiConnectorType.GA4,
    baseVersion: 1,
    filterGroups: { or: true, nested: false },
    maxDimensions: 9,
    maxMetrics: 10,
    dateRange: { fieldId: `${TABLE}_date`, defaultDays: 28 },
    fields: {
        [`${TABLE}_date`]: {
            apiName: 'date',
            filterOperators: [FilterOperator.IN_BETWEEN],
        },
        [`${TABLE}_sessions`]: {
            apiName: 'sessions',
            filterOperators: [],
        },
    },
    incompatible: [],
};

const explore = {
    name: TABLE,
    label: 'Google Analytics',
    type: ExploreType.API_SOURCE,
    baseTable: TABLE,
    tags: [],
    joinedTables: [],
    targetDatabase: 'postgres',
    tables: {
        [TABLE]: {
            name: TABLE,
            label: 'Google Analytics',
            description: 'One property.',
            dimensions: {
                date: {
                    ...field,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'date',
                    label: 'Date',
                },
                internal: {
                    ...field,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'internal',
                    label: 'Internal',
                    hidden: true,
                },
            },
            metrics: {
                sessions: {
                    ...field,
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'sessions',
                    label: 'Sessions',
                    description: 'Sessions started.',
                },
            },
        },
    },
    apiSource,
} as unknown as ApiExploreResults;

describe('getSemanticLayerFields', () => {
    it('lists visible dimensions then metrics with their integration names and filters', () => {
        expect(getSemanticLayerFields(explore)).toEqual([
            {
                name: 'date',
                label: 'Date',
                kind: 'dimension',
                type: DimensionType.DATE,
                apiName: 'date',
                filterOperators: [FilterOperator.IN_BETWEEN],
                description: null,
            },
            {
                name: 'sessions',
                label: 'Sessions',
                kind: 'metric',
                type: MetricType.SUM,
                apiName: 'sessions',
                filterOperators: [],
                description: 'Sessions started.',
            },
        ]);
    });
});

describe('toSemanticLayerYaml', () => {
    it('writes the rules and fields the query compiler enforces', () => {
        expect(load(toSemanticLayerYaml([explore]))).toEqual([
            {
                explore: TABLE,
                label: 'Google Analytics',
                description: 'One property.',
                base_version: 1,
                rules: {
                    or_filters: true,
                    nested_filters: false,
                    max_dimensions: 9,
                    max_metrics: 10,
                    default_date_range: { field: `${TABLE}_date`, days: 28 },
                },
                dimensions: [
                    {
                        name: 'date',
                        label: 'Date',
                        type: 'date',
                        api_name: 'date',
                        filters: ['inBetween'],
                    },
                ],
                metrics: [
                    {
                        name: 'sessions',
                        label: 'Sessions',
                        type: 'sum',
                        api_name: 'sessions',
                        description: 'Sessions started.',
                        filters: [],
                    },
                ],
            },
        ]);
    });
});

describe('getDefaultDateRangeNote', () => {
    it('names the date field and the default window', () => {
        expect(getDefaultDateRangeNote(explore)).toBe(
            'Without a filter on Date, queries read the last 28 days.',
        );
    });

    it('is empty when the integration needs no date range', () => {
        expect(
            getDefaultDateRangeNote({
                ...explore,
                apiSource: { ...apiSource, dateRange: null },
            }),
        ).toBeNull();
    });
});
