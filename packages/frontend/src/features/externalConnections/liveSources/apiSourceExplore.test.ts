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
import { describe, expect, it } from 'vitest';
import { getDefaultDateRangeNote } from './apiSourceExplore';

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
