import { type Knex } from 'knex';

const TABLE = 'ai_slack_artifact_deliveries';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(TABLE, (table) => {
        table
            .uuid('ai_prompt_uuid')
            .primary()
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');
        table.jsonb('render_inputs').notNullable().defaultTo('{}');
        table.jsonb('rendered_images').notNullable().defaultTo('{}');
        table.text('message_ts').nullable();
        table.integer('attempts').notNullable().defaultTo(0);
        table.text('outcome').nullable();
        table.timestamp('finished_at', { useTz: true }).nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.index(['finished_at', 'updated_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable(TABLE);
}
