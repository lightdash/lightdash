import { SupportedDbtAdapter } from '../types/dbt';
import { type Explore } from '../types/explore';
import {
    DimensionType,
    FieldType,
    type CompiledDimension,
} from '../types/field';
import { filterExploresForAi, isAiContentVisible } from './aiSchemaAccess';

const field: CompiledDimension = {
    name: 'value',
    label: 'Value',
    table: 'details',
    tableLabel: 'Details',
    sql: '${TABLE}.value',
    compiledSql: 'details.value',
    tablesReferences: ['details'],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    hidden: false,
};

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
    joinedTables: [{ table: 'details', sqlOn: '', compiledSqlOn: '' }],
    tables: Object.fromEntries(
        ['orders', 'details'].map((name) => [
            name,
            {
                name,
                label: name,
                database: 'DB',
                schema: name === 'orders' ? 'PUBLIC' : 'PRIVATE',
                sqlTable: name,
                dimensions: { value: { ...field, table: name } },
                metrics: {},
                lineageGraph: {},
            },
        ]),
    ),
};

describe('filterExploresForAi', () => {
    test('keeps ordinary access unchanged', () => {
        const explores = [explore];
        expect(filterExploresForAi(explores, { type: 'unrestricted' })).toBe(
            explores,
        );
    });
    test('fails closed with no schemas', () => {
        expect(
            filterExploresForAi([explore], { type: 'schemas', schemas: [] }),
        ).toEqual([]);
    });
    test('removes an unreadable base table', () => {
        expect(
            filterExploresForAi([explore], {
                type: 'schemas',
                schemas: ['DB.PRIVATE'],
            }),
        ).toEqual([]);
    });
    test('removes readable joins that depend on a hidden join', () => {
        const chained: Explore = {
            ...explore,
            tables: {
                ...explore.tables,
                chained: { ...explore.tables.orders, name: 'chained' },
            },
            joinedTables: [
                ...explore.joinedTables,
                {
                    table: 'chained',
                    sqlOn: '',
                    compiledSqlOn: '',
                    tablesReferences: ['details'],
                },
            ],
        };
        const [result] = filterExploresForAi([chained], {
            type: 'schemas',
            schemas: ['DB.PUBLIC'],
        });
        expect(result.tables.chained).toBeUndefined();
        expect(result.tables.orders.dimensions).toEqual({});
    });

    test.each([
        { database: 'DB', excludePatterns: ['PRIV*'] },
        { database: 'db', excludePatterns: ['priv*', 'OTHER_*'] },
    ])('removes joined tables with rule %j', (rule) => {
        const [result] = filterExploresForAi([explore], { type: 'rule', rule });
        expect(Object.keys(result.tables)).toEqual(['orders']);
        expect(result.joinedTables).toEqual([]);
        expect(result.unfilteredTables).toEqual(result.tables);
        expect(explore.tables.details).toBeDefined();
    });
});

describe('isAiContentVisible', () => {
    test('keeps saved content only when all referenced explores are visible', () => {
        expect(
            isAiContentVisible({ metricQuery: { exploreName: 'orders' } }, [
                explore,
            ]),
        ).toBe(true);
        expect(
            isAiContentVisible(
                {
                    tiles: [
                        { chart: { queryConfig: { exploreName: 'orders' } } },
                        { chart: { queryConfig: { exploreName: 'private' } } },
                    ],
                },
                [explore],
            ),
        ).toBe(false);
        expect(isAiContentVisible({ sql: 'select 1' }, [explore])).toBe(false);
    });
});
