import { Knex } from 'knex';

export const SlackChannelProjectMappingsTable =
    'slack_channel_project_mappings';

export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(
            SlackChannelProjectMappingsTable,
            'available_tags',
        ))
    ) {
        await knex.schema.table(
            SlackChannelProjectMappingsTable,
            (tableBuilder) => {
                tableBuilder
                    .specificType('available_tags', 'text[]')
                    .nullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(
        SlackChannelProjectMappingsTable,
        (tableBuilder) => {
            tableBuilder.dropColumn('available_tags');
        },
    );
}
