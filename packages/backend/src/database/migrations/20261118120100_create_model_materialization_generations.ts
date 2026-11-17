import { type Knex } from 'knex';

const configs = 'model_materialization_configs';
const generations = 'model_materialization_generations';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(generations, (table) => {
        table
            .uuid('generation_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('config_uuid')
            .notNullable()
            .index()
            .references('config_uuid')
            .inTable(configs)
            .onDelete('CASCADE');
        table
            .uuid('revision_uuid')
            .notNullable()
            .index()
            .references('project_model_revision_uuid')
            .inTable('project_model_revisions')
            .onDelete('CASCADE');
        table.integer('policy_epoch').notNullable();
        table.text('build_fingerprint').notNullable();
        table.text('compatibility_fingerprint').notNullable();
        table.text('trigger').notNullable().checkIn(['publish']);
        table
            .text('status')
            .notNullable()
            .checkIn(['building', 'ready', 'failed', 'superseded']);
        table.uuid('attempt_token').notNullable().unique();
        table.timestamp('lease_expires_at', { useTz: true }).notNullable();
        table.text('object_key').notNullable().unique();
        table.jsonb('native_schema').nullable();
        table.integer('row_count').nullable();
        table.bigInteger('byte_count').nullable();
        table.timestamp('source_read_at', { useTz: true }).nullable();
        table.timestamp('ready_at', { useTz: true }).nullable();
        table.text('failure_reason').nullable();
        table.unique(['config_uuid', 'generation_uuid']);
    });
    await knex.schema.alterTable(configs, (table) => {
        table
            .foreign(
                ['config_uuid', 'active_generation_uuid'],
                'model_materialization_active_fk',
            )
            .references(['config_uuid', 'generation_uuid'])
            .inTable(generations);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(configs, (table) => {
        table.dropForeign(
            ['config_uuid', 'active_generation_uuid'],
            'model_materialization_active_fk',
        );
    });
    await knex.schema.dropTable(generations);
}
