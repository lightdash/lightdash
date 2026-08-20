import { dataTypeName, fieldTypeOid, PG_OID } from '../pgTypes';
import { type PgWireTable } from '../types';
import catalogSchema from './catalogSchema.json';

/**
 * In-memory Postgres system catalog describing a project's explores as
 * tables, so drivers and GUI tools can browse the schema the way they would on
 * a real Postgres. Column definitions and the static type/access-method rows
 * in catalogSchema.json are generated from a real Postgres 16 catalog by
 * packages/backend/scripts/generateCatalogSchema.mjs.
 */

export type CatalogValue = string | number | boolean | null | CatalogValue[];
export type CatalogRow = Record<string, CatalogValue>;
export type CatalogColumn = { name: string; oid: number };

export type CatalogRelation = {
    schema: string;
    name: string;
    oid: number;
    relkind: string;
    columns: CatalogColumn[];
    rows: CatalogRow[];
};

export type CatalogContext = {
    /** the connection's database name, i.e. the project UUID or slug */
    databaseName: string;
    /** the connection's user name, i.e. the Lightdash email */
    userName: string;
    catalog: PgWireTable[];
};

type SchemaRelation = {
    oid: number;
    relkind: string;
    columns: CatalogColumn[];
};

type CatalogSchema = {
    relations: Record<string, SchemaRelation>;
    pgTypeRows: CatalogRow[];
    pgAmRows: CatalogRow[];
    pgSettingsRows: CatalogRow[];
};

const generated = catalogSchema as CatalogSchema;

/** The generated Postgres catalog plus Lightdash's own `information_schema.columns.field_type` */
const schema: CatalogSchema = {
    ...generated,
    relations: {
        ...generated.relations,
        'information_schema.columns': {
            ...generated.relations['information_schema.columns'],
            columns: [
                ...generated.relations['information_schema.columns'].columns,
                { name: 'field_type', oid: PG_OID.text },
            ],
        },
    },
};

export const PG_CATALOG_NAMESPACE_OID = 11;
export const PG_TOAST_NAMESPACE_OID = 99;
export const PUBLIC_NAMESPACE_OID = 2200;
export const INFORMATION_SCHEMA_NAMESPACE_OID = 13000;
const SESSION_ROLE_OID = 10;
const DATABASE_OID = 5;
const DEFAULT_TABLESPACE_OID = 1663;
const DEFAULT_COLLATION_OID = 100;
/** First OID handed to an explore; Postgres starts user objects at 16384 too */
const FIRST_EXPLORE_OID = 16384;

const ARRAY_TYPE_OIDS = new Set(
    schema.pgTypeRows
        .filter((row) => row.typelem !== 0 && row.typelem !== null)
        .map((row) => Number(row.oid)),
);

/** What an unset column holds: Postgres rarely allows NULL in catalogs */
const defaultValue = (oid: number): CatalogValue => {
    if (ARRAY_TYPE_OIDS.has(oid)) {
        return null;
    }
    switch (oid) {
        case PG_OID.bool:
            return false;
        case PG_OID.int2:
        case PG_OID.int4:
        case PG_OID.int8:
        case PG_OID.oid:
        case PG_OID.regproc:
        case PG_OID.regtype:
        case PG_OID.float4:
        case PG_OID.float8:
            return 0;
        case PG_OID.char:
        case PG_OID.name:
        case PG_OID.text:
            return '';
        default:
            return null;
    }
};

const TYPE_ROWS_BY_OID = new Map(
    schema.pgTypeRows.map((row) => [Number(row.oid), row]),
);

export const exploreOid = (catalog: PgWireTable[], name: string): number =>
    FIRST_EXPLORE_OID + catalog.findIndex((table) => table.name === name);

const relationKey = (schemaName: string, name: string): string =>
    `${schemaName}.${name}`;

/** Fill a row with defaults for every column of `relation`, then the given values */
const makeRow = (columns: CatalogColumn[], values: CatalogRow): CatalogRow =>
    Object.fromEntries(
        columns.map((column) => [
            column.name,
            column.name in values
                ? values[column.name]
                : defaultValue(column.oid),
        ]),
    );

