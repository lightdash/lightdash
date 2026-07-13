import { DimensionType, type ProfiledTable } from '@lightdash/common';
import {
    inferProfile,
    limitProfileTables,
    MAX_PROFILE_TABLES,
} from './profileInference';

const table = (
    name: string,
    columns: ProfiledTable['columns'],
    rowCount: number | null = 10,
): ProfiledTable => ({
    database: 'analytics',
    schema: 'public',
    name,
    tableType: 'table',
    rowCount,
    columns,
});

const numberColumn = (name: string) => ({
    name,
    type: DimensionType.NUMBER,
});

const stringColumn = (name: string) => ({
    name,
    type: DimensionType.STRING,
});

const infer = (tables: ProfiledTable[]) =>
    inferProfile({
        tables,
        truncated: false,
        profiledAt: '2026-07-13T12:00:00.000Z',
    });

describe('profile inference', () => {
    it('infers entities, descriptions, primary keys, and normal relationships', () => {
        const result = infer([
            table(
                'customers',
                [numberColumn('customer_id'), stringColumn('name')],
                12800,
            ),
            table(
                'orders',
                [
                    numberColumn('order_id'),
                    numberColumn('customer_id'),
                    numberColumn('amount'),
                ],
                45000,
            ),
        ]);

        expect(result.entities).toEqual([
            expect.objectContaining({
                tableName: 'customers',
                label: 'Customers',
                description:
                    'Customers — 12,800 rows, identified by customer_id',
                primaryKey: 'customer_id',
                columnCount: 2,
            }),
            expect.objectContaining({
                tableName: 'orders',
                primaryKey: 'order_id',
            }),
        ]);
        expect(result.relationships).toEqual([
            {
                fromTable: 'orders',
                fromColumn: 'customer_id',
                toTable: 'customers',
                toColumn: 'customer_id',
                type: 'many_to_one',
                confidence: 'high',
            },
        ]);
    });

    it('handles an empty catalog', () => {
        expect(infer([])).toEqual({
            tables: [],
            entities: [],
            relationships: [],
            truncated: false,
            profiledAt: '2026-07-13T12:00:00.000Z',
        });
    });

    it('handles one table without inventing relationships', () => {
        const result = infer([table('events', [numberColumn('id')])]);
        expect(result.entities).toHaveLength(1);
        expect(result.relationships).toEqual([]);
    });

    it('handles tables with no numeric columns', () => {
        const result = infer([
            table('accounts', [
                stringColumn('account_id'),
                stringColumn('name'),
            ]),
            table('events', [stringColumn('id'), stringColumn('account_id')]),
        ]);
        expect(result.relationships[0]).toMatchObject({
            fromTable: 'events',
            toTable: 'accounts',
            confidence: 'high',
        });
    });

    it('handles an all-string table', () => {
        const result = infer([
            table(
                'settings',
                [stringColumn('id'), stringColumn('value')],
                null,
            ),
        ]);
        expect(result.entities[0]).toMatchObject({
            primaryKey: 'id',
            description: 'Settings — row count unavailable, identified by id',
        });
    });

    it('skips self-referencing foreign keys', () => {
        const result = infer([
            table('employees', [
                numberColumn('id'),
                numberColumn('parent_employee_id'),
            ]),
        ]);
        expect(result.relationships).toEqual([]);
    });

    it('keeps two foreign keys to the same target', () => {
        const result = infer([
            table('customers', [numberColumn('customer_id')]),
            table('orders', [
                numberColumn('order_id'),
                numberColumn('billing_customer_id'),
                numberColumn('shipping_customer_id'),
            ]),
        ]);
        expect(result.relationships).toEqual([
            expect.objectContaining({
                fromColumn: 'billing_customer_id',
                toTable: 'customers',
                confidence: 'low',
            }),
            expect.objectContaining({
                fromColumn: 'shipping_customer_id',
                toTable: 'customers',
                confidence: 'low',
            }),
        ]);
    });

    it('notes possible composite keys and does not use them as targets', () => {
        const result = infer([
            table('order_items', [
                numberColumn('order_id'),
                numberColumn('item_id'),
            ]),
            table('adjustments', [
                numberColumn('id'),
                numberColumn('order_item_id'),
            ]),
        ]);
        expect(result.entities[0]).toMatchObject({
            primaryKey: null,
            notes: [expect.stringContaining('possible composite key')],
        });
        expect(result.relationships).toEqual([]);
    });

    it('preserves unicode and reserved-word table and column names', () => {
        const result = infer([
            table('客户', [stringColumn('客户_id')]),
            table('order', [stringColumn('id'), stringColumn('客户_id')]),
        ]);
        expect(result.tables.map(({ name }) => name)).toEqual([
            '客户',
            'order',
        ]);
        expect(result.relationships[0]).toMatchObject({
            fromTable: 'order',
            fromColumn: '客户_id',
            toTable: '客户',
        });
    });

    it('uses low confidence for plural and singular fuzzy matches', () => {
        const result = infer([
            table('people', [numberColumn('id')]),
            table('events', [numberColumn('id'), numberColumn('people_id')]),
        ]);
        expect(result.relationships[0]).toMatchObject({
            toTable: 'people',
            confidence: 'low',
        });
    });

    it('rejects foreign keys with incompatible types', () => {
        const result = infer([
            table('customers', [numberColumn('customer_id')]),
            table('orders', [
                numberColumn('order_id'),
                stringColumn('customer_id'),
            ]),
        ]);
        expect(result.relationships).toEqual([]);
    });

    it('caps catalogs at 100 tables and reports truncation', () => {
        const input = Array.from(
            { length: MAX_PROFILE_TABLES + 1 },
            (_, index) => table(`table_${index}`, [numberColumn('id')]),
        );
        expect(limitProfileTables(input)).toEqual({
            tables: input.slice(0, MAX_PROFILE_TABLES),
            truncated: true,
        });
    });

    it('keeps views in the table list without inferring them as entities', () => {
        const result = infer([
            table('customers', [numberColumn('customer_id')]),
            {
                ...table('latest_customers', [numberColumn('customer_id')]),
                tableType: 'view',
                rowCount: null,
            },
        ]);

        expect(result.tables).toHaveLength(2);
        expect(result.entities).toEqual([
            expect.objectContaining({ tableName: 'customers' }),
        ]);
        expect(result.relationships).toEqual([]);
    });
});
