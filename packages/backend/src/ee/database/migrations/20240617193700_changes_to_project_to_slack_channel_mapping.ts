import { Knex } from 'knex';

export const SlackChannelProjectMappingsTable =
    'slack_channel_project_mappings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SlackChannelProjectMappingsTable,
        (tableBuilder) => {
            tableBuilder.dropPrimary();
            tableBuilder
                .uuid('slack_channel_project_mapping_uuid')
                .primary()
                .defaultTo(knex.raw('gen_random_uuid()'));
            tableBuilder.unique(['slack_channel_id', 'organization_uuid']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SlackChannelProjectMappingsTable,
        (tableBuilder) => {
            tableBuilder.dropUnique(['slack_channel_id', 'organization_uuid']);
            tableBuilder.dropPrimary('slack_channel_project_mapping_uuid');
            tableBuilder.primary(['project_uuid', 'organization_uuid']);
        },
    );
}
