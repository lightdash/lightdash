import { Knex } from 'knex';

const EMBEDDING_TABLE_NAME = 'embedding';
const fields = {
    allow_all_apps: 'allow_all_apps',
    app_uuids: 'app_uuids',
};

export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(
            EMBEDDING_TABLE_NAME,
            fields.allow_all_apps,
        ))
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            // Broad opt-in: secure-by-default, standalone data-app embeds are
            // off until a project admin explicitly enables them.
            table.boolean(fields.allow_all_apps).notNullable().defaultTo(false);
        });
    }
    if (
        !(await knex.schema.hasColumn(EMBEDDING_TABLE_NAME, fields.app_uuids))
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            // Per-app allowlist for standalone data-app embeds, mirroring
            // chart_uuids.
            table
                .specificType(fields.app_uuids, 'text[]')
                .notNullable()
                .defaultTo('{}');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(EMBEDDING_TABLE_NAME, fields.app_uuids)) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.dropColumn(fields.app_uuids);
        });
    }
    if (
        await knex.schema.hasColumn(EMBEDDING_TABLE_NAME, fields.allow_all_apps)
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.dropColumn(fields.allow_all_apps);
        });
    }
}
