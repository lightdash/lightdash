import { type Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('app_versions', (table) => {
        table.jsonb('viz_preview').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('viz_preview');
    });
}
