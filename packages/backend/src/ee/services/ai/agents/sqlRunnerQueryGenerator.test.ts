import { WarehouseTypes } from '@lightdash/common';
import {
    buildSqlRunnerQueryMessages,
    stripMarkdownFences,
} from './sqlRunnerQueryGenerator';

const base = {
    prompt: 'revenue by month',
    currentSql: null,
    knownTables: [],
    warehouseType: WarehouseTypes.POSTGRES,
};

describe('buildSqlRunnerQueryMessages', () => {
    it('includes the current query only when revising', () => {
        const [, fresh] = buildSqlRunnerQueryMessages(base);
        const [, revise] = buildSqlRunnerQueryMessages({
            ...base,
            currentSql: 'SELECT 1',
        });
        expect(fresh.content).not.toContain('Current query to revise');
        expect(revise.content).toContain('Current query to revise:\nSELECT 1');
        expect(revise.content).toContain('Warehouse dialect: postgres');
    });

    it('lists tables the editor already knows with their columns', () => {
        const [, withTables] = buildSqlRunnerQueryMessages({
            ...base,
            knownTables: [
                {
                    schema: 'jaffle',
                    table: 'orders',
                    columns: [
                        { name: 'id', type: 'number' },
                        { name: 'status', type: 'string' },
                    ],
                },
            ],
        });
        const [, withoutTables] = buildSqlRunnerQueryMessages(base);
        expect(withTables.content).toContain(
            'Known tables:\n  jaffle.orders: id (number), status (string)',
        );
        expect(withoutTables.content).not.toContain('Known tables');
    });
});

describe('stripMarkdownFences', () => {
    it('removes fences and a trailing semicolon', () => {
        expect(stripMarkdownFences('```sql\nSELECT 1;\n```')).toBe('SELECT 1');
    });
});
