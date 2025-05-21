import {
    type AiAgent,
    AiAgentSummary,
    baseAgentSchema,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiAgentIntegrationTableName,
    AiAgentSlackIntegrationTableName,
    AiAgentTableName,
} from '../database/entities/aiAgent';
import { AiAgentNotFoundError } from '../services/AiService/utils/errors';

type Dependencies = {
    database: Knex;
};

export class AiAgentModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async findAllAgents({ organizationUuid }: { organizationUuid: string }) {
        const rows = await this.database(AiAgentTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');

        const agents = rows.map<Omit<AiAgentSummary, 'integrations'>>(
            (row) => ({
                uuid: row.ai_agent_uuid,
                projectUuid: row.project_uuid,
                organizationUuid: row.organization_uuid,
                name: row.name,
                tags: row.tags,
            }),
        );

        return agents;
    }

    async findAllIntegrations({
        agentUuid,
    }: {
        agentUuid: string;
    }): Promise<AiAgentSummary['integrations']> {
        const integrations = await this.database(AiAgentIntegrationTableName)
            .where('ai_agent_uuid', agentUuid)
            .leftJoin(
                AiAgentSlackIntegrationTableName,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .select<{
                type: string;
                channelId: string;
            }>({
                type: `${AiAgentIntegrationTableName}.integration_type`,
                channelId: `${AiAgentSlackIntegrationTableName}.slack_channel_id`,
            });

        const parsedIntegrations =
            baseAgentSchema.shape.integrations.parse(integrations);

        return parsedIntegrations;
    }

    async getAgentBySlackChannelId({
        organizationUuid,
        slackChannelId,
    }: {
        organizationUuid: string;
        slackChannelId: string;
    }): Promise<AiAgent> {
        // TODO: when `getAgent(uuid: string)` is implemented, this should use it instead
        const agent = await this.database(AiAgentTableName)
            .select({
                uuid: `${AiAgentTableName}.ai_agent_uuid`,
                organizationUuid: `${AiAgentTableName}.organization_uuid`,
                projectUuid: `${AiAgentTableName}.project_uuid`,
                name: `${AiAgentTableName}.name`,
                tags: `${AiAgentTableName}.tags`,
                integrations: this.database.raw(`
                    json_agg(
                        json_build_object(
                            'type', ${AiAgentIntegrationTableName}.integration_type,
                            'channelId', ${AiAgentSlackIntegrationTableName}.slack_channel_id
                        )
                    )
                `),
            } satisfies Record<keyof AiAgent, unknown>)
            .join(
                AiAgentIntegrationTableName,
                `${AiAgentTableName}.ai_agent_uuid`,
                `${AiAgentIntegrationTableName}.ai_agent_uuid`,
            )
            .join(
                AiAgentSlackIntegrationTableName,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .where({
                [`${AiAgentTableName}.organization_uuid`]: organizationUuid,
                [`${AiAgentSlackIntegrationTableName}.slack_channel_id`]:
                    slackChannelId,
            })
            .groupBy(`${AiAgentTableName}.ai_agent_uuid`)
            .first();

        if (!agent) {
            throw new AiAgentNotFoundError(
                `AI agent not found for slack channel ID: ${slackChannelId}`,
            );
        }

        return agent;
    }
}
