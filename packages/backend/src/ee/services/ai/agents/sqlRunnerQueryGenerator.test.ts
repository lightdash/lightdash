import { WarehouseTypes } from '@lightdash/common';
import {
    buildSqlRunnerQueryMessages,
    buildTableReferenceGuide,
} from './sqlRunnerQueryGenerator';

describe('buildTableReferenceGuide', () => {
    it('lists tables with known columns first', () => {
        expect(
            buildTableReferenceGuide([
                { schema: 'jaffle', table: 'customers', columns: null },
                {
                    schema: 'jaffle',
                    table: 'orders',
                    columns: [
                        { name: 'id', type: 'number' },
                        { name: 'status', type: 'string' },
                    ],
                },
            ]),
        ).toBe(
            '  jaffle.orders: id (number), status (string)\n  jaffle.customers',
        );
    });

    it('caps the number of tables', () => {
        const tables = Array.from({ length: 205 }, (_, i) => ({
            schema: 's',
            table: `t${i}`,
            columns: null,
        }));
        expect(buildTableReferenceGuide(tables)).toMatch(/…and 5 more tables$/);
    });
});

describe('buildSqlRunnerQueryMessages', () => {
    it('includes the current query only when revising', () => {
        const base = {
            prompt: 'revenue by month',
            tables: [],
            warehouseType: WarehouseTypes.POSTGRES,
        };
        const [, fresh] = buildSqlRunnerQueryMessages({
            ...base,
            currentSql: null,
        });
        const [, revise] = buildSqlRunnerQueryMessages({
            ...base,
            currentSql: 'SELECT 1',
        });
        expect(fresh.content).not.toContain('Current query to revise');
        expect(revise.content).toContain('Current query to revise:\nSELECT 1');
        expect(revise.content).toContain('Warehouse dialect: postgres');
    });
});
