import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { validateMemoryObjects } from './AiAgentMemoryService';

const explore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    spotlight: { visibility: 'show', categories: [] },
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: undefined,
            requiredFilters: [],
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.status',
                    tablesReferences: ['orders'],
                    description: undefined,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
};

describe('validateMemoryObjects', () => {
    it('validates explore then field exactly and collects unresolved refs', () => {
        const validExplore = { type: 'explore' as const, name: 'orders' };
        const validField = {
            type: 'field' as const,
            explore: 'orders',
            fieldId: 'orders_status',
        };
        const wrongExplore = {
            type: 'field' as const,
            explore: 'missing',
            fieldId: 'orders_status',
        };
        const wrongCase = {
            type: 'field' as const,
            explore: 'orders',
            fieldId: 'Orders_Status',
        };

        expect(
            validateMemoryObjects(
                [validExplore, validField, wrongExplore, wrongCase],
                { orders: explore },
            ),
        ).toEqual({
            resolved: [validExplore, validField],
            unresolved: [wrongExplore, wrongCase],
        });
    });
});
