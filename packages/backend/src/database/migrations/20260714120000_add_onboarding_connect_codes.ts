import { Knex } from 'knex';

const OnboardingConnectCodeTableName = 'onboarding_connect_codes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(OnboardingConnectCodeTableName, (table) => {
        table
            .uuid('onboarding_connect_code_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('code_hash').notNullable().unique();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.uuid('created_by_user_uuid').notNullable();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('used_at', { useTz: true }).nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.index(['project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(OnboardingConnectCodeTableName);
}
