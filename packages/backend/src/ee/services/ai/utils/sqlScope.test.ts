import { describe, expect, it } from 'vitest';
import {
    filterWarehouseCatalogToScope,
    findSqlScopeViolations,
    formatSqlScopeError,
    isSchemaInScope,
    type SqlScope,
} from './sqlScope';

const scope: SqlScope = { schemas: ['jaffle'] };
const catalogScope: SqlScope = { schemas: ['jaffle'], catalogs: ['prod'] };

const kinds = (sql: string, s: SqlScope = scope) =>
    findSqlScopeViolations(sql, s).map((v) => v.kind);

describe('findSqlScopeViolations', () => {
    describe('when no scope is configured', () => {
        it('allows a query against any schema', () => {
            expect(
                kinds('SELECT * FROM anything.at.all', { schemas: [] }),
            ).toEqual([]);
        });
    });

    describe('schema qualification', () => {
        it('allows a table in an allowed schema', () => {
            expect(kinds('SELECT * FROM jaffle.orders')).toEqual([]);
        });

        it('blocks a table in a schema outside the scope', () => {
            expect(kinds('SELECT * FROM jaffle_old.stale_orders')).toEqual([
                'schema',
            ]);
        });

        it('blocks a PostgreSQL ONLY table outside the scope', () => {
            expect(kinds('SELECT * FROM ONLY jaffle_old.stale_orders')).toEqual(
                ['schema'],
            );
        });

        it('reports which schema was rejected', () => {
            const [violation] = findSqlScopeViolations(
                'SELECT * FROM jaffle_old.stale_orders',
                scope,
            );
            expect(violation).toEqual({
                kind: 'schema',
                reference: 'jaffle_old.stale_orders',
                schema: 'jaffle_old',
            });
        });

        it('blocks an unqualified table name', () => {
            expect(kinds('SELECT * FROM orders')).toEqual(['unqualified']);
        });

        it('matches schema names case-insensitively', () => {
            expect(kinds('select * from JAFFLE.ORDERS')).toEqual([]);
        });
    });

    describe('quoted identifiers', () => {
        it('allows a backtick-quoted table in an allowed schema', () => {
            expect(kinds('SELECT * FROM `jaffle`.`orders`')).toEqual([]);
        });

        it('blocks a backtick-quoted table outside the scope', () => {
            expect(kinds('SELECT * FROM `legacy`.`orders`')).toEqual([
                'schema',
            ]);
        });

        it('allows a double-quoted table in an allowed schema', () => {
            expect(kinds('SELECT * FROM "jaffle"."orders"')).toEqual([]);
        });

        it('fails closed on an identifier containing a space', () => {
            expect(kinds('SELECT * FROM "my schema".orders')).toEqual([
                'unqualified',
            ]);
        });
    });

    describe('three-part references', () => {
        it('allows an allowed catalog and schema', () => {
            expect(
                kinds('SELECT * FROM prod.jaffle.orders', catalogScope),
            ).toEqual([]);
        });

        it('blocks a catalog outside the scope', () => {
            expect(
                kinds('SELECT * FROM legacy.jaffle.orders', catalogScope),
            ).toEqual(['catalog']);
        });

        it('blocks a schema outside the scope even in an allowed catalog', () => {
            expect(
                kinds('SELECT * FROM prod.finance_pii.salaries', catalogScope),
            ).toEqual(['schema']);
        });

        it('ignores the catalog when no catalogs are configured', () => {
            expect(kinds('SELECT * FROM any_catalog.jaffle.orders')).toEqual(
                [],
            );
        });
    });

    describe('catalog allow list and two-part references', () => {
        // A two-part reference runs in the connection's default catalog, which
        // may not be in the allow list — so under an allow list the guard
        // requires full qualification rather than trusting the default.
        it('rejects a two-part reference when a catalog allow list is configured', () => {
            expect(kinds('SELECT * FROM jaffle.orders', catalogScope)).toEqual([
                'catalog_unqualified',
            ]);
        });

        it('reports the schema violation first when both apply', () => {
            expect(kinds('SELECT * FROM secret.orders', catalogScope)).toEqual([
                'schema',
            ]);
        });

        it('does not require catalog qualification without an allow list', () => {
            expect(kinds('SELECT * FROM jaffle.orders')).toEqual([]);
        });

        it('does not require catalog qualification under a catalog deny list', () => {
            expect(
                kinds('SELECT * FROM jaffle.orders', {
                    schemas: [],
                    deniedCatalogs: ['legacy'],
                }),
            ).toEqual([]);
        });
    });

    describe('CTEs', () => {
        it('allows a reference to a CTE defined in the query', () => {
            expect(
                kinds(
                    'WITH o AS (SELECT * FROM jaffle.orders) SELECT * FROM o',
                ),
            ).toEqual([]);
        });

        it('blocks a CTE whose own source is outside the scope', () => {
            expect(
                kinds('WITH o AS (SELECT * FROM jaffle_old.x) SELECT * FROM o'),
            ).toEqual(['schema']);
        });

        it('allows a RECURSIVE CTE', () => {
            expect(
                kinds(
                    'WITH RECURSIVE t AS (SELECT * FROM jaffle.orders) SELECT * FROM t',
                ),
            ).toEqual([]);
        });
    });

    describe('joins', () => {
        it('allows a join where both sides are in scope', () => {
            expect(
                kinds('SELECT * FROM jaffle.a JOIN jaffle.b ON a.id = b.id'),
            ).toEqual([]);
        });

        it('blocks a LEFT JOIN onto a schema outside the scope', () => {
            expect(
                kinds(
                    'SELECT * FROM jaffle.a LEFT JOIN secret.b ON a.id = b.id',
                ),
            ).toEqual(['schema']);
        });

        it('blocks comma-join syntax, whose operands cannot be read reliably', () => {
            expect(kinds('SELECT * FROM jaffle.a, jaffle_old.b')).toEqual([
                'comma_join',
            ]);
        });

        it('blocks aliased comma-join syntax', () => {
            expect(
                kinds('SELECT * FROM jaffle.a AS x, jaffle_old.b AS y'),
            ).toEqual(['comma_join']);
        });

        it('does not mistake a comma in the SELECT list for a comma join', () => {
            expect(kinds('SELECT a, b FROM jaffle.orders')).toEqual([]);
        });

        it('does not mistake a comma inside a function call for a comma join', () => {
            expect(
                kinds('SELECT COALESCE(a, b) FROM jaffle.orders WHERE x = 1'),
            ).toEqual([]);
        });
    });

    describe('subqueries and table functions', () => {
        it('allows a subquery whose source is in scope', () => {
            expect(
                kinds('SELECT * FROM (SELECT * FROM jaffle.orders) t'),
            ).toEqual([]);
        });

        it('blocks a subquery hiding a source outside the scope', () => {
            expect(
                kinds('SELECT * FROM (SELECT * FROM other.orders) t'),
            ).toEqual(['schema']);
        });

        it('blocks a source outside the scope inside a WHERE subquery', () => {
            expect(
                kinds(
                    'SELECT * FROM jaffle.orders WHERE id IN (SELECT id FROM other.z)',
                ),
            ).toEqual(['schema']);
        });

        it('allows a table function', () => {
            expect(kinds('SELECT * FROM generate_series(1, 10)')).toEqual([]);
        });

        it('allows UNNEST', () => {
            expect(kinds('SELECT * FROM UNNEST(ARRAY[1, 2])')).toEqual([]);
        });
    });

    describe('comments and string literals', () => {
        it('ignores a schema named in a line comment', () => {
            expect(
                kinds(
                    '-- do not use jaffle_old.x\nSELECT * FROM jaffle.orders',
                ),
            ).toEqual([]);
        });

        it('ignores a schema named in a block comment', () => {
            expect(
                kinds(
                    '/* jaffle_old.x is retired */ SELECT * FROM jaffle.orders',
                ),
            ).toEqual([]);
        });

        it('ignores a schema named in a string literal', () => {
            expect(
                kinds(
                    "SELECT * FROM jaffle.orders WHERE note = 'jaffle_old.x'",
                ),
            ).toEqual([]);
        });
    });

    describe('multiple violations', () => {
        it('reports every offending reference', () => {
            expect(
                kinds('SELECT * FROM old_a.t1 JOIN old_b.t2 ON t1.id = t2.id'),
            ).toEqual(['schema', 'schema']);
        });
    });
});

