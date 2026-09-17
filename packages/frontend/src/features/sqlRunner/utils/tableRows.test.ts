import {
    PartitionType,
    WarehouseTableType,
    type WarehouseListedDatabase,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildWarehouseTreeRows,
    catalogHasViews,
    collectEnabledUnits,
    defaultExpandedRowIds,
    qualifiedTableName,
    type TableUnitState,
    type TreeConnection,
} from './tableRows';

const CONNECTION_ID = 'connection-1';

const partitionColumn = {
    field: 'created_at',
    partitionType: PartitionType.DATE,
};

// Athena: one Glue catalog, one listed entry per Glue database
const athenaDatabases: WarehouseListedDatabase[] = [
    {
        name: 'jaffle',
        database: 'AwsDataCatalog',
        schema: 'jaffle',
        isDefault: true,
    },
    {
        name: 'staging',
        database: 'AwsDataCatalog',
        schema: 'staging',
        isDefault: false,
    },
];

// Postgres: one listed entry per database, spanning every schema
const postgresDatabases: WarehouseListedDatabase[] = [
    { name: 'analytics', database: 'analytics', schema: null, isDefault: true },
    { name: 'raw', database: 'raw', schema: null, isDefault: false },
];

const athenaCatalog: WarehouseTablesCatalog = {
    AwsDataCatalog: {
        jaffle: {
            customers: {},
            orders: { partitionColumn },
            payments: { tableType: WarehouseTableType.VIEW },
        },
    },
};

const stagingCatalog: WarehouseTablesCatalog = {
    AwsDataCatalog: { staging: { stg_orders: {} } },
};

const analyticsCatalog: WarehouseTablesCatalog = {
    analytics: {
        public: { customers: {} },
        marts: { dim_customers: {} },
    },
};

const rawCatalog: WarehouseTablesCatalog = {
    raw: { public: { customers: {} } },
};

const connection = (
    databases: WarehouseListedDatabase[],
    options: { truncated?: boolean; limit?: number } = {},
): TreeConnection => ({
    connectionId: CONNECTION_ID,
    connectionName: 'Warehouse',
    databases,
    truncated: options.truncated ?? false,
    limit: options.limit ?? 100,
});

const loaded = (catalog: WarehouseTablesCatalog): TableUnitState => ({
    status: 'loaded',
    catalog,
});

const build = (args: {
    connections: TreeConnection[];
    units?: Record<string, TableUnitState>;
    expanded?: string[];
    search?: string;
    typeFilter?: 'tables' | 'views' | null;
}) =>
    buildWarehouseTreeRows({
        connections: args.connections,
        getUnitState: (name) => args.units?.[name] ?? { status: 'idle' },
        isExpanded: (rowId) => (args.expanded ?? []).includes(rowId),
        search: args.search ?? '',
        typeFilter: args.typeFilter ?? null,
    });