const NAMESPACES: { oid: number; nspname: string }[] = [
    { oid: PG_CATALOG_NAMESPACE_OID, nspname: 'pg_catalog' },
    { oid: PG_TOAST_NAMESPACE_OID, nspname: 'pg_toast' },
    { oid: PUBLIC_NAMESPACE_OID, nspname: 'public' },
    { oid: INFORMATION_SCHEMA_NAMESPACE_OID, nspname: 'information_schema' },
];

const namespaceOid = (schemaName: string): number =>
    NAMESPACES.find((n) => n.nspname === schemaName)?.oid ??
    PUBLIC_NAMESPACE_OID;

type RowBuilders = Record<string, (context: CatalogContext) => CatalogRow[]>;

const pgClassRows = ({ catalog }: CatalogContext): CatalogRow[] => [
    ...catalog.map((table, index) => ({
        oid: FIRST_EXPLORE_OID + index,
        relname: table.name,
        relnamespace: PUBLIC_NAMESPACE_OID,
        reltype: 0,
        relowner: SESSION_ROLE_OID,
        relam: 2, // heap
        reltablespace: 0,
        relpages: 0,
        reltuples: -1,
        relallvisible: 0,
        reltoastrelid: 0,
        relhasindex: false,
        relisshared: false,
        relpersistence: 'p',
        relkind: 'r',
        relnatts: table.fields.length,
        relchecks: 0,
        relhasrules: false,
        relhastriggers: false,
        relhassubclass: false,
        relrowsecurity: false,
        relforcerowsecurity: false,
        relispopulated: true,
        relreplident: 'd',
        relispartition: false,
        relfrozenxid: 0,
        relminmxid: 0,
    })),
    // the catalog relations themselves, so "pg_catalog" can be browsed
    ...Object.entries(schema.relations).map(([key, relation]) => {
        const [schemaName, name] = key.split('.');
        return {
            oid: relation.oid,
            relname: name,
            relnamespace: namespaceOid(schemaName),
            relowner: SESSION_ROLE_OID,
            relam: relation.relkind === 'r' ? 2 : 0,
            relisshared: false,
            relpersistence: 'p',
            relkind: relation.relkind,
            relnatts: relation.columns.length,
            relispopulated: true,
            relreplident: 'n',
            reltuples: -1,
        };
    }),
];

const pgAttributeRows = ({ catalog }: CatalogContext): CatalogRow[] =>
    catalog.flatMap((table, tableIndex) =>
        table.fields.map((field, index) => {
            const atttypid = fieldTypeOid(field.type);
            const typeRow = TYPE_ROWS_BY_OID.get(atttypid);
            return {
                attrelid: FIRST_EXPLORE_OID + tableIndex,
                attname: field.fieldId,
                atttypid,
                attlen: typeRow?.typlen ?? -1,
                attnum: index + 1,
                atttypmod: -1,
                attndims: 0,
                attbyval: typeRow?.typbyval ?? false,
                attalign: typeRow?.typalign ?? 'i',
                attstorage: typeRow?.typstorage ?? 'p',
                attnotnull: false,
                atthasdef: false,
                atthasmissing: false,
                attidentity: '',
                attgenerated: '',
                attisdropped: false,
                attislocal: true,
                attinhcount: 0,
                attcollation:
                    atttypid === PG_OID.text ? DEFAULT_COLLATION_OID : 0,
            };
        }),
    );

const pgDescriptionRows = ({ catalog }: CatalogContext): CatalogRow[] =>
    catalog.flatMap((table, tableIndex) => [
        ...(table.description
            ? [
                  {
                      objoid: FIRST_EXPLORE_OID + tableIndex,
                      classoid: schema.relations['pg_catalog.pg_class'].oid,
                      objsubid: 0,
                      description: table.description,
                  },
              ]
            : []),
        ...table.fields.flatMap((field, index) =>
            field.description
                ? [
                      {
                          objoid: FIRST_EXPLORE_OID + tableIndex,
                          classoid: schema.relations['pg_catalog.pg_class'].oid,
                          objsubid: index + 1,
                          description: field.description,
                      },
                  ]
                : [],
        ),
    ]);