describe('isSchemaInScope', () => {
    it('allows any schema when no scope is configured', () => {
        expect(isSchemaInScope({ schemas: [] }, 'anything')).toBe(true);
    });

    it('allows a schema in the scope', () => {
        expect(isSchemaInScope(scope, 'jaffle')).toBe(true);
    });

    it('rejects a schema outside the scope', () => {
        expect(isSchemaInScope(scope, 'jaffle_old')).toBe(false);
    });

    it('matches case-insensitively', () => {
        expect(isSchemaInScope(scope, 'JAFFLE')).toBe(true);
    });

    it('rejects a catalog outside the scope', () => {
        expect(isSchemaInScope(catalogScope, 'jaffle', 'legacy')).toBe(false);
    });

    it('allows an in-scope catalog and schema', () => {
        expect(isSchemaInScope(catalogScope, 'jaffle', 'prod')).toBe(true);
    });

    it('ignores the catalog when no catalogs are configured', () => {
        expect(isSchemaInScope(scope, 'jaffle', 'anything')).toBe(true);
    });
});

describe('formatSqlScopeError', () => {
    it('names the offending schema and the allowed schemas', () => {
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM jaffle_old.x', scope),
            scope,
        );
        expect(message).toContain('jaffle_old');
        expect(message).toContain('Allowed schemas: jaffle');
    });

    it('tells the agent not to retry or silently substitute a table', () => {
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM jaffle_old.x', scope),
            scope,
        );
        expect(message).toContain('Do NOT retry');
        expect(message).toContain('do NOT substitute');
    });

    it('explains how to fix an unqualified reference', () => {
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM orders', scope),
            scope,
        );
        expect(message).toContain('not schema-qualified');
    });

    it('explains how to fix a catalog-unqualified reference', () => {
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM jaffle.orders', catalogScope),
            catalogScope,
        );
        expect(message).toContain('catalog.schema.table');
        expect(message).toContain('Allowed catalogs: prod');
    });

    it('explains how to fix a comma join', () => {
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM jaffle.a, jaffle.b', scope),
            scope,
        );
        expect(message).toContain('explicit JOIN');
    });
});

