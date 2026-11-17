import { type Knex } from 'knex';

const configs = 'model_materialization_configs';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(configs, (table) => {
        table
            .uuid('config_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('document_uuid')
            .notNullable()
            .unique()
            .references('project_model_document_uuid')
            .inTable('project_model_documents')
            .onDelete('CASCADE');
        table
            .uuid('desired_revision_uuid')
            .notNullable()
            .index()
            .references('project_model_revision_uuid')
            .inTable('project_model_revisions')
            .onDelete('CASCADE');
        table.text('build_fingerprint').notNullable();
        table.text('compatibility_fingerprint').notNullable();
        table.integer('policy_epoch').notNullable().defaultTo(1);
        table.integer('max_rows').notNullable().checkPositive();
        table.text('refresh_cron').nullable();
        table.boolean('refresh_on_change').notNullable();
        table.text('scheduler_timezone').notNullable();
        table.uuid('active_generation_uuid').nullable().index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTable(configs);
}