describe('buildWarehouseTreeRows', () => {
    it('hides the connection level for a single connection', () => {
        const rows = build({ connections: [connection(athenaDatabases)] });

        expect(rows.some((row) => row.type === 'connection')).toBe(false);
        expect(rows.map((row) => row.id)).toEqual([
            `database:${CONNECTION_ID}/AwsDataCatalog`,
        ]);
        expect(rows[0]).toMatchObject({ depth: 0, isExpanded: false });
    });

    it('shows the connection level for several connections', () => {
        const rows = build({
            connections: [
                connection(athenaDatabases),
                { ...connection(postgresDatabases), connectionId: 'other' },
            ],
        });

        expect(rows.map((row) => ({ type: row.type, id: row.id }))).toEqual([
            { type: 'connection', id: `connection:${CONNECTION_ID}` },
            { type: 'connection', id: 'connection:other' },
        ]);
    });

    it('lists Athena schema entries under their catalog and loads one at a time', () => {
        const rows = build({
            connections: [connection(athenaDatabases)],
            units: { jaffle: loaded(athenaCatalog) },
            expanded: [
                `database:${CONNECTION_ID}/AwsDataCatalog`,
                `schema:${CONNECTION_ID}/AwsDataCatalog/jaffle`,
            ],
        });

        expect(rows.map((row) => row.id)).toEqual([
            `database:${CONNECTION_ID}/AwsDataCatalog`,
            `schema:${CONNECTION_ID}/AwsDataCatalog/jaffle`,
            `table:${CONNECTION_ID}/AwsDataCatalog/jaffle/customers`,
            `table:${CONNECTION_ID}/AwsDataCatalog/jaffle/orders`,
            `table:${CONNECTION_ID}/AwsDataCatalog/jaffle/payments`,
            `schema:${CONNECTION_ID}/AwsDataCatalog/staging`,
        ]);
        expect(rows[3]).toEqual({
            type: 'table',
            id: `table:${CONNECTION_ID}/AwsDataCatalog/jaffle/orders`,
            depth: 2,
            identity: {
                connectionId: CONNECTION_ID,
                database: 'AwsDataCatalog',
                schema: 'jaffle',
                table: 'orders',
            },
            partitionColumn,
            tableType: undefined,
        });
        expect(rows[5]).toMatchObject({
            type: 'schema',
            listedDatabase: 'staging',
            childCount: null,
        });
    });

    it('derives schema rows from a Postgres database once its tables load', () => {
        const rows = build({
            connections: [connection(postgresDatabases)],
            units: { analytics: loaded(analyticsCatalog) },
            expanded: [
                `database:${CONNECTION_ID}/analytics`,
                `schema:${CONNECTION_ID}/analytics/public`,
            ],
        });

        expect(rows.map((row) => row.id)).toEqual([
            `database:${CONNECTION_ID}/analytics`,
            `schema:${CONNECTION_ID}/analytics/public`,
            `table:${CONNECTION_ID}/analytics/public/customers`,
            `schema:${CONNECTION_ID}/analytics/marts`,
            `database:${CONNECTION_ID}/raw`,
        ]);
        expect(rows[0]).toMatchObject({
            listedDatabase: 'analytics',
            childCount: 2,
        });
        expect(rows[1]).toMatchObject({ listedDatabase: null });
    });

    it('shows a loading row while an expanded unit loads', () => {
        const rows = build({
            connections: [connection(postgresDatabases)],
            units: { analytics: { status: 'loading' } },
            expanded: [`database:${CONNECTION_ID}/analytics`],
        });

        expect(rows.map((row) => row.type)).toEqual([
            'database',
            'loading',
            'database',
        ]);
    });

    it('shows a retryable error row and keeps every other database', () => {
        const rows = build({
            connections: [connection(postgresDatabases)],
            units: {
                analytics: { status: 'error', message: 'Access denied' },
                raw: loaded(rawCatalog),
            },
            expanded: [
                `database:${CONNECTION_ID}/analytics`,
                `database:${CONNECTION_ID}/raw`,
            ],
        });

        expect(rows[1]).toEqual({
            type: 'error',
            id: `error:database:${CONNECTION_ID}/analytics`,
            depth: 1,
            listedDatabase: 'analytics',
            message: 'Access denied',
        });
        expect(rows.map((row) => row.id)).toContain(
            `schema:${CONNECTION_ID}/raw/public`,
        );
    });

    it('keeps row ids unique across two databases sharing a schema name', () => {
        const rows = build({
            connections: [connection(postgresDatabases)],
            units: {
                analytics: loaded(analyticsCatalog),
                raw: loaded(rawCatalog),
            },
            expanded: [
                `database:${CONNECTION_ID}/analytics`,
                `database:${CONNECTION_ID}/raw`,
                `schema:${CONNECTION_ID}/analytics/public`,
                `schema:${CONNECTION_ID}/raw/public`,
            ],
        });

        const ids = rows.map((row) => row.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain(
            `table:${CONNECTION_ID}/analytics/public/customers`,
        );
        expect(ids).toContain(`table:${CONNECTION_ID}/raw/public/customers`);
    });

    it('renders a truncation row when the listing was capped', () => {
        const rows = build({
            connections: [
                connection(postgresDatabases, { truncated: true, limit: 100 }),
            ],
        });

        expect(rows[rows.length - 1]).toEqual({
            type: 'truncation',
            id: `truncation:${CONNECTION_ID}`,
            depth: 0,
            limit: 100,
        });
    });

    it('matches an unloaded listed database by name', () => {
        const rows = build({
            connections: [connection(athenaDatabases)],
            units: { jaffle: loaded(athenaCatalog) },
            search: 'staging',
        });

        expect(rows.map((row) => row.id)).toEqual([
            `database:${CONNECTION_ID}/AwsDataCatalog`,
            `schema:${CONNECTION_ID}/AwsDataCatalog/staging`,
        ]);
        expect(rows[1]).toMatchObject({ isExpanded: false, childCount: null });
    });

    it('fuzzy matches loaded tables and drops schemas without a match', () => {
        const rows = build({
            connections: [connection(athenaDatabases)],
            units: {
                jaffle: loaded(athenaCatalog),
                staging: loaded(stagingCatalog),
            },
            search: 'payments',
        });

        expect(rows.map((row) => row.id)).toEqual([
            `database:${CONNECTION_ID}/AwsDataCatalog`,
            `schema:${CONNECTION_ID}/AwsDataCatalog/jaffle`,
            `table:${CONNECTION_ID}/AwsDataCatalog/jaffle/payments`,
        ]);
    });

    it('applies the type filter to loaded tables', () => {
        const rows = build({
            connections: [connection(athenaDatabases)],
            units: { jaffle: loaded(athenaCatalog) },
            typeFilter: 'views',
        });

        expect(rows.map((row) => row.id)).toEqual([
            `database:${CONNECTION_ID}/AwsDataCatalog`,
            `schema:${CONNECTION_ID}/AwsDataCatalog/jaffle`,
            `table:${CONNECTION_ID}/AwsDataCatalog/jaffle/payments`,
            `schema:${CONNECTION_ID}/AwsDataCatalog/staging`,
        ]);
    });

    it('keeps ClickHouse schemas at the top level when the database is empty', () => {
        const rows = build({
            connections: [
                connection([
                    {
                        name: 'default',
                        database: '',
                        schema: null,
                        isDefault: true,
                    },
                ]),
            ],
            units: {
                default: loaded({ '': { default: { events: {} } } }),
            },
            expanded: [`schema:${CONNECTION_ID}//default`],
        });

        expect(
            rows.map((row) => ({ type: row.type, depth: row.depth })),
        ).toEqual([
            { type: 'schema', depth: 0 },
            { type: 'table', depth: 1 },
        ]);
    });
});

describe('collectEnabledUnits', () => {
    it('asks only for the databases the tree has expanded', () => {
        const connections = [connection(athenaDatabases)];

        expect(collectEnabledUnits(connections, () => false)).toEqual([]);
        expect(
            collectEnabledUnits(connections, (rowId) =>
                [
                    `database:${CONNECTION_ID}/AwsDataCatalog`,
                    `schema:${CONNECTION_ID}/AwsDataCatalog/jaffle`,
                ].includes(rowId),
            ),
        ).toEqual(['jaffle']);
    });

    it('asks for a Postgres database as soon as its own row expands', () => {
        expect(
            collectEnabledUnits(
                [connection(postgresDatabases)],
                (rowId) => rowId === `database:${CONNECTION_ID}/analytics`,
            ),
        ).toEqual(['analytics']);
    });
});

describe('defaultExpandedRowIds', () => {
    it('opens the default entry down to its lazy unit', () => {
        expect(defaultExpandedRowIds([connection(athenaDatabases)])).toEqual({
            [`connection:${CONNECTION_ID}`]: true,
            [`database:${CONNECTION_ID}/AwsDataCatalog`]: true,
            [`schema:${CONNECTION_ID}/AwsDataCatalog/jaffle`]: true,
        });
        expect(defaultExpandedRowIds([connection(postgresDatabases)])).toEqual({
            [`connection:${CONNECTION_ID}`]: true,
            [`database:${CONNECTION_ID}/analytics`]: true,
        });
    });
});

describe('qualifiedTableName', () => {
    it('qualifies from the row’s own database and schema', () => {
        expect(
            qualifiedTableName(
                {
                    connectionId: CONNECTION_ID,
                    database: 'raw',
                    schema: 'public',
                    table: 'customers',
                },
                '"',
            ),
        ).toBe('"raw"."public"."customers"');
    });

    it('keeps the two-part form when the database is empty', () => {
        expect(
            qualifiedTableName(
                {
                    connectionId: CONNECTION_ID,
                    database: '',
                    schema: 'default',
                    table: 'events',
                },
                '`',
            ),
        ).toBe('`default`.`events`');
    });
});

describe('catalogHasViews', () => {
    it('is true only when some table is a view or materialized view', () => {
        expect(catalogHasViews(athenaCatalog)).toBe(true);
        expect(catalogHasViews(stagingCatalog)).toBe(false);
    });
});