describe('filterWarehouseCatalogToScope', () => {
    const catalog = {
        prod: {
            jaffle: { orders: {}, customers: {} },
            jaffle_old: { stale_orders: {} },
        },
        legacy: {
            jaffle: { ancient_orders: {} },
        },
    };

    it('returns the catalog untouched when no scope is configured', () => {
        expect(filterWarehouseCatalogToScope(catalog, { schemas: [] })).toEqual(
            catalog,
        );
    });

    it('drops schemas outside the scope', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, { schemas: ['jaffle'] }),
        ).toEqual({
            prod: { jaffle: { orders: {}, customers: {} } },
            legacy: { jaffle: { ancient_orders: {} } },
        });
    });

    it('drops catalogs outside the scope', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, {
                schemas: ['jaffle'],
                catalogs: ['prod'],
            }),
        ).toEqual({ prod: { jaffle: { orders: {}, customers: {} } } });
    });

    it('omits a database whose every schema was filtered out', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, { schemas: ['jaffle_old'] }),
        ).toEqual({ prod: { jaffle_old: { stale_orders: {} } } });
    });

    it('matches schema and catalog names case-insensitively', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, {
                schemas: ['JAFFLE'],
                catalogs: ['PROD'],
            }),
        ).toEqual({ prod: { jaffle: { orders: {}, customers: {} } } });
    });

    it('returns an empty catalog when nothing is in scope', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, {
                schemas: ['nonexistent'],
            }),
        ).toEqual({});
    });
});

