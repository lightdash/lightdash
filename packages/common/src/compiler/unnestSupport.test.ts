import { SupportedDbtAdapter } from '../types/dbt';
import { InlineErrorType, type Explore } from '../types/explore';
import { DimensionType, FieldType } from '../types/field';
import {
    addOldCliUnnestWarnings,
    isVersionBefore,
    UNNEST_REPEATED_COLUMNS_MIN_CLI_VERSION,
} from './unnestSupport';

const dimension = (name: string, sql: string) => ({
    index: 0,
    fieldType: FieldType.DIMENSION as const,
    type: DimensionType.STRING,
    name,
    label: name,
    sql,
    compiledSql: sql,
    table: 'sessions',
    tableLabel: 'Sessions',
    hidden: false,
    tablesReferences: ['sessions'],
});

const explore: Explore = {
    name: 'sessions',
    label: 'Sessions',
    tags: [],
    baseTable: 'sessions',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.BIGQUERY,
    tables: {
        sessions: {
            name: 'sessions',
            label: 'Sessions',
            database: 'db',
            schema: 'ds',
            sqlTable: '`db`.`ds`.`sessions`',
            dimensions: {
                id: dimension('id', '${TABLE}.id'),
                'totals.pageviews': dimension(
                    'totals.pageviews',
                    '${TABLE}.totals.pageviews',
                ),
                'hits.page.pagePath': dimension(
                    'hits.page.pagePath',
                    '${TABLE}.hits.page.pagePath',
                ),
                city: dimension('city', '${TABLE}.geo.city'),
            },
            metrics: {},
            lineageGraph: {},
        },
    },
};

describe('isVersionBefore', () => {
    it('compares release versions numerically', () => {
        expect(isVersionBefore('2.152.9', '2.153.0')).toBe(true);
        expect(isVersionBefore('2.153.0', '2.153.0')).toBe(false);
        expect(isVersionBefore('2.170.1', '2.153.0')).toBe(false);
        expect(isVersionBefore('v2.9.0', '2.153.0')).toBe(true);
    });
    it('treats an unparseable version as current', () => {
        expect(
            isVersionBefore('dev', UNNEST_REPEATED_COLUMNS_MIN_CLI_VERSION),
        ).toBe(false);
    });
});

describe('addOldCliUnnestWarnings', () => {
    it('flags dotted leaves compiled as plain dimensions, ignoring custom sql', () => {
        const [result] = addOldCliUnnestWarnings([explore], '2.150.0');
        expect('warnings' in result && result.warnings).toEqual([
            expect.objectContaining({
                type: InlineErrorType.REPEATED_COLUMN_NOT_UNNESTED,
                message: expect.stringContaining(
                    'nested fields (totals.pageviews, hits.page.pagePath) but was deployed with Lightdash CLI 2.150.0',
                ),
            }),
        ]);
    });
    it('leaves explores without dotted leaves untouched', () => {
        const plain: Explore = {
            ...explore,
            tables: {
                sessions: {
                    ...explore.tables.sessions,
                    dimensions: { id: dimension('id', '${TABLE}.id') },
                },
            },
        };
        expect(addOldCliUnnestWarnings([plain], '2.150.0')).toEqual([plain]);
    });
});
