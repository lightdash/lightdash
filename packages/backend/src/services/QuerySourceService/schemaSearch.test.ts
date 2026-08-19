import {
    DimensionType,
    type QuerySourceSchemaColumn,
    type QuerySourceSchemaTable,
} from '@lightdash/common';
import { applySchemaScanFilter } from './schemaSearch';

const column = (
    reference: string,
    extra: Partial<QuerySourceSchemaColumn> = {},
): QuerySourceSchemaColumn => ({
    reference,
    type: DimensionType.STRING,
    label: null,
    description: null,
    ...extra,
});

const table = (
    reference: string,
    columns: QuerySourceSchemaColumn[] | null,
    extra: Partial<QuerySourceSchemaTable> = {},
): QuerySourceSchemaTable => ({
    reference,
    label: null,
    description: null,
    columns,
    ...extra,
});

const orders = table('orders', [
    column('orders_order_id'),
    column('orders_status'),
    column('orders_total_revenue', { description: 'Total revenue from sales' }),
]);
const customers = table('customers', [
    column('customers_customer_id'),
    column('customers_country', { label: 'Country' }),
]);
const events = table('events', [column('events_event_id')]);

describe('applySchemaScanFilter', () => {
    describe('overview mode', () => {
        it('lists tables without columns and says how to go deeper', () => {
            const result = applySchemaScanFilter([orders, customers], {});
            expect(result.totalTables).toBe(2);
            expect(result.tables.map((t) => t.reference)).toEqual([
                'orders',
                'customers',
            ]);
            expect(result.tables.every((t) => t.columns === null)).toBe(true);
            expect(result.note).toContain('Overview scan');
        });

        it('returns no note for an empty source', () => {
            const result = applySchemaScanFilter([], {});
            expect(result).toEqual({ tables: [], totalTables: 0, note: null });
        });
    });

    describe('pattern search', () => {
        it('returns matching tables with only their matching columns', () => {
            const result = applySchemaScanFilter([orders, customers, events], {
                patterns: ['status'],
            });
            expect(result.tables).toHaveLength(1);
            expect(result.tables[0].reference).toBe('orders');
            expect(result.tables[0].columns?.map((c) => c.reference)).toEqual([
                'orders_status',
            ]);
            expect(result.totalTables).toBe(3);
        });

        it('matches column labels and descriptions', () => {
            const byLabel = applySchemaScanFilter([orders, customers], {
                patterns: ['country'],
            });
            expect(byLabel.tables[0].columns?.map((c) => c.reference)).toEqual([
                'customers_country',
            ]);

            const byDescription = applySchemaScanFilter([orders, customers], {
                patterns: ['sales'],
            });
            expect(
                byDescription.tables[0].columns?.map((c) => c.reference),
            ).toEqual(['orders_total_revenue']);
        });

        it('supports | for synonyms and spaces to require all terms', () => {
            const orSearch = applySchemaScanFilter([orders, customers], {
                patterns: ['revenue|country'],
            });
            expect(orSearch.tables.map((t) => t.reference).sort()).toEqual([
                'customers',
                'orders',
            ]);

            const andSearch = applySchemaScanFilter([orders, customers], {
                patterns: ['total revenue'],
            });
            expect(andSearch.tables).toHaveLength(1);
            expect(
                andSearch.tables[0].columns?.map((c) => c.reference),
            ).toEqual(['orders_total_revenue']);
        });

        it('returns a table-only match as a pointer without columns', () => {
            const analytics = table('events', [column('events_event_id')], {
                description: 'Web analytics activity',
            });
            const result = applySchemaScanFilter([orders, analytics], {
                patterns: ['analytics'],
            });
            expect(result.tables).toHaveLength(1);
            expect(result.tables[0].reference).toBe('events');
            expect(result.tables[0].columns).toBeNull();
            expect(result.note).toContain('matched by name only');
        });

        it('caps matching columns per table and reports the cut', () => {
            const wide = table(
                'wide',
                Array.from({ length: 45 }, (_, i) => column(`wide_field_${i}`)),
            );
            const result = applySchemaScanFilter([wide], {
                patterns: ['field'],
            });
            expect(result.tables[0].columns).toHaveLength(40);
            expect(result.note).toContain('5 matching columns');
        });

        it('caps matching tables, listing column matches before name-only matches', () => {
            const manyTables = Array.from({ length: 30 }, (_, i) =>
                table(`match_${i}`, []),
            );
            const withColumnMatch = table('other', [column('match_me')]);
            const result = applySchemaScanFilter(
                [...manyTables, withColumnMatch],
                { patterns: ['match'] },
            );
            expect(result.tables).toHaveLength(25);
            expect(result.tables[0].reference).toBe('other');
            expect(result.note).toContain('Showing 25 of 31 matching tables');
        });
    });

    describe('detail mode', () => {
        it('returns full columns for the named tables only', () => {
            const result = applySchemaScanFilter([orders, customers], {
                tables: ['orders'],
            });
            expect(result.tables).toHaveLength(1);
            expect(result.tables[0].columns).toHaveLength(3);
            expect(result.note).toBeNull();
        });

        it('reports unknown table references', () => {
            const result = applySchemaScanFilter([orders], {
                tables: ['orders', 'nope'],
            });
            expect(result.tables.map((t) => t.reference)).toEqual(['orders']);
            expect(result.note).toContain('Unknown tables');
            expect(result.note).toContain('nope');
        });

        it('caps very wide tables and reports the cut', () => {
            const wide = table(
                'wide',
                Array.from({ length: 210 }, (_, i) => column(`c_${i}`)),
            );
            const result = applySchemaScanFilter([wide], { tables: ['wide'] });
            expect(result.tables[0].columns).toHaveLength(200);
            expect(result.note).toContain('10 columns over');
        });

        it('searches within the named tables when combined with patterns', () => {
            const result = applySchemaScanFilter([orders, customers], {
                tables: ['orders'],
                patterns: ['customer|status'],
            });
            expect(result.tables).toHaveLength(1);
            expect(result.tables[0].reference).toBe('orders');
            expect(result.tables[0].columns?.map((c) => c.reference)).toEqual([
                'orders_status',
            ]);
        });
    });
});
