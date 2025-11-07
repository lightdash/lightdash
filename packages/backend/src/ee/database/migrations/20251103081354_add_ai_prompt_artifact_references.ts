import { Knex } from 'knex';

const AI_PROMPT_ARTIFACT_REFERENCES_TABLE = 'ai_prompt_artifact_references';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        AI_PROMPT_ARTIFACT_REFERENCES_TABLE,
        (table) => {
            table.uuid('ai_prompt_uuid').notNullable();
            table.uuid('ai_artifact_version_uuid').notNullable();
            table.uuid('project_uuid').notNullable();
            table.float('similarity_score').nullable();
            table
                .timestamp('created_at')
                .notNullable()
                .defaultTo(knex.fn.now());

            table
                .foreign('ai_prompt_uuid')
                .references('ai_prompt_uuid')
                .inTable('ai_prompt')
                .onDelete('CASCADE');

            table
                .foreign('ai_artifact_version_uuid')
                .references('ai_artifact_version_uuid')
                .inTable('ai_artifact_versions')
                .onDelete('CASCADE');

            table
                .foreign('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');

            table.primary(['ai_prompt_uuid', 'ai_artifact_version_uuid']);

            table.index('ai_prompt_uuid');
            table.index('ai_artifact_version_uuid');
            table.index('project_uuid');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_PROMPT_ARTIFACT_REFERENCES_TABLE);
}
