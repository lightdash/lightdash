import { SupportedDbtAdapter } from '@lightdash/common';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { type PgWireQueryResult } from '../PostgresWireServer';
import { type PgWireTable } from '../types';
import { rewriteCatalogSql, tryHandleCatalogQuery } from './catalogQuery';
import { buildCatalogRelations } from './catalogRelations';
import catalogSchema from './catalogSchema.json';

const catalog: PgWireTable[] = [
    {
        name: 'orders',
        description: 'Orders placed',
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
                fieldId: 'orders_order_date',
                table: 'orders',
                name: 'order_date',
                kind: 'dimension',
                type: 'date',
                description: 'Date',
                timeInterval: null,
            },
            {
                fieldId: 'orders_is_completed',
                table: 'orders',
                name: 'is_completed',
                kind: 'dimension',
                type: 'boolean',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_total',
                table: 'orders',
                name: 'total',
                kind: 'metric',
                type: 'sum',
                description: 'Total',
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
            {
                fieldId: 'customers_created',
                table: 'customers',
                name: 'created',
                kind: 'dimension',
                type: 'timestamp',
                description: null,
                timeInterval: null,
            },
        ],
    },
];

const context = {
    databaseName: 'proj-uuid',
    userName: 'alice@example.com',
    catalog,
};
const input = { ...context, relations: buildCatalogRelations(context) };

const rowsOf = (
    sql: string,
): { fields: string[]; rows: (string | null)[][] } => {
    const result = tryHandleCatalogQuery(sql, input);
    if (!result || result.type !== 'rows') {
        throw new Error(`expected a catalog result for ${sql.slice(0, 60)}`);
    }
    return { fields: result.fields.map((f) => f.name), rows: result.rows };
};

const objectsOf = (sql: string): Record<string, string | null>[] => {
    const { fields, rows } = rowsOf(sql);
    return rows.map((row) =>
        Object.fromEntries(fields.map((name, i) => [name, row[i]])),
    );
};

/** Every statement pgjdbc 42.7.7 sends for the DatabaseMetaData calls we care about, grouped by call */
const pgjdbcFixtures = (): Map<string, string[]> => {
    const lines = readFileSync(
        path.join(__dirname, 'testFixtures/pgjdbc-42.7.7-metadata.txt'),
        'utf8',
    ).split('\n');
    const byLabel = new Map<string, string[]>();
    let label = '';
    lines.forEach((line) => {
        if (line.startsWith('##### ') && !/ (OK|ERROR)/.test(line)) {
            label = line.slice(6);
        } else if (line.startsWith('SQL: ')) {
            byLabel.set(label, [...(byLabel.get(label) ?? []), line.slice(5)]);
        }
    });
    return byLabel;
};

