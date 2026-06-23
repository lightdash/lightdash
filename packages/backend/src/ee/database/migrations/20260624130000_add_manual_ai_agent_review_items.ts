import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';
const usersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(reviewItemTable, (table) => {
        table
            .text('source')
            .notNullable()
            .defaultTo('ai_finding')
            .checkIn(['ai_finding', 'manual']);
        table.text('title').nullable();
        table.text('description').nullable();
        table.text('primary_root_cause').nullable();
        table
            .text('priority')
            .notNullable()
            .defaultTo('none')
            .checkIn(['urgent', 'high', 'medium', 'low', 'none']);
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(reviewItemTable, (table) => {
        table.dropColumn('created_by_user_uuid');
        table.dropColumn('priority');
        table.dropColumn('primary_root_cause');
        table.dropColumn('description');
        table.dropColumn('title');
        table.dropColumn('source');
    });
}