const SETTING_OVERRIDES: Record<string, string> = {
    server_version: '16.3 (Lightdash)',
    server_version_num: '160003',
    search_path: '"$user", public',
    TimeZone: 'UTC',
    DateStyle: 'ISO, MDY',
    application_name: '',
    is_superuser: 'off',
};

const pgSettingsRows = (): CatalogRow[] =>
    schema.pgSettingsRows.map((row) => {
        const name = String(row.name);
        return name in SETTING_OVERRIDES
            ? {
                  ...row,
                  setting: SETTING_OVERRIDES[name],
                  reset_val: SETTING_OVERRIDES[name],
              }
            : row;
    });

const roleRow = ({ userName }: CatalogContext): CatalogRow => ({
    oid: SESSION_ROLE_OID,
    rolname: userName,
    rolsuper: false,
    rolinherit: true,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: true,
    rolreplication: false,
    rolconnlimit: -1,
    rolpassword: null,
    rolbypassrls: false,
    usename: userName,
    usesysid: SESSION_ROLE_OID,
    usecreatedb: false,
    usesuper: false,
    userepl: false,
    usebypassrls: false,
    passwd: null,
});

const databaseRow = ({ databaseName }: CatalogContext): CatalogRow => ({
    oid: DATABASE_OID,
    datname: databaseName,
    datdba: SESSION_ROLE_OID,
    encoding: 6,
    datlocprovider: 'c',
    datistemplate: false,
    datallowconn: true,
    dathasloginevt: false,
    datconnlimit: -1,
    datfrozenxid: 0,
    datminmxid: 0,
    dattablespace: DEFAULT_TABLESPACE_OID,
    datcollate: 'C',
    datctype: 'C',
});

// explores only, as before: the catalog relations are browsable through pg_class
const informationSchemaTables = ({
    databaseName,
    catalog,
}: CatalogContext): CatalogRow[] =>
    catalog.map((table) => ({
        table_catalog: databaseName,
        table_schema: 'public',
        table_name: table.name,
        table_type: 'BASE TABLE',
        is_insertable_into: 'NO',
        is_typed: 'NO',
    }));

const informationSchemaColumns = ({
    databaseName,
    catalog,
}: CatalogContext): CatalogRow[] =>
    catalog.flatMap((table) =>
        table.fields.map((field, index) => {
            const oid = fieldTypeOid(field.type);
            return {
                table_catalog: databaseName,
                table_schema: 'public',
                table_name: table.name,
                column_name: field.fieldId,
                ordinal_position: index + 1,
                is_nullable: 'YES',
                data_type: dataTypeName(field.type),
                udt_catalog: databaseName,
                udt_schema: 'pg_catalog',
                udt_name: String(TYPE_ROWS_BY_OID.get(oid)?.typname ?? 'text'),
                is_self_referencing: 'NO',
                is_identity: 'NO',
                is_generated: 'NEVER',
                is_updatable: 'NO',
                field_type: field.kind,
            };
        }),
    );

/**
 * Never-analyzed table statistics, as real Postgres reports for fresh tables;
 * Domo Cloud Amplifier and similar tools read these when registering a table.
 */
const statRows = ({ catalog }: CatalogContext): CatalogRow[] =>
    catalog.map((table, index) => ({
        relid: FIRST_EXPLORE_OID + index,
        schemaname: 'public',
        relname: table.name,
        n_live_tup: 0,
        n_dead_tup: 0,
        n_mod_since_analyze: 0,
        n_ins_since_vacuum: 0,
    }));

