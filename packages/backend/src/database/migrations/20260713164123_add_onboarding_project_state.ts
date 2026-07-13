import { Knex } from 'knex';

const OnboardingProjectStateTableName = 'onboarding_project_state';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(OnboardingProjectStateTableName, (table) => {
        table
            .uuid('onboarding_project_state_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('step').notNullable();
        table.text('status').notNullable();
        table.jsonb('result').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'step']);
        table.index(['project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(OnboardingProjectStateTableName);
}
