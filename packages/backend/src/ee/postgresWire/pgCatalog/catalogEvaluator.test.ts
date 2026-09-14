import { SupportedDbtAdapter } from '@lightdash/common';
import { parse, type SelectStatement } from 'pgsql-ast-parser';
import { describe, expect, it, vi } from 'vitest';
import { type PgWireTable } from '../types';
import { evaluateCatalogSelect, toCatalogText } from './catalogEvaluator';
import { MAX_STATEMENT_CPU_MS } from './catalogLimits';
import { buildCatalogRelations } from './catalogRelations';

const catalog: PgWireTable[] = [
    {
        name: 'orders',
        description: 'Orders',
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        fields: [
            {
                fieldId: 'orders_status',
                table: 'orders',
                name: 'status',
                kind: 'dimension',
                type: 'string',
                description: 'Status',
                timeInterval: null,
            },
            {
                fieldId: 'orders_amount',
                table: 'orders',
                name: 'amount',
                kind: 'dimension',
                type: 'number',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_count',
                table: 'orders',
                name: 'count',
                kind: 'metric',
                type: 'count',
                description: null,
                timeInterval: null,
            },
        ],
    },
    {
        name: 'customers',
        description: null,
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        fields: [
            {
                fieldId: 'customers_id',
                table: 'customers',
                name: 'id',
                kind: 'dimension',
                type: 'number',
                description: null,
                timeInterval: null,
            },
        ],
    },
];

const context = {
    relations: buildCatalogRelations({
        databaseName: 'db',
        userName: 'alice',
        catalog,
    }),
    catalog,
    databaseName: 'db',
    userName: 'alice',
};

const run = (sql: string) => {
    const [statement] = parse(sql);
    const result = evaluateCatalogSelect(context, statement as SelectStatement);
    return {
        columns: result.columns,
        rows: result.rows.map((row) => row.map(toCatalogText)),
    };
};

const rows = (sql: string) => run(sql).rows;

