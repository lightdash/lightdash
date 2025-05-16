// Migration 05: Migrate data from slack_channel_project_mappings to agents
import { Knex } from 'knex';

interface SlackMapping {
    project_uuid: string;
    organization_uuid: string;
    slack_channel_id: string;
    available_tags: string[] | null;
}

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('slack_channel_project_mappings'))) return;

    const slackMappings = await knex('slack_channel_project_mappings').select(
        'slack_channel_project_mapping_uuid',
        'project_uuid',
        'organization_uuid',
        'slack_channel_id',
        'available_tags',
    );

    // Process each mapping and create agents
    // Sequential is fine because there're very few rows
    for await (const mapping of slackMappings) {
        try {
            const [agent] = await knex('ai_agent')
                .insert({
                    project_uuid: mapping.project_uuid,
                    organization_uuid: mapping.organization_uuid,
                    name: `Legacy Agent`,
                    description: `Legacy agent for channel ${mapping.slack_channel_project_mapping_uuid}`,
                    data_sources: {
                        fieldNameTags: mapping.available_tags,
                    },
                })
                .returning('ai_agent_uuid');

            await knex('ai_agent_integration').insert({
                ai_agent_uuid: agent.ai_agent_uuid,
                integration_type: 'slack',
                configuration: {
                    channelId: mapping.slack_channel_id,
                },
            });
        } catch (error) {
            console.error(
                'ERROR_20250516163613_migrate_slack_channel_project_mappings_table',
                error,
            );
            // We can ignore failed migrations, as they're not critical
            // eslint-disable-next-line no-continue
            continue;
        }
    }

    // Note: We're not dropping the slack_channel_project_mappings table
    // That would be done in a separate migration later, after verification
}

export async function down(knex: Knex): Promise<void> {
    // No need for down
    // We're not removing the agents table will be dropped by parent migrations
}