describe('pgjdbc DatabaseMetaData statements', () => {
    const fixtures = pgjdbcFixtures();

    it('answers every captured statement', () => {
        fixtures.forEach((statements, label) => {
            statements.forEach((sql) => {
                const result = tryHandleCatalogQuery(sql, input);
                expect(result, `${label}: ${sql.slice(0, 80)}`).not.toBeNull();
                expect((result as PgWireQueryResult).type).toBe('rows');
            });
        });
    });

    it('getSchemas lists the namespaces', () => {
        const rows = objectsOf(fixtures.get('getSchemas')?.at(-1) ?? '');
        expect(rows.map((r) => r.TABLE_SCHEM)).toEqual([
            'information_schema',
            'pg_catalog',
            'public',
        ]);
        expect(rows[0].TABLE_CATALOG).toBe('proj-uuid');
    });

    it('getTables(public) lists the explores with their descriptions as REMARKS', () => {
        const rows = objectsOf(
            fixtures.get('getTables(null,public,%,TABLE/VIEW)')?.[0] ?? '',
        );
        expect(rows).toEqual([
            expect.objectContaining({
                TABLE_CAT: 'proj-uuid',
                TABLE_SCHEM: 'public',
                TABLE_NAME: 'customers',
                TABLE_TYPE: 'TABLE',
                REMARKS: null,
            }),
            expect.objectContaining({
                TABLE_NAME: 'orders',
                TABLE_TYPE: 'TABLE',
                REMARKS: 'Orders placed',
            }),
        ]);
    });

    it('getTables(all) also exposes the catalog relations as system tables', () => {
        const rows = objectsOf(
            fixtures.get('getTables(null,null,%,null)')?.[0] ?? '',
        );
        expect(rows.find((r) => r.TABLE_NAME === 'pg_class')).toMatchObject({
            TABLE_SCHEM: 'pg_catalog',
            TABLE_TYPE: 'SYSTEM TABLE',
        });
        expect(rows.filter((r) => r.TABLE_SCHEM === 'public')).toHaveLength(2);
    });

    it('getColumns(orders) lists the fields in order with types and comments', () => {
        const rows = objectsOf(
            fixtures.get('getColumns(null,public,orders,%)')?.[0] ?? '',
        );
        expect(
            rows.map((r) => [r.attname, r.atttypid, r.attnum, r.description]),
        ).toEqual([
            ['orders_status', '25', '1', 'Status'],
            ['orders_amount', '701', '2', null],
            ['orders_order_date', '1082', '3', 'Date'],
            ['orders_is_completed', '16', '4', null],
            ['orders_total', '701', '5', 'Total'],
            ['orders_count', '20', '6', null],
        ]);
        expect(rows[0]).toMatchObject({
            attnotnull: 'f',
            adsrc: null,
            typtype: 'b',
            nspname: 'public',
        });
    });

    it('getPrimaryKeys, getIndexInfo and getProcedures are empty rather than errors', () => {
        ['getPrimaryKeys', 'getIndexInfo'].forEach((label) => {
            const { rows } = rowsOf(fixtures.get(label)?.[0] ?? '');
            expect({ label, rows }).toEqual({ label, rows: [] });
        });
        const procedures = rowsOf(fixtures.get('getProcedures')?.[0] ?? '');
        expect(procedures.rows).toEqual([]);
        expect(procedures.fields.slice(0, 3)).toEqual([
            'PROCEDURE_CAT',
            'PROCEDURE_SCHEM',
            'PROCEDURE_NAME',
        ]);
    });

    it('answers the lazily issued type cache query with generate_series, USING and ::regproc', () => {
        const sql = fixtures
            .get('getTypeInfo')
            ?.find((statement) => statement.includes('array_in'));
        const rows = objectsOf(sql ?? '');
        expect(rows.find((r) => r.typname === '_int4')).toMatchObject({
            is_array: 't',
            typtype: 'b',
        });
        expect(rows.find((r) => r.typname === 'int4')).toMatchObject({
            is_array: 'f',
            oid: '23',
        });
    });

    it('getImportedKeys second statement (foreign keys via generate_series) is empty', () => {
        expect(
            rowsOf(
                `SELECT current_database() AS "PKTABLE_CAT", pkn.nspname AS "PKTABLE_SCHEM", pkc.relname AS "PKTABLE_NAME", pka.attname AS "PKCOLUMN_NAME", pos.n AS "KEY_SEQ", con.conname AS "FK_NAME" FROM pg_catalog.pg_namespace pkn, pg_catalog.pg_class pkc, pg_catalog.pg_attribute pka, pg_catalog.pg_namespace fkn, pg_catalog.pg_class fkc, pg_catalog.pg_attribute fka, pg_catalog.pg_constraint con, pg_catalog.generate_series(1, 32) pos(n), pg_catalog.pg_class pkic WHERE pkn.oid = pkc.relnamespace AND pkc.oid = pka.attrelid AND pka.attnum = con.confkey[pos.n] AND con.confrelid = pkc.oid AND fkn.oid = fkc.relnamespace AND fkc.oid = fka.attrelid AND fka.attnum = con.conkey[pos.n] AND con.conrelid = fkc.oid AND con.contype = 'f' AND pkic.oid = con.conindid AND fkn.nspname = 'public' AND fkc.relname = 'orders' ORDER BY pkn.nspname,pkc.relname, con.conname,pos.n`,
            ).rows,
        ).toEqual([]);
    });

    it('getTypeInfo returns the base types and getImportedKeys its settings probe', () => {
        const types = objectsOf(fixtures.get('getTypeInfo')?.[0] ?? '');
        expect(types.find((t) => t.typname === 'int8')?.oid).toBe('20');
        expect(types.length).toBeGreaterThan(50);
        expect(objectsOf(fixtures.get('getImportedKeys')?.[0] ?? '')).toEqual([
            { setting: '32' },
        ]);
    });
});

