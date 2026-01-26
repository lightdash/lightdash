import { Knex } from 'knex';

const AI_ARTIFACT_VERSIONS_TABLE = 'ai_artifact_versions';

export async function up(knex: Knex): Promise<void> {
    // Add verified_by_user_uuid and verified_at columns
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.uuid('verified_by_user_uuid').nullable();
        table.timestamp('verified_at').nullable();
        table
            .foreign('verified_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.dropColumn('verified_at');
        table.dropColumn('verified_by_user_uuid');
    });
}
