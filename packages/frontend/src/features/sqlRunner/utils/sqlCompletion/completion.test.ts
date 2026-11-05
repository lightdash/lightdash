import { DimensionType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import type { WarehouseTableFieldWithContext } from '../../hooks/useTableFields';
import type { SqlCatalog } from '../sqlCompletionScope';
import { analyzeCompletionContext, extractTableReferences } from './analyze';
import {
    getSqlSuggestions,
    type SqlSuggestion,
    type SqlSuggestionData,
} from './suggest';
import { getSqlFunctions } from './vocabulary';

const catalog: SqlCatalog = {
    database: 'analytics',
    tablesBySchema: [
        { schema: 'silver', tables: { orders: {}, customers: {} } },
        { schema: 'gold', tables: { revenue: {} } },
    ],
};

const field = (
    table: string,
    name: string,
    type: DimensionType,
    schema = 'silver',
): WarehouseTableFieldWithContext => ({ table, schema, name, type });

const fields = [
    field('orders', 'order_id', DimensionType.STRING),
    field('orders', 'customer_id', DimensionType.STRING),
    field('orders', 'amount', DimensionType.NUMBER),
    field('customers', 'customer_id', DimensionType.STRING),
    field('customers', 'name', DimensionType.STRING),
    field('revenue', 'total', DimensionType.NUMBER, 'gold'),
];

const run = (
    sqlWithCursor: string,
    {
        quoteChar = '`',
        triggerCharacter = null,
        settings,
        activeTable = null,
    }: {
        quoteChar?: string;
        triggerCharacter?: string | null;
        settings?: SqlSuggestionData['settings'];
        activeTable?: SqlSuggestionData['activeTable'];
    } = {},
) => {
    const offset = sqlWithCursor.indexOf('|');
    const sql = sqlWithCursor.replace('|', '');
    const lineStart = sql.lastIndexOf('\n', offset - 1) + 1;
    const lineEnd = sql.indexOf('\n', offset);
    const line = sql.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const linePrefix = sql.slice(lineStart, offset);
    const suggestions = getSqlSuggestions({
        context: analyzeCompletionContext(sql, offset, quoteChar),
        linePrefix,
        nextChar: line.charAt(linePrefix.length),
        triggerCharacter,
        data: {
            quoteChar,
            catalog,
            fields,
            parameters: { region: { label: 'Region' } },
            functions: getSqlFunctions(undefined),
            settings,
            activeTable,
        },
    });
    // Monaco shows items by sortText for an empty prefix
    const sorted = [...suggestions].sort((a, b) =>
        a.sortText.localeCompare(b.sortText),
    );
    const apply = (item: SqlSuggestion) =>
        line.slice(0, item.range.startColumn - 1) +
        item.insertText +
        line.slice(item.range.endColumn - 1);
    return {
        items: sorted,
        labels: sorted.map((s) => s.label),
        kinds: new Set(sorted.map((s) => s.kind)),
        find: (label: string, description?: string) => {
            const item = sorted.find(
                (s) =>
                    s.label === label &&
                    (description === undefined ||
                        s.description === description),
            );
            if (!item) throw new Error(`No suggestion ${label}`);
            return item;
        },
        apply,
    };
};

describe('statement start', () => {
    it('suggests statement keywords and SELECT starters', () => {
        const { labels } = run('SE|');
        expect(labels).toEqual(['SELECT', 'SELECT *', 'SELECT * FROM', 'WITH']);
    });

    it('matches the case the user is typing', () => {
        expect(run('se|').labels).toEqual([
            'select',
            'select *',
            'select * from',
            'with',
        ]);
    });

    it('starts a new statement after a semicolon', () => {
        expect(run('SELECT 1 FROM silver.orders;\nSE|').labels).toEqual([
            'SELECT',
            'SELECT *',
            'SELECT * FROM',
            'WITH',
        ]);
    });

    it('puts the sidebar table first after FROM', () => {
        const { items, find } = run('SELECT amount FROM |', {
            activeTable: { schema: 'gold', table: 'revenue' },
        });
        const tableLabels = items
            .filter((item) => item.kind === 'table')
            .map((item) => item.label);
        expect(tableLabels[0]).toBe('revenue');
        expect(find('revenue').description).toBe('gold · selected');
        expect(find('orders').description).toBe('silver');
    });

    it('reopens the list after SELECT * FROM so a table can be picked', () => {
        const { find, apply } = run('SE|');
        const starter = find('SELECT * FROM');
        expect(starter.triggersSuggest).toBe(true);
        expect(apply(starter)).toBe('SELECT * FROM ');
    });

    it('offers every column of the sidebar table as a starter', () => {
        const { find, apply } = run('se|', {
            activeTable: { schema: 'silver', table: 'orders' },
            settings: {
                quotePreference: 'never',
                casePreference: 'preserve',
                qualification: 'schema',
            },
        });
        const starter = find(
            'select order_id, customer_id, amount from orders',
        );
        expect(starter.documentation).toBe('All 3 columns of orders');
        expect(apply(starter)).toBe(
            'select order_id, customer_id, amount from silver.orders',
        );
    });

    it('lists more than three columns one per line', () => {
        const { items, apply } = run('SE|', {
            activeTable: { schema: 'silver', table: 'customers' },
            settings: {
                quotePreference: 'always',
                casePreference: 'preserve',
                qualification: 'schema',
            },
        });
        const starter = items.find((item) =>
            item.label.startsWith('SELECT customer_id'),
        );
        expect(starter?.label).toBe('SELECT customer_id, name FROM customers');
        expect(apply(starter!)).toBe(
            'SELECT `customer_id`, `name` FROM `silver`.`customers`',
        );
    });
});

describe('qualification', () => {
    const unquoted = {
        quotePreference: 'never' as const,
        casePreference: 'preserve' as const,
        qualification: 'schema' as const,
    };

    it('inserts schema.table by default', () => {
        const { find, apply } = run('SELECT * FROM |', { settings: unquoted });
        expect(apply(find('orders'))).toBe('SELECT * FROM silver.orders');
        expect(apply(find('revenue'))).toBe('SELECT * FROM gold.revenue');
    });

    it('inserts the full path when the query uses it', () => {
        const { find, apply } = run('SELECT * FROM |', {
            settings: { ...unquoted, qualification: 'full' },
        });
        expect(apply(find('orders'))).toBe(
            'SELECT * FROM analytics.silver.orders',
        );
    });
});

describe('table position', () => {
    it('suggests tables, schemas and the database after FROM', () => {
        const { find, kinds, apply } = run('SELECT * FROM |');
        expect([...kinds]).toEqual(['table', 'schema', 'database']);
        const orders = find('orders');
        expect(orders.description).toBe('silver');
        expect(apply(orders)).toBe(
            'SELECT * FROM `analytics`.`silver`.`orders`',
        );
    });

    it('labels tables by bare name so fuzzy matching runs on the name', () => {
        const { items, apply, find } = run('SELECT * FROM ord|');
        const tableLabels = items
            .filter((i) => i.kind === 'table')
            .map((i) => i.label);
        expect(tableLabels).toEqual(['customers', 'orders', 'revenue']);
        expect(apply(find('orders'))).toBe(
            'SELECT * FROM `analytics`.`silver`.`orders`',
        );
    });

    it('scopes `schema.` to its tables', () => {
        expect(run('SELECT * FROM silver.|').labels).toEqual([
            'customers',
            'orders',
        ]);
    });

    it('scopes `database.` to its schemas and `database.schema.` to tables', () => {
        expect(run('SELECT * FROM analytics.|').labels).toEqual([
            'gold',
            'silver',
        ]);
        expect(run('SELECT * FROM analytics.gold.|').labels).toEqual([
            'revenue',
        ]);
    });

    it('suggests tables after JOIN and a comma', () => {
        expect(
            run('SELECT * FROM silver.orders o LEFT JOIN |').kinds.has('table'),
        ).toBe(true);
        expect(run('SELECT * FROM silver.orders, |').kinds.has('table')).toBe(
            true,
        );
    });

    it('offers CTE names first', () => {
        const { labels } = run(
            'WITH recent AS (SELECT order_id FROM silver.orders) SELECT * FROM |',
        );
        expect(labels[0]).toBe('recent');
    });

    it('suggests clause keywords, not tables, after a table', () => {
        const { kinds, labels } = run('SELECT * FROM silver.orders o |');
        expect([...kinds]).toEqual(['keyword']);
        expect(labels).toContain('WHERE');
        expect(labels).toContain('LEFT JOIN');
    });

    it('opens the list after typing a space following FROM', () => {
        expect(
            run('SELECT * FROM |', { triggerCharacter: ' ' }).labels.length,
        ).toBeGreaterThan(0);
        expect(
            run('SELECT * FROM silver.orders |', { triggerCharacter: ' ' })
                .labels,
        ).toEqual([]);
    });

    it('follows quote and case preferences', () => {
        const { find, apply } = run('SELECT * FROM |', {
            quoteChar: '"',
            settings: {
                quotePreference: 'always',
                casePreference: 'uppercase',
                qualification: 'full',
            },
        });
        expect(apply(find('orders'))).toBe(
            'SELECT * FROM "ANALYTICS"."SILVER"."ORDERS"',
        );
        const unquoted = run('SELECT * FROM |', {
            quoteChar: '"',
            settings: {
                quotePreference: 'never',
                casePreference: 'lowercase',
                qualification: 'full',
            },
        });
        expect(unquoted.apply(unquoted.find('orders'))).toBe(
            'SELECT * FROM analytics.silver.orders',
        );
    });
});

describe('value position', () => {
    it('ranks columns of tables in the statement first', () => {
        const { items } = run('SELECT | FROM silver.orders');
        const columns = items.filter((i) => i.kind === 'column');
        expect(columns.slice(0, 3).map((c) => c.label)).toEqual([
            'amount',
            'customer_id',
            'order_id',
        ]);
        expect(columns[0].description).toBe('orders');
        expect(columns[0].detail).toBe(' number');
        expect(items[0].kind).toBe('column');
    });

    it('ranks other columns after statement columns, then tables, then the rest', () => {
        const { items } = run('SELECT | FROM silver.orders');
        const order = items.map((i) => i.kind);
        const lastScoped = order.lastIndexOf('column');
        expect(items[lastScoped].description).not.toBe('orders');
        expect(order.indexOf('alias')).toBeGreaterThan(lastScoped);
        expect(order.indexOf('keyword')).toBeGreaterThan(
            order.indexOf('alias'),
        );
    });

    it('resolves `alias.` to that table only', () => {
        const sql =
            'SELECT o.| FROM silver.orders o JOIN silver.customers c ON o.customer_id = c.customer_id';
        expect(run(sql).labels).toEqual(['amount', 'customer_id', 'order_id']);
        expect(
            run(
                'SELECT c.| FROM silver.orders o JOIN silver.customers AS c ON true',
            ).labels,
        ).toEqual(['customer_id', 'name']);
    });

    it('resolves a bare table name and `schema.table` references', () => {
        expect(run('SELECT orders.| FROM orders').labels).toEqual([
            'amount',
            'customer_id',
            'order_id',
        ]);
        expect(run('SELECT | FROM gold.revenue').items[0].label).toBe('total');
    });

    it('resolves CTE and subquery columns', () => {
        expect(
            run(
                'WITH recent AS (SELECT order_id, amount AS value FROM silver.orders) SELECT r.| FROM recent r',
            ).labels,
        ).toEqual(['order_id', 'value']);
        expect(
            run(
                'SELECT s.| FROM (SELECT name, COUNT(*) AS n FROM silver.customers GROUP BY 1) s',
            ).labels,
        ).toEqual(['n', 'name']);
    });

    it('uses the scope of the subquery the cursor is in', () => {
        const { items } = run(
            'SELECT * FROM silver.orders WHERE customer_id IN (SELECT | FROM silver.customers)',
        );
        expect(items[0].description).toBe('customers');
    });

    it('suggests columns in WHERE, GROUP BY and ORDER BY', () => {
        ['WHERE ', 'GROUP BY ', 'ORDER BY ', 'WHERE amount > 1 AND '].forEach(
            (clause) => {
                expect(
                    run(`SELECT * FROM silver.orders ${clause}|`).items[0].kind,
                ).toBe('column');
            },
        );
    });

    it('suggests operators after a complete value', () => {
        const { kinds, labels } = run(
            'SELECT * FROM silver.orders WHERE amount |',
        );
        expect([...kinds]).toEqual(['keyword']);
        expect(labels).toContain('AND');
        expect(labels).toContain('IS NULL');
        expect(run('SELECT * |').labels).toContain('FROM');
        expect(run('SELECT amount |').labels).toContain('AS');
    });

    it('ignores clause look-alikes inside expressions', () => {
        expect(
            run('SELECT * EXCEPT (amount), | FROM silver.orders').items[0].kind,
        ).toBe('column');
        expect(
            run(
                'SELECT LISTAGG(name) WITHIN GROUP (ORDER BY name), | FROM silver.customers',
            ).items[0].description,
        ).toBe('customers');
        expect(
            run('SELECT * FROM silver.orders WHERE amount IS DISTINCT FROM |')
                .items[0].kind,
        ).toBe('column');
    });

    it('asks for BY after GROUP and ORDER', () => {
        expect(run('SELECT * FROM silver.orders GROUP |').labels).toEqual([
            'BY',
        ]);
    });

    it('suggests nothing for aliases, LIMIT, strings and comments', () => {
        expect(run('SELECT amount AS |').labels).toEqual([]);
        expect(run('SELECT * FROM silver.orders LIMIT |').labels).toEqual([]);
        expect(
            run("SELECT * FROM silver.orders WHERE name = 'ab|").labels,
        ).toEqual([]);
        expect(run('SELECT 1 -- note |').labels).toEqual([]);
    });

    it('offers functions as snippets', () => {
        const count = run('SELECT CO| FROM silver.orders').find('COUNT');
        expect(count.insertText).toBe('COUNT($0)');
        expect(count.isSnippet).toBe(true);
        expect(
            run('SELECT co| FROM silver.orders').find('count').insertText,
        ).toBe('count($0)');
    });
});

describe('quoted identifiers', () => {
    it('replaces an open quote and its auto-closed pair', () => {
        const { find, apply } = run('SELECT * FROM silver.`or|`');
        expect(apply(find('orders'))).toBe('SELECT * FROM silver.`orders`');
    });

    it('completes inside a quoted backtick path', () => {
        const { find, apply } = run('SELECT * FROM `silver.or|`');
        expect(apply(find('orders'))).toBe('SELECT * FROM `silver.orders`');
    });

    it('resolves aliases after a quoted table on the same line', () => {
        expect(
            run('SELECT * FROM silver."orders" o WHERE o.stat|', {
                quoteChar: '"',
            }).labels,
        ).toEqual(['amount', 'customer_id', 'order_id']);
        expect(
            run('SELECT * FROM `analytics`.`silver`.`orders` o WHERE o.|')
                .labels,
        ).toEqual(['amount', 'customer_id', 'order_id']);
        expect(
            run('SELECT * FROM `silver`.`orders` o WHERE amount |').labels,
        ).toContain('AND');
    });

    it('resolves double-quoted qualifiers on Snowflake and Postgres', () => {
        expect(
            run('SELECT * FROM "silver".|', { quoteChar: '"' }).labels,
        ).toEqual(['customers', 'orders']);
        expect(
            run('SELECT "o".| FROM "silver"."orders" "o"', { quoteChar: '"' })
                .labels,
        ).toEqual(['amount', 'customer_id', 'order_id']);
    });
});

describe('parameters', () => {
    it('completes inside ${}', () => {
        const { items, apply } = run('SELECT * FROM t WHERE r = ${ld.par|');
        expect(items.map((i) => i.kind)).toEqual(['parameter']);
        expect(apply(items[0])).toBe(
            'SELECT * FROM t WHERE r = ${ld.parameters.region',
        );
    });

    it('completes after `ld.` and `$`', () => {
        const ld = run('SELECT * FROM t WHERE r = ld.|');
        expect(ld.apply(ld.items[0])).toBe(
            'SELECT * FROM t WHERE r = ${ld.parameters.region}',
        );
        const dollar = run('SELECT * FROM t WHERE r = $|');
        expect(dollar.apply(dollar.items[0])).toBe(
            'SELECT * FROM t WHERE r = ${ld.parameters.region}',
        );
    });

    it('is offered among values but not at statement start', () => {
        expect(run('SELECT * FROM t WHERE r = |').kinds.has('parameter')).toBe(
            true,
        );
        expect(run('|').kinds.has('parameter')).toBe(false);
    });
});

describe('extractTableReferences', () => {
    it('finds tables across joins, subqueries and CTEs but not CTE names', () => {
        expect(
            extractTableReferences(
                `WITH recent AS (SELECT * FROM silver.orders)
                 SELECT * FROM recent r
                 JOIN customers c ON r.customer_id = c.customer_id
                 LEFT JOIN (SELECT * FROM \`analytics.gold.revenue\`) x ON true`,
                '`',
            ),
        ).toEqual([
            ['silver', 'orders'],
            ['customers'],
            ['analytics', 'gold', 'revenue'],
        ]);
    });
});