describe('DBeaver navigator statements', () => {
    it('lists schemas with descriptions', () => {
        const rows = objectsOf(
            `SELECT n.oid,n.*,d.description FROM pg_catalog.pg_namespace n LEFT OUTER JOIN pg_catalog.pg_description d ON d.objoid=n.oid AND d.objsubid=0 AND d.classoid='pg_namespace'::regclass ORDER BY nspname`,
        );
        expect(rows.map((r) => r.nspname)).toEqual([
            'information_schema',
            'pg_catalog',
            'pg_toast',
            'public',
        ]);
    });

    it('lists tables of a schema by namespace oid with all pg_class columns', () => {
        const rows = objectsOf(
            `SELECT c.oid,c.*,d.description,pg_catalog.pg_get_expr(c.relpartbound, c.oid) as partition_expr, pg_catalog.pg_get_partkeydef(c.oid) as partition_key FROM pg_catalog.pg_class c LEFT OUTER JOIN pg_catalog.pg_description d ON d.objoid=c.oid AND d.objsubid=0 AND d.classoid='pg_class'::regclass WHERE c.relnamespace=(select oid from pg_catalog.pg_namespace where nspname='public') AND c.relkind not in ('i','I','c')`,
        );
        expect(
            rows.map((r) => [r.relname, r.relkind, r.description, r.relnatts]),
        ).toEqual([
            ['orders', 'r', 'Orders placed', '6'],
            ['customers', 'r', null, '2'],
        ]);
        expect(rows[0]).toMatchObject({
            relpersistence: 'p',
            relispartition: 'f',
            partition_expr: null,
        });
    });

    it('lists columns with their comments through the four-way join', () => {
        const rows = objectsOf(
            `SELECT c.relname,a.*,pg_catalog.pg_get_expr(ad.adbin, ad.adrelid, true) as def_value,dsc.description,dep.objid FROM pg_catalog.pg_attribute a INNER JOIN pg_catalog.pg_class c ON (a.attrelid=c.oid) LEFT OUTER JOIN pg_catalog.pg_attrdef ad ON (a.attrelid=ad.adrelid AND a.attnum = ad.adnum) LEFT OUTER JOIN pg_catalog.pg_description dsc ON (c.oid=dsc.objoid AND a.attnum = dsc.objsubid) LEFT OUTER JOIN pg_depend dep on dep.refobjid = a.attrelid AND dep.deptype = 'i' and dep.refobjsubid = a.attnum and dep.classid = dep.refclassid WHERE NOT a.attisdropped AND c.relkind not in ('i','I','c') AND c.oid=16384 ORDER BY a.attnum`,
        );
        expect(
            rows.map((r) => [r.attname, r.description, r.def_value]),
        ).toEqual([
            ['orders_status', 'Status', null],
            ['orders_amount', null, null],
            ['orders_order_date', 'Date', null],
            ['orders_is_completed', null, null],
            ['orders_total', 'Total', null],
            ['orders_count', null, null],
        ]);
    });

    it('answers the type, database, role and access-method caches', () => {
        expect(
            objectsOf(
                `SELECT t.oid,t.*,c.relkind,format_type(nullif(t.typbasetype, 0), t.typtypmod) as base_type_name, d.description FROM pg_catalog.pg_type t LEFT OUTER JOIN pg_catalog.pg_type et ON et.oid=t.typelem LEFT OUTER JOIN pg_catalog.pg_class c ON c.oid=t.typrelid LEFT OUTER JOIN pg_catalog.pg_description d ON t.oid=d.objoid WHERE t.typname IS NOT NULL AND (c.relkind IS NULL OR c.relkind = 'c') AND (et.typcategory IS NULL OR et.typcategory <> 'C')`,
            ).find((t) => t.typname === 'text'),
        ).toMatchObject({ oid: '25', typcategory: 'S', relkind: null });
        expect(
            objectsOf(
                `SELECT db.oid,db.* FROM pg_catalog.pg_database db WHERE datname='proj-uuid'`,
            ),
        ).toHaveLength(1);
        expect(
            objectsOf(
                `SELECT a.oid,a.* FROM pg_catalog.pg_roles a ORDER BY a.rolname`,
            )[0],
        ).toMatchObject({
            rolname: 'alice@example.com',
            rolcanlogin: 't',
        });
        expect(
            objectsOf(`SELECT am.oid,am.* FROM pg_catalog.pg_am am`).length,
        ).toBeGreaterThan(3);
        expect(
            objectsOf(
                `SELECT setting FROM pg_catalog.pg_settings WHERE name='server_version'`,
            ),
        ).toEqual([{ setting: '16.3 (Lightdash)' }]);
    });
});

