import { Knex } from 'knex';

const AIThreadTableName = 'ai_thread';
const AIAgentTableName = 'ai_agent';
const AIAgentIntegrationTableName = 'ai_agent_integration';
const AIAgentSlackIntegrationTableName = 'ai_agent_slack_integration';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AIThreadTableName, (table) => {
        table
            .uuid('agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('CASCADE');
    });

    const slackMappings = await knex('slack_channel_project_mappings').select(
        'slack_channel_project_mapping_uuid',
        'project_uuid',
        'organization_uuid',
        'slack_channel_id',
        'available_tags',
    );

    for await (const mapping of slackMappings) {
        const [agent] = await knex(AIAgentTableName)
            .insert({
                project_uuid: mapping.project_uuid,
                organization_uuid: mapping.organization_uuid,
                name: '',
                description: '',
                image_url: '',
                tags: mapping.available_tags,
            })
            .returning('ai_agent_uuid');

        const [integration] = await knex(AIAgentIntegrationTableName)
            .insert({
                ai_agent_uuid: agent.ai_agent_uuid,
                integration_type: 'slack',
            })
            .returning('ai_agent_integration_uuid');

        await knex(AIAgentSlackIntegrationTableName).insert({
            ai_agent_integration_uuid: integration.ai_agent_integration_uuid,
            organization_uuid: mapping.organization_uuid,
            slack_channel_id: mapping.slack_channel_id,
        });

        await knex.raw(
            `
                UPDATE ai_thread t
                SET
                    agent_uuid = ?
                FROM
                    ai_slack_thread st
                WHERE
                    st.ai_thread_uuid = t.ai_thread_uuid
                    AND t.organization_uuid = ?
                    AND st.slack_channel_id = ?`,
            [
                agent.ai_agent_uuid,
                mapping.organization_uuid,
                mapping.slack_channel_id,
            ],
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AIThreadTableName, (table) => {
        table.dropForeign(['agent_uuid']);
        table.dropColumn('agent_uuid');
    });
}