describe('denied schemas and catalogs', () => {
    const denyOnly: SqlScope = { schemas: [], deniedSchemas: ['jaffle_old'] };

    it('treats a deny-only scope as configured', () => {
        expect(kinds('SELECT * FROM jaffle_old.x', denyOnly)).toEqual([
            'denied_schema',
        ]);
    });

    it('allows any other schema under a deny-only scope', () => {
        expect(kinds('SELECT * FROM anything.x', denyOnly)).toEqual([]);
    });

    it('still requires qualification under a deny-only scope', () => {
        expect(kinds('SELECT * FROM orders', denyOnly)).toEqual([
            'unqualified',
        ]);
    });

    it('lets a denied schema override the allow list', () => {
        expect(
            kinds('SELECT * FROM jaffle.x', {
                schemas: ['jaffle'],
                deniedSchemas: ['jaffle'],
            }),
        ).toEqual(['denied_schema']);
    });

    it('denies a catalog regardless of the schema', () => {
        expect(
            kinds('SELECT * FROM legacy.jaffle.x', {
                schemas: [],
                deniedCatalogs: ['legacy'],
            }),
        ).toEqual(['denied_catalog']);
    });

    it('matches denied names case-insensitively', () => {
        expect(kinds('SELECT * FROM JAFFLE_OLD.x', denyOnly)).toEqual([
            'denied_schema',
        ]);
    });

    it('reports the denied schema by name', () => {
        const [violation] = findSqlScopeViolations(
            'SELECT * FROM jaffle_old.x',
            denyOnly,
        );
        expect(violation).toEqual({
            kind: 'denied_schema',
            reference: 'jaffle_old.x',
            schema: 'jaffle_old',
        });
    });
});

describe('isSchemaInScope with deny lists', () => {
    it('rejects a denied schema even when the allow list is empty', () => {
        expect(
            isSchemaInScope({ schemas: [], deniedSchemas: ['old'] }, 'old'),
        ).toBe(false);
    });

    it('allows a schema that is neither allowed-listed nor denied', () => {
        expect(
            isSchemaInScope({ schemas: [], deniedSchemas: ['old'] }, 'new'),
        ).toBe(true);
    });

    it('rejects a denied catalog', () => {
        expect(
            isSchemaInScope(
                { schemas: [], deniedCatalogs: ['legacy'] },
                'jaffle',
                'legacy',
            ),
        ).toBe(false);
    });
});

describe('filterWarehouseCatalogToScope with deny lists', () => {
    const catalog = {
        prod: { jaffle: { orders: {} }, jaffle_old: { stale: {} } },
        legacy: { jaffle: { ancient: {} } },
    };

    it('drops only the denied schema, keeping everything else', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, {
                schemas: [],
                deniedSchemas: ['jaffle_old'],
            }),
        ).toEqual({
            prod: { jaffle: { orders: {} } },
            legacy: { jaffle: { ancient: {} } },
        });
    });

    it('drops a denied catalog entirely', () => {
        expect(
            filterWarehouseCatalogToScope(catalog, {
                schemas: [],
                deniedCatalogs: ['legacy'],
            }),
        ).toEqual({
            prod: { jaffle: { orders: {} }, jaffle_old: { stale: {} } },
        });
    });
});

describe('formatSqlScopeError with deny lists', () => {
    it('says the schema is excluded rather than not-allowed', () => {
        const scopeWithDeny: SqlScope = {
            schemas: [],
            deniedSchemas: ['jaffle_old'],
        };
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM jaffle_old.x', scopeWithDeny),
            scopeWithDeny,
        );
        expect(message).toContain('excluded');
        expect(message).toContain('jaffle_old');
    });

    it('does not claim an allow list when there is none', () => {
        const scopeWithDeny: SqlScope = {
            schemas: [],
            deniedSchemas: ['jaffle_old'],
        };
        const message = formatSqlScopeError(
            findSqlScopeViolations('SELECT * FROM jaffle_old.x', scopeWithDeny),
            scopeWithDeny,
        );
        expect(message).not.toContain('Allowed schemas:');
    });
});