describe('psql backslash commands', () => {
    it('\\dt', () => {
        const rows = objectsOf(
            `SELECT n.nspname as "Schema", c.relname as "Name", CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' END as "Type", pg_catalog.pg_get_userbyid(c.relowner) as "Owner" FROM pg_catalog.pg_class c LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m','S','f','') AND n.nspname <> 'pg_catalog' AND n.nspname !~ '^pg_toast' AND n.nspname <> 'information_schema' AND pg_catalog.pg_table_is_visible(c.oid) ORDER BY 1,2;`,
        );
        expect(rows).toEqual([
            {
                Schema: 'public',
                Name: 'customers',
                Type: 'table',
                Owner: 'alice@example.com',
            },
            {
                Schema: 'public',
                Name: 'orders',
                Type: 'table',
                Owner: 'alice@example.com',
            },
        ]);
    });

    it('\\d orders (OPERATOR and COLLATE spellings, scalar subselects)', () => {
        expect(
            objectsOf(
                `SELECT c.oid, n.nspname, c.relname FROM pg_catalog.pg_class c LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname OPERATOR(pg_catalog.~) '^(orders)$' COLLATE pg_catalog.default AND pg_catalog.pg_table_is_visible(c.oid) ORDER BY 2, 3;`,
            ),
        ).toEqual([{ oid: '16384', nspname: 'public', relname: 'orders' }]);
        const columns = objectsOf(
            `SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod), (SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid, true) FROM pg_catalog.pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum AND a.atthasdef), a.attnotnull, (SELECT c.collname FROM pg_catalog.pg_collation c, pg_catalog.pg_type t WHERE c.oid = a.attcollation AND t.oid = a.atttypid AND a.attcollation <> t.typcollation) AS attcollation, a.attidentity, a.attgenerated FROM pg_catalog.pg_attribute a WHERE a.attrelid = '16384' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;`,
        );
        expect(columns.map((c) => [c.attname, c.format_type])).toEqual([
            ['orders_status', 'text'],
            ['orders_amount', 'double precision'],
            ['orders_order_date', 'date'],
            ['orders_is_completed', 'boolean'],
            ['orders_total', 'double precision'],
            ['orders_count', 'bigint'],
        ]);
    });
});