describe('catalog evaluator: FROM and joins', () => {
    it('cross joins comma-separated relations and filters in WHERE', () => {
        expect(
            rows(
                `select c.relname, n.nspname from pg_class c, pg_namespace n where c.relnamespace = n.oid and n.nspname = 'public' order by c.relname`,
            ),
        ).toEqual([
            ['customers', 'public'],
            ['orders', 'public'],
        ]);
    });

    it('inner joins on an expression and resolves columns by alias or relation name', () => {
        expect(
            rows(
                `select pg_class.relname, a.attname from pg_class join pg_attribute a on a.attrelid = pg_class.oid where pg_class.relname = 'customers'`,
            ),
        ).toEqual([['customers', 'customers_id']]);
    });

    it('left joins keep unmatched rows with nulls', () => {
        expect(
            rows(
                `select c.relname, d.description from pg_class c left join pg_description d on d.objoid = c.oid and d.objsubid = 0 where c.relnamespace = 2200 order by c.relname`,
            ),
        ).toEqual([
            ['customers', null],
            ['orders', 'Orders'],
        ]);
    });

    it('supports subqueries in FROM with column aliases and correlated scalar subselects', () => {
        expect(
            rows(
                `select * from (select relname as n, oid as o from pg_class where relkind = 'r' and relnamespace = 2200) t where t.n like 'ord%'`,
            ),
        ).toEqual([['orders', '16384']]);
        expect(
            rows(
                `select c.relname, (select count(*) from pg_attribute a where a.attrelid = c.oid) from pg_class c where c.relnamespace = 2200 order by 1`,
            ),
        ).toEqual([
            ['customers', '1'],
            ['orders', '3'],
        ]);
    });

    it('joins with USING (hiding the duplicate column) and reads set-returning functions in FROM', () => {
        expect(
            rows(
                `select nspname, n.oid from pg_namespace n join (select 'public' as nspname) p using (nspname)`,
            ),
        ).toEqual([['public', '2200']]);
        expect(
            rows(
                `select s.r, (current_schemas(true))[s.r] from generate_series(1, 2) as s(r) order by 1`,
            ),
        ).toEqual([
            ['1', 'pg_catalog'],
            ['2', 'public'],
        ]);
        expect(
            rows(`select x from unnest(current_schemas(false)) as u(x)`),
        ).toEqual([['public']]);
    });

    it('bounds cross products and expensive statements with 54000 before they exhaust memory', () => {
        expect(() =>
            run(
                'select count(*) from pg_type a, pg_type b, pg_type c, pg_type d',
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
        expect(() =>
            run(
                'select 1 from generate_series(1, 10000) a, generate_series(1, 10000) b',
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
    });

    it('pins the work budget and the tuple cap independently', () => {
        // budget only: small rows, but a correlated subselect per tuple over a cross product
        expect(() =>
            run(
                'select (select count(*) from pg_type b, pg_type c) from pg_type a',
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
        // tuple cap only: hash join where every key collides (160k tuples from 400 x 400)
        expect(() =>
            run(
                'select count(*) from generate_series(1, 400) a(x) join generate_series(1, 400) b(y) on a.x - a.x = b.y - b.y',
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
        // the same shape under the cap is evaluated correctly through the hash buckets
        expect(
            rows(
                'select count(*) from generate_series(1, 300) a(x) join generate_series(1, 300) b(y) on a.x - a.x = b.y - b.y',
            ),
        ).toEqual([['90000']]);
    });

    it('cancels statements that exceed the thread CPU budget', () => {
        const [statement] = parse('select * from generate_series(1, 3000)');
        const getThreadCpuUsage = vi
            .fn()
            .mockReturnValueOnce({ user: 0, system: 0 })
            .mockReturnValue({
                user: MAX_STATEMENT_CPU_MS * 1_000 + 1,
                system: 0,
            });

        expect(() =>
            evaluateCatalogSelect(
                context,
                statement as SelectStatement,
                getThreadCpuUsage,
            ),
        ).toThrow(expect.objectContaining({ code: '57014' }));
    });

    it('does not charge descheduled wall time to the CPU budget', () => {
        const dateNow = vi
            .spyOn(Date, 'now')
            .mockReturnValueOnce(0)
            .mockReturnValue(10_000);

        const result = (() => {
            try {
                return rows('select * from generate_series(1, 3000)');
            } finally {
                dateNow.mockRestore();
            }
        })();

        expect(result).toHaveLength(3_000);
    });

    it('caps value and result sizes and pattern subjects with 54000', () => {
        // each level doubles the string: 20 levels of 10 chars exceed MAX_VALUE_LENGTH
        const grow = (depth: number): string =>
            depth === 0
                ? `select repeat_seed as a from (select 'abcdefghij' as repeat_seed) s`
                : `select a || a as a from (${grow(depth - 1)}) t${depth}`;
        expect(() => run(grow(20))).toThrow(
            expect.objectContaining({ code: '54000' }),
        );
        expect(rows(`select length(a) from (${grow(10)}) z`)).toEqual([
            [String(10 * 2 ** 10)],
        ]);
        expect(() => run(`select a ~ 'x' from (${grow(14)}) z`)).toThrow(
            expect.objectContaining({ code: '54000' }),
        );
    });

    it('bounds value-size × row-count products and prices regex matches', () => {
        const grown = (levels: number): string =>
            Array.from({ length: levels }, () => 'x').reduce(
                (inner) => `select a || a as a from (${inner}) t`,
                `select 'abcdefghij' as a`,
            );
        // 40 KB values keyed once per row of a 3000-row relation → refused before anything is materialised
        expect(() =>
            run(
                `select distinct b.a || s.n from (${grown(12)}) b, generate_series(1, 3000) s(n)`,
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
        expect(() =>
            run(
                `select s.n from (${grown(12)}) b, generate_series(1, 3000) s(n) order by b.a || s.n`,
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
        // each regex match is charged subject × pattern
        const pattern = `${Array.from({ length: 100 }, () => '(.*)').join('')}x`;
        expect(() =>
            run(
                `select count(*) from (${grown(10)}) s, generate_series(1, 2000) g(n) where s.a ~ '${pattern}'`,
            ),
        ).toThrow(expect.objectContaining({ code: '54000' }));
    });

    it('handles LIKE escapes, regex safely and NULLs inside IN lists', () => {
        expect(
            rows(
                `select relname from pg_class where relname like 'pg\\_class'`,
            ),
        ).toEqual([['pg_class']]);
        expect(
            rows(
                `select count(*) from pg_class where relname like 'pg\\_clas_'`,
            ),
        ).toEqual([['1']]);
        expect(
            rows(`select 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' ~ '(a+)+$'`),
        ).toEqual([['f']]);
        expect(() => run(`select 'x' ~ '('`)).toThrow(
            expect.objectContaining({ code: '2201B' }),
        );
        expect(() => run(`select 'a' like 'a\\'`)).toThrow(
            expect.objectContaining({ code: '22025' }),
        );
        expect(
            rows(
                `select 'a' || chr_nl || 'b' ~ 'a.b' from (select '\n' as chr_nl) q`,
            ),
        ).toEqual([['t']]);
        expect(
            rows(`select 1 in (2, null), 1 not in (2, null), 1 in (1, null)`),
        ).toEqual([[null, null, 't']]);
        expect(
            rows(
                `select 10 > '9', '16384'::oid = 16384, oid > '16383' from pg_class where relname = 'orders'`,
            ),
        ).toEqual([['t', 't', 't']]);
    });

    it('reports bad aggregate arity and deep nesting with Postgres codes', () => {
        expect(() => run('select max() from pg_type')).toThrow(
            expect.objectContaining({ code: '42883' }),
        );
        // deep nesting must surface as a Postgres error (or a value), never a raw stack overflow
        const deep = `select ${'coalesce(null, '.repeat(3000)}1${')'.repeat(3000)}`;
        try {
            expect(rows(deep)).toEqual([['1']]);
        } catch (e) {
            expect(e).toMatchObject({ code: '54001' });
        }
    });

    it('rejects RIGHT/FULL joins, other FROM functions and GROUP BY with 0A000', () => {
        [
            'select 1 from pg_class c right join pg_namespace n on true',
            "select 1 from pg_stat_file('x') k",
            'select relkind, count(*) from pg_class group by relkind',
        ].forEach((sql) => {
            expect(() => run(sql)).toThrow(
                expect.objectContaining({ code: '0A000' }),
            );
        });
    });
});

describe('catalog evaluator: expressions', () => {
    it('compares, matches and tests nulls with three-valued logic', () => {
        expect(
            rows(
                `select relname from pg_class where relname like 'ord%' or relname ilike 'CUST%' order by relname`,
            ),
        ).toEqual([['customers'], ['orders']]);
        expect(
            rows(
                `select relname from pg_class where relname ~ '^o' and relname !~* 'Z$'`,
            ),
        ).toEqual([['orders']]);
        expect(
            rows(
                `select relname from pg_class where relname in ('orders', 'nope') and relkind not in ('v')`,
            ),
        ).toEqual([['orders']]);
        expect(
            rows(`select count(*) from pg_class where relname = null`),
        ).toEqual([['0']]);
        expect(
            rows(
                `select count(*) from pg_description where description is not null and objsubid between 0 and 1`,
            ),
        ).toEqual([['2']]);
        expect(
            rows(`select 1 where 1 = 1 and not false and null is null`),
        ).toEqual([['1']]);
    });

    it('evaluates CASE in both forms, casts and array subscripts', () => {
        expect(
            rows(
                `select case relkind when 'r' then 'TABLE' when 'v' then 'VIEW' else 'OTHER' end, case when relnamespace = 2200 then 'user' end from pg_class where relname in ('orders', 'pg_class') order by relname`,
            ),
        ).toEqual([
            ['TABLE', 'user'],
            ['TABLE', null],
        ]);
        expect(
            rows(
                `select 'pg_class'::regclass, '16384'::oid, 'orders'::regclass, 't'::bool, 1::text || 'x', (current_schemas(true))[1]`,
            ),
        ).toEqual([['1259', '16384', '16384', 't', '1x', 'pg_catalog']]);
        expect(run(`select 'pg_class'::regclass`).columns[0].oid).toBe(2205);
    });

    it('does arithmetic and string concatenation', () => {
        expect(
            rows(
                `select 7 / 2, 7.5 / 2, 5 & 1, 'a' || 'b' || null, -relnatts from pg_class where relname = 'orders'`,
            ),
        ).toEqual([['3', '3.75', '1', null, '-3']]);
    });

    it('reads object and column comments through obj_description/col_description', () => {
        expect(
            rows(
                `select obj_description(16384, 'pg_class'), col_description(16384, 1), col_description(16384, 2), col_description(99999, 1)`,
            ),
        ).toEqual([['Orders', 'Status', null, null]]);
    });

    it('calls catalog functions and EXISTS', () => {
        expect(
            rows(
                `select format_type(25, null), pg_get_expr(null, 0), has_schema_privilege('public', 'USAGE'), exists (select 1 from pg_class where relname = 'orders'), coalesce(null, 'x'), nullif('a', 'a'), replace('a.b', '.', '_')`,
            ),
        ).toEqual([['text', null, 't', 't', 'x', null, 'a_b']]);
    });

    it('reports unknown columns, relations and functions with Postgres codes', () => {
        expect(() => run('select nope from pg_class')).toThrow(
            expect.objectContaining({ code: '42703' }),
        );
        expect(() => run('select oid from pg_class, pg_namespace')).toThrow(
            expect.objectContaining({ code: '42702' }),
        );
        expect(() => run('select 1 from pg_nope')).toThrow(
            expect.objectContaining({ code: '42P01' }),
        );
        expect(() => run('select nope()')).toThrow(
            expect.objectContaining({ code: '42883' }),
        );
    });
});

describe('catalog evaluator: select list, ordering, limits', () => {
    it('expands * and alias.* and names columns like Postgres', () => {
        const { columns } = run(
            `select n.*, c.relname, c.oid as id, current_database(), 1 + 1 from pg_namespace n, pg_class c limit 1`,
        );
        expect(columns.slice(0, 4).map((c) => c.name)).toEqual([
            'oid',
            'nspname',
            'nspowner',
            'nspacl',
        ]);
        expect(columns.slice(4).map((c) => c.name)).toEqual([
            'relname',
            'id',
            'current_database',
            '?column?',
        ]);
        expect(columns.find((c) => c.name === 'relname')?.oid).toBe(19);
    });

    it('orders by expression, alias, position, direction and null placement', () => {
        expect(
            rows(
                `select relname as n from pg_class where relnamespace = 2200 order by n desc`,
            ),
        ).toEqual([['orders'], ['customers']]);
        expect(
            rows(
                `select relname from pg_class where relnamespace = 2200 order by 1`,
            ),
        ).toEqual([['customers'], ['orders']]);
        expect(
            rows(
                `select c.relname, d.description from pg_class c left join pg_description d on d.objoid = c.oid and d.objsubid = 0 where c.relnamespace = 2200 order by d.description`,
            ),
        ).toEqual([
            ['orders', 'Orders'],
            ['customers', null],
        ]);
        expect(
            rows(
                `select c.relname, d.description from pg_class c left join pg_description d on d.objoid = c.oid and d.objsubid = 0 where c.relnamespace = 2200 order by d.description desc`,
            ),
        ).toEqual([
            ['customers', null],
            ['orders', 'Orders'],
        ]);
    });

    it('applies DISTINCT, LIMIT and OFFSET', () => {
        expect(
            rows(
                `select distinct relkind from pg_class where relnamespace = 2200`,
            ),
        ).toEqual([['r']]);
        expect(
            rows(
                `select relname from pg_class where relnamespace = 2200 order by 1 limit 1 offset 1`,
            ),
        ).toEqual([['orders']]);
    });

    it('numbers rows per partition with row_number() OVER', () => {
        expect(
            rows(
                `select c.relname, a.attname, row_number() over (partition by a.attrelid order by a.attnum) as n from pg_attribute a join pg_class c on c.oid = a.attrelid where c.relnamespace = 2200 order by c.relname, n`,
            ),
        ).toEqual([
            ['customers', 'customers_id', '1'],
            ['orders', 'orders_status', '1'],
            ['orders', 'orders_amount', '2'],
            ['orders', 'orders_count', '3'],
        ]);
    });

    it('evaluates UNION, UNION ALL, VALUES and IN (subquery)', () => {
        expect(
            rows(
                `select relname from pg_class where relname = 'orders' union all select 'x' union all select 'x'`,
            ),
        ).toEqual([['orders'], ['x'], ['x']]);
        expect(
            rows(
                `select relname from pg_class where relname = 'orders' union select relname from pg_class where relname = 'orders'`,
            ),
        ).toEqual([['orders']]);
        expect(rows(`select * from (values (1, 'a'), (2, 'b')) v`)).toEqual([
            ['1', 'a'],
            ['2', 'b'],
        ]);
        expect(
            rows(
                `select relname from pg_class where oid in (select attrelid from pg_attribute where attname = 'customers_id')`,
            ),
        ).toEqual([['customers']]);
        expect(
            rows(
                `select count(*) from pg_class where relnamespace = 2200 and oid not in (select attrelid from pg_attribute)`,
            ),
        ).toEqual([['0']]);
    });

    it('computes aggregates without GROUP BY', () => {
        expect(
            rows(
                `select count(*), count(description), max(objsubid), min(objsubid), bool_or(objsubid = 0), string_agg(description, '|'), array_agg(objsubid) from pg_description`,
            ),
        ).toEqual([['2', '2', '1', '0', 't', 'Orders|Status', '{0,1}']]);
    });

    it('returns column shapes even when no row matches', () => {
        const empty = run(
            `select c.relname, a.attname from pg_class c join pg_attribute a on a.attrelid = c.oid where c.relname = 'nope'`,
        );
        expect(empty.columns.map((c) => c.name)).toEqual([
            'relname',
            'attname',
        ]);
        expect(empty.rows).toEqual([]);
    });

    it('serialises booleans and arrays in Postgres text format', () => {
        expect(toCatalogText(true)).toBe('t');
        expect(toCatalogText(['a b', 'c,d', null, ''])).toBe(
            '{"a b","c,d",NULL,""}',
        );
    });
});