const ROW_BUILDERS: RowBuilders = {
    'pg_catalog.pg_namespace': () =>
        NAMESPACES.map((n) => ({ ...n, nspowner: SESSION_ROLE_OID })),
    'pg_catalog.pg_class': pgClassRows,
    'pg_catalog.pg_attribute': pgAttributeRows,
    'pg_catalog.pg_type': () => schema.pgTypeRows,
    'pg_catalog.pg_description': pgDescriptionRows,
    'pg_catalog.pg_database': (context) => [databaseRow(context)],
    'pg_catalog.pg_roles': (context) => [roleRow(context)],
    'pg_catalog.pg_user': (context) => [roleRow(context)],
    'pg_catalog.pg_authid': (context) => [roleRow(context)],
    'pg_catalog.pg_shadow': (context) => [roleRow(context)],
    'pg_catalog.pg_settings': pgSettingsRows,
    'pg_catalog.pg_am': () => schema.pgAmRows,
    'pg_catalog.pg_tablespace': () => [
        {
            oid: DEFAULT_TABLESPACE_OID,
            spcname: 'pg_default',
            spcowner: SESSION_ROLE_OID,
        },
        { oid: 1664, spcname: 'pg_global', spcowner: SESSION_ROLE_OID },
    ],
    'pg_catalog.pg_collation': () =>
        [
            ['default', DEFAULT_COLLATION_OID, 'd'],
            ['C', 950, 'c'],
            ['POSIX', 951, 'c'],
        ].map(([collname, oid, collprovider]) => ({
            oid,
            collname,
            collnamespace: PG_CATALOG_NAMESPACE_OID,
            collowner: SESSION_ROLE_OID,
            collprovider,
            collisdeterministic: true,
            collencoding: -1,
            collcollate: collname === 'default' ? null : collname,
            collctype: collname === 'default' ? null : collname,
        })),
    'pg_catalog.pg_language': () => [
        {
            oid: 12,
            lanname: 'internal',
            lanowner: SESSION_ROLE_OID,
            lanispl: false,
            lanpltrusted: false,
        },
        {
            oid: 13,
            lanname: 'c',
            lanowner: SESSION_ROLE_OID,
            lanispl: false,
            lanpltrusted: false,
        },
        {
            oid: 14,
            lanname: 'sql',
            lanowner: SESSION_ROLE_OID,
            lanispl: false,
            lanpltrusted: true,
        },
    ],
    'pg_catalog.pg_tables': ({ catalog, userName }) =>
        catalog.map((table) => ({
            schemaname: 'public',
            tablename: table.name,
            tableowner: userName,
            hasindexes: false,
            hasrules: false,
            hastriggers: false,
            rowsecurity: false,
        })),
    'pg_catalog.pg_stat_user_tables': statRows,
    'pg_catalog.pg_stat_all_tables': statRows,
    'information_schema.schemata': ({ databaseName }) =>
        NAMESPACES.filter((n) => n.nspname !== 'pg_toast').map((n) => ({
            catalog_name: databaseName,
            schema_name: n.nspname,
            schema_owner: 'lightdash',
        })),
    'information_schema.tables': informationSchemaTables,
    'information_schema.columns': informationSchemaColumns,
};

/** Every emulated relation with its rows for this session; relations without a builder are empty */
export const buildCatalogRelations = (
    context: CatalogContext,
): Map<string, CatalogRelation> =>
    new Map(
        Object.entries(schema.relations).map(([key, relation]) => {
            const [schemaName, name] = key.split('.');
            const rows = (ROW_BUILDERS[key] ?? (() => []))(context).map((row) =>
                makeRow(relation.columns, row),
            );
            return [
                key,
                {
                    schema: schemaName,
                    name,
                    oid: relation.oid,
                    relkind: relation.relkind,
                    columns: relation.columns,
                    rows,
                },
            ];
        }),
    );

export const isCatalogSchema = (schemaName: string): boolean =>
    schemaName === 'pg_catalog' || schemaName === 'information_schema';

/** Resolve a (possibly unqualified) relation name the way search_path would */
export const resolveCatalogRelation = (
    relations: Map<string, CatalogRelation>,
    schemaName: string | undefined,
    name: string,
): CatalogRelation | null => {
    if (schemaName) {
        return relations.get(relationKey(schemaName, name)) ?? null;
    }
    return relations.get(relationKey('pg_catalog', name)) ?? null;
};

/** The OID a `'name'::regclass` cast resolves to */
export const regclassOid = (
    relations: Map<string, CatalogRelation>,
    catalog: PgWireTable[],
    text: string,
): number | null => {
    const [schemaName, name] = text.includes('.')
        ? text.split('.', 2)
        : [undefined, text];
    const unquoted = name.replace(/^"|"$/g, '');
    const relation = resolveCatalogRelation(relations, schemaName, unquoted);
    if (relation) {
        return relation.oid;
    }
    const index = catalog.findIndex((table) => table.name === unquoted);
    return index === -1 ? null : FIRST_EXPLORE_OID + index;
};