describe('information_schema and constant selects (behaviour carried over)', () => {
    it('lists tables and columns with the Lightdash field_type column', () => {
        expect(
            objectsOf(
                `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
            ),
        ).toEqual([{ table_name: 'customers' }, { table_name: 'orders' }]);
        expect(
            objectsOf(
                `select column_name, data_type, ordinal_position, field_type from information_schema.columns where table_name = 'orders' and field_type = 'metric' order by ordinal_position`,
            ),
        ).toEqual([
            {
                column_name: 'orders_total',
                data_type: 'double precision',
                ordinal_position: '5',
                field_type: 'metric',
            },
            {
                column_name: 'orders_count',
                data_type: 'bigint',
                ordinal_position: '6',
                field_type: 'metric',
            },
        ]);
    });

    it('answers SELECTs without FROM with the expected types', () => {
        const result = tryHandleCatalogQuery(
            `select 1, 'x' as s, true, null, version(), current_user, current_schema(), current_schemas(true)`,
            input,
        );
        expect(result).toMatchObject({
            type: 'rows',
            fields: [
                { name: '?column?', oid: 20 },
                { name: 's', oid: 25 },
                { name: 'bool', oid: 16 },
                { name: '?column?', oid: 25 },
                { name: 'version', oid: 25 },
                { name: 'current_user', oid: 19 },
                { name: 'current_schema', oid: 19 },
                { name: 'current_schemas', oid: 1003 },
            ],
            rows: [
                [
                    '1',
                    'x',
                    't',
                    null,
                    'PostgreSQL 16.3 (Lightdash semantic layer, wire protocol)',
                    'alice@example.com',
                    'public',
                    '{pg_catalog,public}',
                ],
            ],
            commandTag: 'SELECT 1',
        });
    });
});

describe('large projects', () => {
    it('answers pgjdbc wildcard getColumns over 45k columns within resource budgets', () => {
        const bigCatalog: PgWireTable[] = Array.from(
            { length: 300 },
            (_, t) => ({
                name: `explore_${t}`,
                description: null,
                targetDatabase: SupportedDbtAdapter.POSTGRES,
                fields: Array.from({ length: 150 }, (__, f) => ({
                    fieldId: `explore_${t}_field_${f}`,
                    table: `explore_${t}`,
                    name: `field_${f}`,
                    kind: 'dimension' as const,
                    type: 'string',
                    description: null,
                    timeInterval: null,
                })),
            }),
        );
        const bigContext = { ...context, catalog: bigCatalog };
        const bigInput = {
            ...bigContext,
            relations: buildCatalogRelations(bigContext),
        };
        const sql = (
            pgjdbcFixtures().get('getColumns(null,public,orders,%)')?.[0] ?? ''
        ).replace("c.relname LIKE 'orders'", "c.relname LIKE '%'");
        const result = tryHandleCatalogQuery(sql, bigInput);
        expect(result).toMatchObject({ type: 'rows' });
        expect((result as { rows: unknown[] }).rows).toHaveLength(45_000);
    });
});

describe('generated catalog schema', () => {
    it('comes from PostgreSQL 16 and declares every column the row builders emit', () => {
        expect(catalogSchema.generatedFrom).toMatch(/^PostgreSQL 16\./);
        const relations = buildCatalogRelations(context);
        [
            'pg_catalog.pg_class',
            'pg_catalog.pg_attribute',
            'pg_catalog.pg_description',
            'information_schema.columns',
        ].forEach((key) => {
            const relation = relations.get(key);
            expect(relation?.rows.length).toBeGreaterThan(0);
            relation?.rows.forEach((row) => {
                expect(Object.keys(row).sort()).toEqual(
                    relation.columns.map((c) => c.name).sort(),
                );
            });
        });
        expect(
            relations
                .get('information_schema.columns')
                ?.columns.map((c) => c.name),
        ).toContain('field_type');
    });
});

describe('routing', () => {
    it('leaves explore queries and unknown tables to the compiler', () => {
        expect(
            tryHandleCatalogQuery('select orders_status from orders', input),
        ).toBeNull();
        expect(
            tryHandleCatalogQuery('select * from not_a_table', input),
        ).toBeNull();
        expect(
            tryHandleCatalogQuery(
                'select 1 from orders o join pg_catalog.pg_class c on true',
                input,
            ),
        ).toBeNull();
        expect(tryHandleCatalogQuery('this is not sql', input)).toBeNull();
        expect(
            tryHandleCatalogQuery('set search_path = public', input),
        ).toBeNull();
    });

    it('routes top-level UNIONs of catalog selects and ARRAY(subquery)', () => {
        expect(
            rowsOf(
                `select relname from pg_class where relname = 'orders' union select 'x' order by 1`,
            ).rows,
        ).toEqual([['orders'], ['x']]);
        expect(
            rowsOf(
                `select array(select nspname from pg_namespace where nspname <> 'pg_toast' order by 1)`,
            ).rows,
        ).toEqual([['{information_schema,pg_catalog,public}']]);
        expect(
            tryHandleCatalogQuery(
                `select relname from pg_class union select orders_status from orders`,
                input,
            ),
        ).toBeNull();
    });

    it('keeps information_schema.tables to explores (catalog relations are browsable via pg_class)', () => {
        expect(
            rowsOf('select table_name from information_schema.tables').rows,
        ).toEqual([['orders'], ['customers']]);
    });

    it('echoes the database name the client connected with', () => {
        const slugInput = { ...input, databaseName: 'jaffle-shop' };
        expect(
            tryHandleCatalogQuery(
                'select current_database(), current_catalog',
                slugInput,
            ),
        ).toMatchObject({
            rows: [['jaffle-shop', 'jaffle-shop']],
        });
        expect(
            tryHandleCatalogQuery(
                `select datname from pg_database where datname = 'jaffle-shop'`,
                {
                    ...slugInput,
                    relations: buildCatalogRelations({
                        ...context,
                        databaseName: 'jaffle-shop',
                    }),
                },
            ),
        ).toMatchObject({ rows: [['jaffle-shop']] });
    });

    it('leaves string literals alone: rewrites only apply when the parser rejects the SQL', () => {
        expect(
            rowsOf(
                `select 'COLLATE "default" x' as s, 'OPERATOR(pg_catalog.~)' as o`,
            ).rows,
        ).toEqual([['COLLATE "default" x', 'OPERATOR(pg_catalog.~)']]);
    });

    it('evaluates now() per call rather than at load time', async () => {
        const first = rowsOf('select now()').rows[0][0];
        await new Promise((resolve) => {
            setTimeout(resolve, 5);
        });
        expect(rowsOf('select now()').rows[0][0]).not.toBe(first);
    });

    it('lists explores in pg_tables and reports never-analyzed statistics per table', () => {
        expect(
            objectsOf(
                `select tablename, tableowner from pg_tables where schemaname = 'public' order by 1`,
            ),
        ).toEqual([
            { tablename: 'customers', tableowner: 'alice@example.com' },
            { tablename: 'orders', tableowner: 'alice@example.com' },
        ]);
        expect(
            objectsOf(
                `select relname, n_live_tup, last_analyze from pg_stat_user_tables where schemaname = 'public' and relname = 'orders'`,
            ),
        ).toEqual([{ relname: 'orders', n_live_tup: '0', last_analyze: null }]);
        expect(
            rowsOf(
                `select relid from pg_stat_all_tables where relname = 'customers'`,
            ).rows,
        ).toEqual([['16385']]);
    });

    it('answers the SQL editor keyword probe with an empty set', () => {
        const { fields, rows } = rowsOf(
            'SELECT word FROM pg_catalog.pg_get_keywords()',
        );
        expect(fields).toEqual(['word']);
        expect(rows).toEqual([]);
    });

    it('takes unqualified pg_* names and information_schema', () => {
        expect(
            rowsOf('select relname from pg_class where relnamespace = 2200')
                .rows,
        ).toHaveLength(2);
        expect(
            rowsOf('select schema_name from information_schema.schemata').rows,
        ).toHaveLength(3);
    });

    it('reports unknown catalog relations and functions with Postgres codes', () => {
        expect(() =>
            tryHandleCatalogQuery('select * from pg_catalog.pg_nope', input),
        ).toThrow(expect.objectContaining({ code: '42P01' }));
        expect(() => tryHandleCatalogQuery('select pg_nope(1)', input)).toThrow(
            expect.objectContaining({ code: '42883' }),
        );
        expect(() =>
            tryHandleCatalogQuery(
                'select nope from pg_catalog.pg_class',
                input,
            ),
        ).toThrow(expect.objectContaining({ code: '42703' }));
    });

    it('rewrites driver SQL the parser cannot handle', () => {
        expect(
            rewriteCatalogSql(
                '(information_schema._pg_expandarray(i.indkey)).n AS KEY_SEQ, (result.KEYS).x',
            ),
        ).toBe('NULL AS KEY_SEQ, NULL');
        expect(
            rewriteCatalogSql(
                `trim(both '"' from pg_catalog.pg_get_indexdef(1, 2, false))`,
            ),
        ).toBe('trim(pg_catalog.pg_get_indexdef(1, 2, false))');
        expect(
            rewriteCatalogSql(
                `relname OPERATOR(pg_catalog.~) '^x$' COLLATE pg_catalog.default AND`,
            ),
        ).toBe("relname ~ '^x$'  AND");
    });
});
