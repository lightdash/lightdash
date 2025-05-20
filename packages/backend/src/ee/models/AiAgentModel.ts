import { type AiAgent } from '@lightdash/common';
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

    async getAgentBySlackChannelId({
        organizationUuid,
        slackChannelId,
    }: {
        organizationUuid: string;
        slackChannelId: string;
    }): Promise<AiAgent> {
        // TODO: when `getAgent(uuid: string) is implemented, this should use it instead
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
                    )`),
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
