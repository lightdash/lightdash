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
import {
    getDefaultDateRangeNote,
    getLiveSourceFilterGroups,
    getLiveSourceOperatorOptions,
    isFilterableOnLiveSource,
} from './apiSourceExplore';

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

describe('live source filter rules', () => {
    const { dimensions, metrics } = explore.tables[TABLE];
    const date = { ...dimensions.date, fieldType: FieldType.DIMENSION };
    const sessions = metrics.sessions;
    const options = [
        { value: FilterOperator.EQUALS, label: 'is' },
        { value: FilterOperator.IN_BETWEEN, label: 'is between' },
    ];

    it('keeps only the operators the source runs on the field', () => {
        expect(
            getLiveSourceOperatorOptions(options, apiSource, date as never),
        ).toEqual([{ value: FilterOperator.IN_BETWEEN, label: 'is between' }]);
    });

    it('keeps every operator outside live data sources', () => {
        expect(getLiveSourceOperatorOptions(options, null, date as never)).toBe(
            options,
        );
    });

    it('hides fields the source cannot filter', () => {
        expect(isFilterableOnLiveSource(apiSource, sessions as never)).toBe(
            false,
        );
        expect(isFilterableOnLiveSource(apiSource, date as never)).toBe(true);
        expect(isFilterableOnLiveSource(null, sessions as never)).toBe(true);
    });

    it('reads the group shapes the source runs', () => {
        expect(getLiveSourceFilterGroups(apiSource)).toEqual({
            or: true,
            nestedGroups: false,
        });
        expect(getLiveSourceFilterGroups(null)).toEqual({
            or: true,
            nestedGroups: true,
        });
    });
});
