/**
 * Regenerates src/ee/postgresWire/pgCatalog/catalogSchema.json from a real
 * PostgreSQL 16 catalog, using PGlite (WASM Postgres) so no server is needed.
 *
 * PGlite is deliberately not a dependency. Install it somewhere outside the
 * workspace and point the script at it:
 *
 *   npm install --prefix /tmp/pglite @electric-sql/pglite@0.2.17   # PostgreSQL 16.x
 *   PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
 *     node packages/backend/scripts/generateCatalogSchema.mjs
 *
 * Output: column definitions (domain columns resolved to their base types) for
 * the catalog relations the Metrics SQL API emulates, plus static pg_type
 * (scalar types and their arrays), pg_am and selected pg_settings rows.
 * Lightdash-specific additions (information_schema.columns.field_type) live
 * in catalogRelations.ts, not here.
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const pgliteModule = process.env.PGLITE ?? '@electric-sql/pglite';
if (
    pgliteModule !== '@electric-sql/pglite' &&
    !(
        pgliteModule.startsWith('/') &&
        pgliteModule.includes('/@electric-sql/pglite/')
    )
) {
    throw new Error(
        'PGLITE must be an absolute path inside an @electric-sql/pglite package',
    );
}
const { PGlite } = await import(pgliteModule);
const OUTPUT = join(
    dirname(fileURLToPath(import.meta.url)),
    '../src/ee/postgresWire/pgCatalog/catalogSchema.json',
);
const db = new PGlite();
await db.waitReady;
const PG = [
    'pg_namespace',
    'pg_class',
    'pg_attribute',
    'pg_type',
    'pg_description',
    'pg_database',
    'pg_roles',
    'pg_settings',
    'pg_am',
    'pg_attrdef',
    'pg_index',
    'pg_constraint',
    'pg_proc',
    'pg_depend',
    'pg_inherits',
    'pg_collation',
    'pg_language',
    'pg_enum',
    'pg_tablespace',
    'pg_shdescription',
    'pg_extension',
    'pg_available_extensions',
    'pg_foreign_server',
    'pg_event_trigger',
    'pg_trigger',
    'pg_rewrite',
    'pg_sequence',
    'pg_partitioned_table',
    'pg_policy',
    'pg_conversion',
    'pg_default_acl',
    'pg_range',
    'pg_opclass',
    'pg_user',
    'pg_authid',
    'pg_statistic_ext',
    'pg_foreign_data_wrapper',
    'pg_foreign_table',
    'pg_stat_user_tables',
    'pg_stat_all_tables',
    'pg_statio_user_tables',
    'pg_stats',
    'pg_tables',
    'pg_views',
    'pg_indexes',
    'pg_locks',
    'pg_stat_activity',
    'pg_matviews',
    'pg_cast',
    'pg_operator',
    'pg_aggregate',
    'pg_publication',
    'pg_publication_namespace',
    'pg_publication_rel',
    'pg_subscription',
    'pg_replication_slots',
    'pg_shadow',
    'pg_group',
    'pg_auth_members',
    'pg_seclabel',
    'pg_ts_config',
    'pg_ts_dict',
    'pg_ts_parser',
    'pg_ts_template',
    'pg_largeobject_metadata',
];
const IS = [
    'schemata',
    'tables',
    'columns',
    'views',
    'table_constraints',
    'key_column_usage',
    'referential_constraints',
    'routines',
    'sequences',
    'triggers',
    'table_privileges',
    'column_privileges',
    'constraint_column_usage',
    'check_constraints',
    'domains',
    'parameters',
    'element_types',
    'role_table_grants',
    'usage_privileges',
    'udt_privileges',
    'user_defined_types',
    'enabled_roles',
    'applicable_roles',
    'character_sets',
    'collations',
    'sql_features',
    'view_column_usage',
    'view_table_usage',
];
const relations = {};
for (const [schema, names] of [
    ['pg_catalog', PG],
    ['information_schema', IS],
]) {
    for (const name of names) {
        const r = await db.query(
            `select a.attname as name, coalesce(nullif(t.typbasetype, 0), a.atttypid) as oid, c.oid as reloid, c.relkind from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_type t on t.oid=a.atttypid where n.nspname=$1 and c.relname=$2 and a.attnum>0 and not a.attisdropped order by a.attnum`,
            [schema, name],
        );
        if (r.rows.length === 0) {
            console.error('missing', schema, name);
            continue;
        }
        relations[`${schema}.${name}`] = {
            oid: Number(r.rows[0].reloid),
            relkind: r.rows[0].relkind,
            columns: r.rows.map(({ name, oid }) => ({
                name,
                oid: Number(oid),
            })),
        };
    }
}
// pg_type rows: base + array types of common categories, in pg_catalog
const types = await db.query(
    `with scalars as (select t.oid from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='pg_catalog' and t.typcategory in ('B','N','S','D','T','U','X','P','I','V','Z','E','G','R') and t.typtype in ('b','p') and t.oid < 10000) select t.* from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='pg_catalog' and t.oid < 10000 and (t.oid in (select oid from scalars) or (t.typcategory='A' and t.typelem in (select oid from scalars))) order by t.oid`,
);
const am = await db.query(`select * from pg_catalog.pg_am order by oid`);
const settings = await db.query(
    `select * from pg_catalog.pg_settings where name in ('max_index_keys','server_version','server_version_num','server_encoding','client_encoding','search_path','standard_conforming_strings','TimeZone','DateStyle','IntervalStyle','integer_datetimes','is_superuser','lc_collate','lc_ctype','max_identifier_length','transaction_isolation','application_name','default_transaction_read_only','bytea_output','extra_float_digits','statement_timeout','lock_timeout','idle_in_transaction_session_timeout') order by name`,
);
const sanitize = (v) =>
    typeof v === 'bigint' ? Number(v) : v instanceof Date ? v.toISOString() : v;
const rowsOf = (r) =>
    r.rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k, sanitize(v)]),
        ),
    );
const out = JSON.stringify({
    generatedFrom: `PostgreSQL ${(await db.query('show server_version')).rows[0].server_version}`,
    relations,
    pgTypeRows: rowsOf(types),
    pgAmRows: rowsOf(am),
    pgSettingsRows: rowsOf(settings),
});
writeFileSync(OUTPUT, out);
console.log(
    'relations',
    Object.keys(relations).length,
    'types',
    types.rows.length,
    'am',
    am.rows.length,
    'settings',
    settings.rows.length,
    'bytes',
    out.length,
);
