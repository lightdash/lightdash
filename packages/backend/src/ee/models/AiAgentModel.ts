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
    DbAiAgent,
    DbAiAgentIntegration,
    DbAiAgentSlackIntegration,
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

    async getAgent({
        organizationUuid,
        agentUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
    }): Promise<AiAgentSummary> {
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
            .leftJoin(
                AiAgentIntegrationTableName,
                `${AiAgentTableName}.ai_agent_uuid`,
                `${AiAgentIntegrationTableName}.ai_agent_uuid`,
            )
            .leftJoin(
                AiAgentSlackIntegrationTableName,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .where(`${AiAgentTableName}.organization_uuid`, organizationUuid)
            .where(`${AiAgentTableName}.ai_agent_uuid`, agentUuid)
            .groupBy(`${AiAgentTableName}.ai_agent_uuid`)
            .first<AiAgent | undefined>();

        if (!agent) {
            throw new AiAgentNotFoundError(
                `AI agent not found for uuid: ${agentUuid}`,
            );
        }

        return agent;
    }

    async findAllAgents({
        organizationUuid,
    }: {
        organizationUuid: string;
    }): Promise<AiAgentSummary[]> {
        const rows = await this.database(AiAgentTableName)
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
            } satisfies Record<keyof AiAgentSummary, unknown>)
            .leftJoin(
                AiAgentIntegrationTableName,
                `${AiAgentTableName}.ai_agent_uuid`,
                `${AiAgentIntegrationTableName}.ai_agent_uuid`,
            )
            .leftJoin(
                AiAgentSlackIntegrationTableName,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .where(`${AiAgentTableName}.organization_uuid`, organizationUuid)
            .groupBy(`${AiAgentTableName}.ai_agent_uuid`);

        return rows;
    }

    async getAgentBySlackChannelId({
        organizationUuid,
        slackChannelId,
    }: {
        organizationUuid: string;
        slackChannelId: string;
    }): Promise<AiAgent> {
        const integration = await this.database(
            AiAgentSlackIntegrationTableName,
        )
            .select<
                DbAiAgentSlackIntegration &
                    Pick<DbAiAgentIntegration, 'ai_agent_uuid'>
            >(
                `${AiAgentSlackIntegrationTableName}.*`,
                `${AiAgentIntegrationTableName}.ai_agent_uuid`,
            )
            .innerJoin(
                AiAgentIntegrationTableName,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .where('slack_channel_id', slackChannelId)
            .where('organization_uuid', organizationUuid)
            .first();

        if (!integration) {
            throw new AiAgentNotFoundError(
                `AI agent not found for slack channel ID: ${slackChannelId}`,
            );
        }

        const agent = await this.getAgent({
            organizationUuid,
            agentUuid: integration.ai_agent_uuid,
        });

        return agent;
    }
}
