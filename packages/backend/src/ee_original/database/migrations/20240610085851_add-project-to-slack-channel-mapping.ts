import { Knex } from 'knex';

export const SlackChannelProjectMappingsTable =
    'slack_channel_project_mappings';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SlackChannelProjectMappingsTable))) {
        await knex.schema.createTable(
            SlackChannelProjectMappingsTable,
            (tableBuilder) => {
                tableBuilder
                    .uuid('project_uuid')
                    .notNullable()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE');

                tableBuilder.text('slack_channel_id').notNullable();

                tableBuilder
                    .uuid('organization_uuid')
                    .notNullable()
                    .references('organization_uuid')
                    .inTable('organizations')
                    .onDelete('CASCADE');

                tableBuilder.primary(['project_uuid', 'organization_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SlackChannelProjectMappingsTable);
}
