import { Knex } from 'knex';

const AiRouterInstructionVersionsTableName = 'ai_router_instruction_versions';
const AiRouterTableName = 'ai_router';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiRouterInstructionVersionsTableName))) {
        await knex.schema.createTable(
            AiRouterInstructionVersionsTableName,
            (table) => {
                table
                    .uuid('ai_router_instruction_version_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('ai_router_uuid')
                    .notNullable()
                    .references('ai_router_uuid')
                    .inTable(AiRouterTableName)
                    .onDelete('CASCADE');
                table
                    .uuid('project_uuid')
                    .notNullable()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE');
                table.text('instruction').notNullable();
                table
                    .specificType('tagged_agent_uuids', 'uuid[]')
                    .notNullable()
                    .defaultTo(knex.raw("'{}'::uuid[]"));
                table
                    .timestamp('created_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());

                // The latest row per (router, project) is the active instruction.
                table.index(['ai_router_uuid', 'project_uuid', 'created_at']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiRouterInstructionVersionsTableName);
}
