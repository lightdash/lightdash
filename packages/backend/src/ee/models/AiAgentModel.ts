import {
type AiAgent,
AiAgentMessage,
AiAgentSummary,
AiAgentThreadSummary,
ApiCreateAiAgent,
ApiUpdateAiAgent,
assertUnreachable,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DbUser,UserTableName } from '../../database/entities/users';
import {
AiPromptTableName,
AiThreadTableName,
DbAiPrompt,
DbAiThread,
} from '../database/entities/ai';
import {
AiAgentInstructionVersionsTableName,
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
                    COALESCE(
                        json_agg(
                            CASE WHEN ${AiAgentIntegrationTableName}.integration_type IS NOT NULL
                            THEN json_build_object(
                                'type', ${AiAgentIntegrationTableName}.integration_type,
                                'channelId', ${AiAgentSlackIntegrationTableName}.slack_channel_id
                            )
                            ELSE NULL
                            END
                        ) FILTER (WHERE ${AiAgentIntegrationTableName}.integration_type IS NOT NULL),
                        '[]'::json
                    )
                `),
                updatedAt: `${AiAgentTableName}.updated_at`,
                createdAt: `${AiAgentTableName}.created_at`,
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
                        COALESCE(
                            json_agg(
                                CASE WHEN ${AiAgentIntegrationTableName}.integration_type IS NOT NULL
                                THEN json_build_object(
                                    'type', ${AiAgentIntegrationTableName}.integration_type,
                                    'channelId', ${AiAgentSlackIntegrationTableName}.slack_channel_id
                                )
                                ELSE NULL
                                END
                            ) FILTER (WHERE ${AiAgentIntegrationTableName}.integration_type IS NOT NULL),
                            '[]'::json
                        )
                `),
                updatedAt: `${AiAgentTableName}.updated_at`,
                createdAt: `${AiAgentTableName}.created_at`,
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

    async createAgent(
        args: Pick<
            ApiCreateAiAgent,
            'name' | 'projectUuid' | 'tags' | 'integrations'
        > & {
            organizationUuid: string;
        },
    ): Promise<AiAgent> {
        return this.database.transaction(async (trx) => {
            const [agent] = await trx(AiAgentTableName)
                .insert({
                    name: args.name,
                    project_uuid: args.projectUuid,
                    organization_uuid: args.organizationUuid,
                    tags: args.tags,
                    description: null,
                    image_url: null,
                    instructions: null,
                    last_instruction_version_updated_at: null,
                    last_instruction_version_updated_by_user_uuid: null,
                })
                .returning('*');

            const integrationPromises =
                args.integrations?.map(async (integration) => {
                    switch (integration.type) {
                        case 'slack':
                            const [baseIntegration] = await trx(
                                AiAgentIntegrationTableName,
                            )
                                .insert({
                                    ai_agent_uuid: agent.ai_agent_uuid,
                                    integration_type: integration.type,
                                })
                                .returning('*');

                            await trx(AiAgentSlackIntegrationTableName).insert({
                                ai_agent_integration_uuid:
                                    baseIntegration.ai_agent_integration_uuid,
                                organization_uuid: agent.organization_uuid,
                                slack_channel_id: integration.channelId,
                            });

                            return {
                                type: integration.type,
                                channelId: integration.channelId,
                            };
                        default:
                            return assertUnreachable(
                                integration.type,
                                `Unknown integration type ${integration.type} in createAgent`,
                            );
                    }
                }) || [];

            const integrations = await Promise.all(integrationPromises);

            return {
                uuid: agent.ai_agent_uuid,
                name: agent.name,
                projectUuid: agent.project_uuid,
                organizationUuid: agent.organization_uuid,
                tags: agent.tags,
                integrations,
                createdAt: agent.created_at,
                updatedAt: agent.updated_at,
            };
        });
    }

    async updateAgent(
        args: Omit<ApiUpdateAiAgent, 'uuid'> & {
            agentUuid: string;
            organizationUuid: string;
        },
    ): Promise<AiAgent> {
        return this.database.transaction(async (trx) => {
            const [agent] = await trx(AiAgentTableName)
                .where({
                    ai_agent_uuid: args.agentUuid,
                    organization_uuid: args.organizationUuid,
                })
                .update({
                    name: args.name,
                    project_uuid: args.projectUuid,
                    tags: args.tags,
                    updated_at: new Date(),
                })
                .returning('*');

            // Reset all integrations
            await trx(AiAgentIntegrationTableName)
                .where('ai_agent_uuid', args.agentUuid)
                .delete();

            const integrationPromises =
                args.integrations?.map(async (integration) => {
                    switch (integration.type) {
                        case 'slack':
                            const [baseIntegration] = await trx(
                                AiAgentIntegrationTableName,
                            )
                                .insert({
                                    ai_agent_uuid: agent.ai_agent_uuid,
                                    integration_type: integration.type,
                                })
                                .returning('*');

                            await trx(AiAgentSlackIntegrationTableName).insert({
                                ai_agent_integration_uuid:
                                    baseIntegration.ai_agent_integration_uuid,
                                organization_uuid: agent.organization_uuid,
                                slack_channel_id: integration.channelId,
                            });

                            return {
                                type: integration.type,
                                channelId: integration.channelId,
                            };
                        default:
                            return assertUnreachable(
                                integration.type,
                                `Unknown integration type ${integration.type} in updateAgent`,
                            );
                    }
                }) || [];

            const integrations = await Promise.all(integrationPromises);

            return {
                uuid: agent.ai_agent_uuid,
                name: agent.name,
                projectUuid: agent.project_uuid,
                organizationUuid: agent.organization_uuid,
                tags: agent.tags,
                integrations,
                createdAt: agent.created_at,
                updatedAt: agent.updated_at,
            };
        });
    }

    async deleteAgent({
        organizationUuid,
        agentUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
    }): Promise<void> {
        await this.database(AiAgentTableName)
            .where('ai_agent_uuid', agentUuid)
            .where('organization_uuid', organizationUuid)
            .delete();
    }

    async findThreads({
        organizationUuid,
        agentUuid,
        threadUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
        threadUuid?: string;
    }): Promise<AiAgentThreadSummary[]> {
        const query = this.database(AiThreadTableName)
            .join(
                AiPromptTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiPromptTableName}.ai_thread_uuid`,
            )
            .join(
                UserTableName,
                `${AiPromptTableName}.created_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(
                `${AiPromptTableName}.created_at`,
                this.database(AiPromptTableName)
                    .select(this.database.raw('MIN(created_at)'))
                    .whereRaw(
                        `${AiPromptTableName}.ai_thread_uuid = ${AiThreadTableName}.ai_thread_uuid`,
                    ),
            )
            .andWhere(
                `${AiThreadTableName}.organization_uuid`,
                organizationUuid,
            )
            .andWhere(`${AiThreadTableName}.agent_uuid`, agentUuid)
            .select<
                (Pick<
                    DbAiThread,
                    | 'ai_thread_uuid'
                    | 'agent_uuid'
                    | 'created_at'
                    | 'created_from'
                > &
                    Pick<DbAiPrompt, 'prompt'> &
                    Pick<DbUser, 'user_uuid'> & { user_name: string })[]
            >(
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.agent_uuid`,
                `${AiThreadTableName}.created_at`,
                `${AiThreadTableName}.created_from`,
                `${AiPromptTableName}.prompt`,
                `${UserTableName}.user_uuid`,
                this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name) as user_name`,
                ),
            )
            .orderBy(`${AiThreadTableName}.created_at`, 'desc');

        if (threadUuid) {
            void query.andWhere(
                `${AiThreadTableName}.ai_thread_uuid`,
                threadUuid,
            );
        }

        const rows = await query;

        return rows.map((row) => ({
            uuid: row.ai_thread_uuid,
            threadUuid: row.ai_thread_uuid,
            agentUuid: row.agent_uuid!,
            createdAt: row.created_at as unknown as string,
            createdFrom: row.created_from,
            firstMessage: row.prompt,
            user: {
                uuid: row.user_uuid,
                name: row.user_name,
            },
        }));
    }

    async getThread({
        organizationUuid,
        agentUuid,
        threadUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
        threadUuid: string;
    }): Promise<AiAgentThreadSummary> {
        const rows = await this.findThreads({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (rows.length !== 1) {
            throw new AiAgentNotFoundError(
                `AI agent thread not found for uuid: ${threadUuid}`,
            );
        }

        return rows[0];
    }

    async findThreadMessages({
        organizationUuid,
        threadUuid,
    }: {
        organizationUuid: string;
        threadUuid: string;
    }): Promise<AiAgentMessage[]> {
        const rows = await this.database(AiPromptTableName)
            .join(
                UserTableName,
                `${AiPromptTableName}.created_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .join(
                AiThreadTableName,
                `${AiPromptTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.ai_thread_uuid`,
            )
            .select(
                'ai_prompt_uuid',
                'prompt',
                'response',
                'responded_at',
                'filters_output',
                'viz_config_output',
                'metric_query',
                'human_score',
                'user_uuid',
                `${AiThreadTableName}.ai_thread_uuid`,
            )
            .select({
                uuid: `${AiPromptTableName}.ai_prompt_uuid`,
                created_at: `${AiPromptTableName}.created_at`,
                user_name: this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name)`,
                ),
            })
            .where(`${AiPromptTableName}.ai_thread_uuid`, threadUuid)
            .andWhere(
                `${AiThreadTableName}.organization_uuid`,
                organizationUuid,
            )
            .orderBy(`${AiPromptTableName}.created_at`, 'asc');

        return rows.flatMap((row) => {
            const messages: AiAgentMessage[] = [
                {
                    role: 'user',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,
                    message: row.prompt,
                    createdAt: row.created_at,
                    user: {
                        uuid: row.user_uuid,
                        name: row.user_name,
                    },
                },
            ];

            if (row.responded_at != null) {
                messages.push({
                    role: 'assistant',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,
                    message: row.response,
                    createdAt: row.responded_at,
                    vizConfigOutput: row.viz_config_output,
                    filtersOutput: row.filters_output,
                    metricQuery: row.metric_query,
                    humanScore: row.human_score,
                });
            }

            return messages;
        });
    }

    async deleteSlackIntegrations({
        organizationUuid,
    }: {
        organizationUuid: string;
    }): Promise<void> {
        await this.database
            .from(AiAgentIntegrationTableName)
            .delete()
            .where(
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                'IN',
                this.database
                    .from(AiAgentSlackIntegrationTableName)
                    .select(
                        `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
                    )
                    .where(
                        `${AiAgentSlackIntegrationTableName}.organization_uuid`,
                        organizationUuid,
                    ),
            );
    }

    private static async createInstructionVersion(
        trx: Knex,
        data: {
            aiAgentUuid: string;
            userUuid: string;
            instruction: string;
        },
    ): Promise<string> {
        const [{ ai_agent_instructions_version_uuid: versionUuid }] = await trx(
            AiAgentInstructionVersionsTableName,
        ).insert(
            {
                ai_agent_uuid: data.aiAgentUuid,
                instruction: data.instruction,
                created_by_user_uuid: data.userUuid,
            },
            ['ai_agent_instructions_version_uuid'],
        );

        await trx(AiAgentTableName)
            .update({
                last_instruction_version_updated_at: new Date(),
                last_instruction_version_updated_by_user_uuid: data.userUuid,
                instructions: data.instruction,
            })
            .where('ai_agent_uuid', data.aiAgentUuid);

        return versionUuid;
    }
}
