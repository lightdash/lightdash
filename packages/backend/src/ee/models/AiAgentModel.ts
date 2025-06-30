import {
    AiAgentMessage,
    AiAgentMessageAssistant,
    AiAgentMessageUser,
    AiAgentNotFoundError,
    AiAgentSummary,
    AiAgentThreadSummary,
    AiAgentUser,
    AiAgentUserPreferences,
    AiThread,
    AiWebAppPrompt,
    ApiCreateAiAgent,
    ApiUpdateAiAgent,
    assertUnreachable,
    CreateSlackPrompt,
    CreateSlackThread,
    CreateWebAppPrompt,
    CreateWebAppThread,
    isToolName,
    SlackPrompt,
    ToolName,
    UpdateSlackResponse,
    UpdateSlackResponseTs,
    UpdateWebAppResponse,
    type AiAgent,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DbUser, UserTableName } from '../../database/entities/users';
import {
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    AiPromptTableName,
    AiSlackPromptTableName,
    AiSlackThreadTableName,
    AiThreadTableName,
    AiWebAppPromptTableName,
    AiWebAppThreadTableName,
    DbAiAgentToolCall,
    DbAiAgentToolResult,
    DbAiPrompt,
    DbAiSlackPrompt,
    DbAiSlackThread,
    DbAiThread,
    DbAiWebAppPrompt,
} from '../database/entities/ai';
import {
    AiAgentInstructionVersionsTableName,
    AiAgentIntegrationTableName,
    AiAgentSlackIntegrationTableName,
    AiAgentTableName,
    DbAiAgentIntegration,
    DbAiAgentSlackIntegration,
} from '../database/entities/aiAgent';
import { AiAgentUserPreferencesTableName } from '../database/entities/aiAgentUserPreferences';

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
        projectUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
        projectUuid?: string;
    }): Promise<AiAgentSummary> {
        const query = this.database(AiAgentTableName)
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
                instruction: this.database.raw(`
                    (SELECT instruction FROM ${AiAgentInstructionVersionsTableName}
                     WHERE ${AiAgentInstructionVersionsTableName}.ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid
                     ORDER BY created_at DESC LIMIT 1)
                    `),
                imageUrl: `${AiAgentTableName}.image_url`,
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

        if (projectUuid) {
            void query.where(`${AiAgentTableName}.project_uuid`, projectUuid);
        }

        const agent = await query;

        if (!agent) {
            throw new AiAgentNotFoundError(
                `AI agent not found for uuid: ${agentUuid}`,
            );
        }

        return agent;
    }

    async findAllAgents({
        organizationUuid,
        projectUuid,
    }: {
        organizationUuid: string;
        projectUuid?: string;
    }): Promise<AiAgentSummary[]> {
        const query = this.database(AiAgentTableName)
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
                instruction: this.database.raw(`
                    (SELECT instruction FROM ${AiAgentInstructionVersionsTableName}
                     WHERE ${AiAgentInstructionVersionsTableName}.ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid
                     ORDER BY created_at DESC LIMIT 1)
                    `),
                imageUrl: `${AiAgentTableName}.image_url`,
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

        if (projectUuid) {
            void query.where(`${AiAgentTableName}.project_uuid`, projectUuid);
        }

        const rows = await query;

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
            'name' | 'projectUuid' | 'tags' | 'integrations' | 'instruction'
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

            if (args.instruction) {
                await trx(AiAgentInstructionVersionsTableName).insert({
                    ai_agent_uuid: agent.ai_agent_uuid,
                    instruction: args.instruction,
                });
            }

            return {
                uuid: agent.ai_agent_uuid,
                name: agent.name,
                projectUuid: agent.project_uuid,
                organizationUuid: agent.organization_uuid,
                tags: agent.tags,
                integrations,
                createdAt: agent.created_at,
                updatedAt: agent.updated_at,
                instruction: args.instruction,
                imageUrl: agent.image_url,
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
                    updated_at: trx.fn.now(),
                    ...(args.tags !== undefined ? { tags: args.tags } : {}),
                    ...(args.name !== undefined ? { name: args.name } : {}),
                    ...(args.imageUrl !== undefined
                        ? { image_url: args.imageUrl }
                        : {}),
                    ...(args.projectUuid !== undefined
                        ? { project_uuid: args.projectUuid }
                        : {}),
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

            let instruction = await this.getAgentLastInstruction(
                {
                    agentUuid: agent.ai_agent_uuid,
                },
                { tx: trx },
            );

            if (args.instruction !== instruction) {
                const [result] = await trx(AiAgentInstructionVersionsTableName)
                    .insert({
                        ai_agent_uuid: agent.ai_agent_uuid,
                        // We need to represent removing an instruction, so we backfill with an empty string
                        instruction: args.instruction ?? '',
                    })
                    .returning('instruction');
                instruction = result.instruction;
            }

            return {
                uuid: agent.ai_agent_uuid,
                name: agent.name,
                projectUuid: agent.project_uuid,
                organizationUuid: agent.organization_uuid,
                tags: agent.tags,
                integrations,
                createdAt: agent.created_at,
                updatedAt: agent.updated_at,
                instruction,
                imageUrl: agent.image_url,
            };
        });
    }

    async getAgentLastInstruction(
        {
            agentUuid,
        }: {
            agentUuid: string;
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<string | null> {
        const result = await tx(AiAgentInstructionVersionsTableName)
            .select('instruction')
            .where('ai_agent_uuid', agentUuid)
            .orderBy('created_at', 'desc')
            .first();

        return result?.instruction ?? null;
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
        userUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
        threadUuid?: string;
        userUuid?: string;
    }): Promise<
        AiAgentThreadSummary<AiAgentUser & { slackUserId: string | null }>[]
    > {
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
            .leftJoin(
                AiSlackThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiSlackThreadTableName}.ai_thread_uuid`,
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
                    Pick<DbAiPrompt, 'prompt' | 'ai_prompt_uuid'> &
                    Pick<DbUser, 'user_uuid'> &
                    Pick<DbAiSlackThread, 'slack_user_id'> & {
                        user_name: string;
                    })[]
            >(
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.agent_uuid`,
                `${AiThreadTableName}.created_at`,
                `${AiThreadTableName}.created_from`,
                `${AiPromptTableName}.prompt`,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${UserTableName}.user_uuid`,
                this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name) as user_name`,
                ),
                `${AiSlackThreadTableName}.slack_user_id`,
            )
            .orderBy(`${AiThreadTableName}.created_at`, 'desc');

        if (threadUuid) {
            void query.andWhere(
                `${AiThreadTableName}.ai_thread_uuid`,
                threadUuid,
            );
        }

        if (userUuid) {
            void query.andWhere(`${UserTableName}.user_uuid`, userUuid);
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
                slackUserId: row.slack_user_id,
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
    }): Promise<
        AiAgentThreadSummary<AiAgentUser & { slackUserId: string | null }>
    > {
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
    }): Promise<
        AiAgentMessage<{
            uuid: string;
            name: string;
            slackUserId: string | null;
        }>[]
    > {
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
            .select<
                (Pick<
                    DbAiPrompt,
                    | 'ai_prompt_uuid'
                    | 'prompt'
                    | 'created_at'
                    | 'response'
                    | 'responded_at'
                    | 'filters_output'
                    | 'viz_config_output'
                    | 'metric_query'
                    | 'human_score'
                > &
                    Pick<DbUser, 'user_uuid'> &
                    Pick<DbAiThread, 'ai_thread_uuid'> &
                    Pick<DbAiSlackPrompt, 'slack_user_id'> &
                    Pick<DbAiWebAppPrompt, 'user_uuid'> & {
                        user_name: string;
                    })[]
            >(
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiPromptTableName}.prompt`,
                `${AiPromptTableName}.created_at`,
                `${AiPromptTableName}.response`,
                `${AiPromptTableName}.responded_at`,
                `${AiPromptTableName}.filters_output`,
                `${AiPromptTableName}.viz_config_output`,
                `${AiPromptTableName}.metric_query`,
                `${AiPromptTableName}.human_score`,
                `${UserTableName}.user_uuid`,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiSlackPromptTableName}.slack_user_id`,
                `${AiWebAppPromptTableName}.user_uuid`,
                this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name) as user_name`,
                ),
            )
            .leftJoin(
                AiSlackPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiSlackPromptTableName}.ai_prompt_uuid`,
            )
            .leftJoin(
                AiWebAppPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiWebAppPromptTableName}.ai_prompt_uuid`,
            )
            .where(`${AiPromptTableName}.ai_thread_uuid`, threadUuid)
            .andWhere(
                `${AiThreadTableName}.organization_uuid`,
                organizationUuid,
            )
            .orderBy(`${AiPromptTableName}.created_at`, 'asc');

        const messagesPromises = rows.map(async (row) => {
            const messages: AiAgentMessage<{
                uuid: string;
                name: string;
                slackUserId: string | null;
            }>[] = [];

            messages.push({
                role: 'user',
                uuid: row.ai_prompt_uuid,
                threadUuid: row.ai_thread_uuid,
                message: row.prompt,
                createdAt: row.created_at.toISOString(),
                user: {
                    uuid: row.user_uuid,
                    name: row.user_name,
                    slackUserId: row.slack_user_id,
                },
            });

            const toolCalls = await this.getToolCallsForPrompt(
                row.ai_prompt_uuid,
            );

            if (row.responded_at != null) {
                messages.push({
                    role: 'assistant',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,
                    message: row.response,
                    createdAt: row.responded_at.toISOString(),
                    vizConfigOutput: row.viz_config_output,
                    filtersOutput: row.filters_output,
                    metricQuery: row.metric_query,
                    humanScore: row.human_score,
                    toolCalls: toolCalls
                        .filter(
                            (
                                tc,
                            ): tc is DbAiAgentToolCall & {
                                tool_name: ToolName;
                            } => isToolName(tc.tool_name),
                        )
                        .map((tc) => ({
                            uuid: tc.ai_agent_tool_call_uuid,
                            promptUuid: tc.ai_prompt_uuid,
                            toolCallId: tc.tool_call_id,
                            createdAt: tc.created_at,
                            toolName: tc.tool_name,
                            toolArgs: tc.tool_args,
                        })),
                });
            }

            return messages;
        });

        return (await Promise.all(messagesPromises)).flat();
    }

    async findThreadMessage(
        role: 'user',
        {
            organizationUuid,
            threadUuid,
            messageUuid,
        }: {
            organizationUuid: string;
            threadUuid: string;
            messageUuid: string;
        },
    ): Promise<AiAgentMessageUser<AiAgentUser>>;
    async findThreadMessage(
        role: 'assistant',
        {
            organizationUuid,
            threadUuid,
            messageUuid,
        }: {
            organizationUuid: string;
            threadUuid: string;
            messageUuid: string;
        },
    ): Promise<AiAgentMessageAssistant>;
    async findThreadMessage(
        role: 'user' | 'assistant',
        {
            organizationUuid,
            threadUuid,
            messageUuid,
        }: {
            organizationUuid: string;
            threadUuid: string;
            messageUuid: string;
        },
    ): Promise<AiAgentMessage> {
        const row = await this.database(AiPromptTableName)
            .select<
                (Pick<
                    DbAiPrompt,
                    | 'ai_prompt_uuid'
                    | 'prompt'
                    | 'response'
                    | 'created_at'
                    | 'responded_at'
                    | 'filters_output'
                    | 'viz_config_output'
                    | 'metric_query'
                    | 'human_score'
                > &
                    Pick<DbUser, 'user_uuid'> &
                    Pick<DbAiThread, 'ai_thread_uuid'> &
                    Pick<DbAiSlackPrompt, 'slack_user_id'> &
                    Pick<DbAiWebAppPrompt, 'user_uuid'> & {
                        user_name: string;
                    })[]
            >(
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiPromptTableName}.prompt`,
                `${AiPromptTableName}.response`,
                `${AiPromptTableName}.created_at`,
                `${AiPromptTableName}.responded_at`,
                `${AiPromptTableName}.filters_output`,
                `${AiPromptTableName}.viz_config_output`,
                `${AiPromptTableName}.metric_query`,
                `${AiPromptTableName}.human_score`,
                `${UserTableName}.user_uuid`,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiSlackPromptTableName}.slack_user_id`,
                `${AiWebAppPromptTableName}.user_uuid`,
                this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name) as user_name`,
                ),
            )
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
            .leftJoin(
                AiSlackPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiSlackPromptTableName}.ai_prompt_uuid`,
            )
            .leftJoin(
                AiWebAppPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiWebAppPromptTableName}.ai_prompt_uuid`,
            )
            .where(`${AiPromptTableName}.ai_thread_uuid`, threadUuid)
            .andWhere(
                `${AiThreadTableName}.organization_uuid`,
                organizationUuid,
            )
            .andWhere(`${AiPromptTableName}.ai_prompt_uuid`, messageUuid)
            .orderBy(`${AiPromptTableName}.created_at`, 'asc')
            .first();

        if (!row) {
            throw new AiAgentNotFoundError(
                `AI agent message not found for uuid: ${messageUuid}`,
            );
        }

        switch (role) {
            case 'user':
                return {
                    role: 'user',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,
                    message: row.prompt,
                    createdAt: row.created_at.toString(),
                    user: {
                        uuid: row.user_uuid,
                        name: row.user_name,
                    },
                } satisfies AiAgentMessageUser;
            case 'assistant':
                const toolCalls = await this.getToolCallsForPrompt(
                    row.ai_prompt_uuid,
                );
                return {
                    role: 'assistant',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,

                    // TODO: handle null response
                    message: row.response ?? '',
                    createdAt: row.responded_at?.toString() ?? '',

                    vizConfigOutput: row.viz_config_output,
                    filtersOutput: row.filters_output,
                    metricQuery: row.metric_query,
                    humanScore: row.human_score,
                    toolCalls: toolCalls
                        .filter(
                            (
                                tc,
                            ): tc is DbAiAgentToolCall & {
                                tool_name: ToolName;
                            } => isToolName(tc.tool_name),
                        )
                        .map((tc) => ({
                            uuid: tc.ai_agent_tool_call_uuid,
                            promptUuid: tc.ai_prompt_uuid,
                            toolCallId: tc.tool_call_id,
                            createdAt: tc.created_at,
                            toolName: tc.tool_name,
                            toolArgs: tc.tool_args,
                        })),
                } satisfies AiAgentMessageAssistant;
            default:
                return assertUnreachable(role, `Unknown role ${role}`);
        }
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

    async findThread(uuid: string): Promise<AiThread | undefined> {
        return this.database(AiThreadTableName)
            .select({
                aiThreadUuid: 'ai_thread_uuid',
                organizationUuid: 'organization_uuid',
                projectUuid: 'project_uuid',
                createdAt: 'created_at',
                createdFrom: 'created_from',
                agentUuid: 'agent_uuid',
            })
            .where({ ai_thread_uuid: uuid })
            .first();
    }

    async findThreadUuidBySlackChannelIdAndThreadTs(
        slackChannelId: string,
        slackThreadTs: string,
    ) {
        const row = await this.database(AiSlackThreadTableName)
            .select('ai_thread_uuid')
            .where({
                slack_channel_id: slackChannelId,
                slack_thread_ts: slackThreadTs,
            })
            .first();
        return row?.ai_thread_uuid;
    }

    async getThreads(organizationUuid: string, projectUuid: string) {
        return this.database
            .from(AiThreadTableName)
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
            .andWhere(`${AiThreadTableName}.project_uuid`, projectUuid)
            .select<
                Array<
                    Pick<
                        DbAiThread,
                        | 'ai_thread_uuid'
                        | 'created_at'
                        | 'created_from'
                        | 'agent_uuid'
                    > &
                        Pick<DbAiPrompt, 'prompt'> &
                        Pick<DbUser, 'user_uuid'> & { user_name: string }
                >
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
    }

    async getThreadMessages(
        organizationUuid: string,
        projectUuid: string,
        threadUuid: string,
    ) {
        return this.database(AiPromptTableName)
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
            )
            .select({
                created_at: `${AiPromptTableName}.created_at`,
                user_name: this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name)`,
                ),
            })
            .where(`${AiPromptTableName}.ai_thread_uuid`, threadUuid)
            .andWhere(`${AiThreadTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${AiThreadTableName}.organization_uuid`,
                organizationUuid,
            )
            .orderBy(`${AiPromptTableName}.created_at`, 'asc');
    }

    async findSlackPrompt(
        promptUuid: string,
    ): Promise<SlackPrompt | undefined> {
        return this.database(AiPromptTableName)
            .join(
                AiSlackPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiSlackPromptTableName}.ai_prompt_uuid`,
            )
            .join(
                AiSlackThreadTableName,
                `${AiPromptTableName}.ai_thread_uuid`,
                `${AiSlackThreadTableName}.ai_thread_uuid`,
            )
            .join(
                AiThreadTableName,
                `${AiPromptTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.ai_thread_uuid`,
            )
            .select({
                organizationUuid: `${AiThreadTableName}.organization_uuid`,
                projectUuid: `${AiThreadTableName}.project_uuid`,
                promptUuid: `${AiPromptTableName}.ai_prompt_uuid`,
                threadUuid: `${AiPromptTableName}.ai_thread_uuid`,
                agentUuid: `${AiThreadTableName}.agent_uuid`,
                createdByUserUuid: `${AiPromptTableName}.created_by_user_uuid`,
                prompt: `${AiPromptTableName}.prompt`,
                createdAt: `${AiPromptTableName}.created_at`,
                response: `${AiPromptTableName}.response`,
                response_slack_ts: `${AiSlackPromptTableName}.response_slack_ts`,
                slackUserId: `${AiSlackPromptTableName}.slack_user_id`,
                slackChannelId: `${AiSlackPromptTableName}.slack_channel_id`,
                promptSlackTs: `${AiSlackPromptTableName}.prompt_slack_ts`,
                slackThreadTs: `${AiSlackThreadTableName}.slack_thread_ts`,
                filtersOutput: `${AiPromptTableName}.filters_output`,
                vizConfigOutput: `${AiPromptTableName}.viz_config_output`,
                humanScore: `${AiPromptTableName}.human_score`,
                metricQuery: `${AiPromptTableName}.metric_query`,
            })
            .where(`${AiPromptTableName}.ai_prompt_uuid`, promptUuid)
            .first();
    }

    async existsSlackPromptByChannelIdAndPromptTs(
        slackChannelId: string,
        promptSlackTs: string,
    ) {
        return Boolean(
            await this.database(AiSlackPromptTableName)
                .where(`slack_channel_id`, slackChannelId)
                .andWhere(`prompt_slack_ts`, promptSlackTs)
                .first(),
        );
    }

    async createSlackThread(data: CreateSlackThread) {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(AiThreadTableName)
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    created_from: data.createdFrom,
                    agent_uuid: data.agentUuid,
                })
                .returning('ai_thread_uuid');
            if (row === undefined) {
                throw new Error('Failed to create thread');
            }
            await trx(AiSlackThreadTableName).insert({
                ai_thread_uuid: row.ai_thread_uuid,
                slack_user_id: data.slackUserId,
                slack_channel_id: data.slackChannelId,
                slack_thread_ts: data.slackThreadTs,
            });
            return row.ai_thread_uuid;
        });
    }

    async createSlackPrompt(data: CreateSlackPrompt) {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(AiPromptTableName)
                .insert({
                    ai_thread_uuid: data.threadUuid,
                    created_by_user_uuid: data.createdByUserUuid,
                    prompt: data.prompt,
                })
                .returning('ai_prompt_uuid');

            if (row === undefined) {
                throw new Error('Failed to create prompt');
            }

            await trx(AiSlackPromptTableName).insert({
                ai_prompt_uuid: row.ai_prompt_uuid,
                slack_user_id: data.slackUserId,
                slack_channel_id: data.slackChannelId,
                prompt_slack_ts: data.promptSlackTs,
            });

            return row.ai_prompt_uuid;
        });
    }

    async updateModelResponse(
        data: UpdateSlackResponse | UpdateWebAppResponse,
    ) {
        await this.database(AiPromptTableName)
            .update({
                responded_at: this.database.fn.now(),
                ...(data.response ? { response: data.response } : {}),
                ...(data.filtersOutput
                    ? { filters_output: data.filtersOutput }
                    : {}),
                ...(data.vizConfigOutput
                    ? { viz_config_output: data.vizConfigOutput }
                    : {}),
                ...(data.humanScore ? { human_score: data.humanScore } : {}),
                ...(data.metricQuery ? { metric_query: data.metricQuery } : {}),
            })
            .where({
                ai_prompt_uuid: data.promptUuid,
            })
            .returning('ai_prompt_uuid');
    }

    async updateHumanScore(data: {
        promptUuid: string;
        humanScore: number | null;
    }) {
        await this.database(AiPromptTableName)
            .update({
                human_score: data.humanScore,
            })
            .where({
                ai_prompt_uuid: data.promptUuid,
            });
    }

    async updateSlackResponseTs(data: UpdateSlackResponseTs) {
        await this.database(AiSlackPromptTableName)
            .update({
                response_slack_ts: data.responseSlackTs,
            })
            .where({
                ai_prompt_uuid: data.promptUuid,
            });
    }

    async findWebAppPrompt(
        promptUuid: string,
    ): Promise<AiWebAppPrompt | undefined> {
        return this.database(AiPromptTableName)
            .join(
                AiWebAppPromptTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiWebAppPromptTableName}.ai_prompt_uuid`,
            )
            .join(
                AiWebAppThreadTableName,
                `${AiPromptTableName}.ai_thread_uuid`,
                `${AiWebAppThreadTableName}.ai_thread_uuid`,
            )
            .join(
                AiThreadTableName,
                `${AiPromptTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.ai_thread_uuid`,
            )
            .select({
                organizationUuid: `${AiThreadTableName}.organization_uuid`,
                projectUuid: `${AiThreadTableName}.project_uuid`,
                promptUuid: `${AiPromptTableName}.ai_prompt_uuid`,
                threadUuid: `${AiPromptTableName}.ai_thread_uuid`,
                agentUuid: `${AiThreadTableName}.agent_uuid`,
                createdByUserUuid: `${AiPromptTableName}.created_by_user_uuid`,
                userUuid: `${AiWebAppPromptTableName}.user_uuid`,
                prompt: `${AiPromptTableName}.prompt`,
                createdAt: `${AiPromptTableName}.created_at`,
                response: `${AiPromptTableName}.response`,
                filtersOutput: `${AiPromptTableName}.filters_output`,
                vizConfigOutput: `${AiPromptTableName}.viz_config_output`,
                humanScore: `${AiPromptTableName}.human_score`,
                metricQuery: `${AiPromptTableName}.metric_query`,
            })
            .where(`${AiPromptTableName}.ai_prompt_uuid`, promptUuid)
            .first();
    }

    async createWebAppThread(data: CreateWebAppThread) {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(AiThreadTableName)
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    created_from: data.createdFrom,
                    agent_uuid: data.agentUuid,
                })
                .returning('ai_thread_uuid');
            if (row === undefined) {
                throw new Error('Failed to create thread');
            }
            await trx(AiWebAppThreadTableName).insert({
                ai_thread_uuid: row.ai_thread_uuid,
                user_uuid: data.userUuid,
            });
            return row.ai_thread_uuid;
        });
    }

    async createWebAppPrompt(data: CreateWebAppPrompt) {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(AiPromptTableName)
                .insert({
                    ai_thread_uuid: data.threadUuid,
                    created_by_user_uuid: data.createdByUserUuid,
                    prompt: data.prompt,
                })
                .returning('ai_prompt_uuid');

            if (row === undefined) {
                throw new Error('Failed to create prompt');
            }

            await trx(AiWebAppPromptTableName).insert({
                ai_prompt_uuid: row.ai_prompt_uuid,
                user_uuid: data.createdByUserUuid,
            });

            return row.ai_prompt_uuid;
        });
    }

    async existsSlackPromptsByChannelAndTimestamps(
        slackChannelId: string,
        timestamps: string[],
    ): Promise<string[]> {
        if (timestamps.length === 0) return [];

        const existingPrompts = await this.database(AiSlackPromptTableName)
            .select('prompt_slack_ts')
            .where('slack_channel_id', slackChannelId)
            .whereIn('prompt_slack_ts', timestamps);

        return existingPrompts.map((p) => p.prompt_slack_ts);
    }

    // TODO: reuse this?
    async bulkCreateSlackPrompts(
        threadUuid: string,
        promptsData: Pick<
            SlackPrompt,
            | 'createdByUserUuid'
            | 'prompt'
            | 'slackUserId'
            | 'slackChannelId'
            | 'promptSlackTs'
            | 'createdAt'
        >[],
    ): Promise<string[]> {
        if (promptsData.length === 0) return [];

        return this.database.transaction(async (trx) => {
            const promptRows = await trx(AiPromptTableName)
                .insert(
                    promptsData.map((data) => ({
                        ai_thread_uuid: threadUuid,
                        created_by_user_uuid: data.createdByUserUuid,
                        prompt: data.prompt,
                        ...(data.createdAt
                            ? { created_at: data.createdAt }
                            : {}),
                    })),
                )
                .returning('ai_prompt_uuid');

            if (promptRows.length !== promptsData.length) {
                throw new Error('Failed to create all prompts');
            }

            await trx(AiSlackPromptTableName).insert(
                promptRows.map((row, index) => ({
                    ai_prompt_uuid: row.ai_prompt_uuid,
                    slack_user_id: promptsData[index].slackUserId,
                    slack_channel_id: promptsData[index].slackChannelId,
                    prompt_slack_ts: promptsData[index].promptSlackTs,
                })),
            );

            return promptRows.map((row) => row.ai_prompt_uuid);
        });
    }

    async getUserAgentPreferences({
        userUuid,
        projectUuid,
    }: {
        userUuid: string;
        projectUuid: string;
    }): Promise<AiAgentUserPreferences | null> {
        const preferences = await this.database(AiAgentUserPreferencesTableName)
            .select({ defaultAgentUuid: 'default_agent_uuid' })
            .where({ user_uuid: userUuid, project_uuid: projectUuid })
            .first();

        return preferences ?? null;
    }

    async updateUserAgentPreferences({
        userUuid,
        projectUuid,
        defaultAgentUuid,
    }: {
        userUuid: string;
        projectUuid: string;
        defaultAgentUuid: string;
    }): Promise<void> {
        await this.database(AiAgentUserPreferencesTableName)
            .insert({
                user_uuid: userUuid,
                project_uuid: projectUuid,
                default_agent_uuid: defaultAgentUuid,
            })
            .onConflict(['user_uuid', 'project_uuid'])
            .merge({
                default_agent_uuid: defaultAgentUuid,
                updated_at: this.database.fn.now(),
            });
    }

    async createToolCall(data: {
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        toolArgs: object;
    }): Promise<string> {
        const [toolCall] = await this.database(AiAgentToolCallTableName)
            .insert({
                ai_prompt_uuid: data.promptUuid,
                tool_call_id: data.toolCallId,
                tool_name: data.toolName,
                tool_args: data.toolArgs,
            })
            .returning('ai_agent_tool_call_uuid');

        return toolCall.ai_agent_tool_call_uuid;
    }

    async getToolCallsForPrompt(
        promptUuid: string,
    ): Promise<DbAiAgentToolCall[]> {
        return this.database(AiAgentToolCallTableName)
            .where('ai_prompt_uuid', promptUuid)
            .orderBy('created_at', 'asc');
    }

    async createToolResults(
        data: Array<{
            promptUuid: string;
            toolCallId: string;
            toolName: string;
            result: string;
        }>,
    ): Promise<string[]> {
        if (data.length === 0) return [];

        return this.database.transaction(async (trx) => {
            const toolResults = await trx(AiAgentToolResultTableName)
                .insert(
                    data.map((item) => ({
                        ai_prompt_uuid: item.promptUuid,
                        tool_call_id: item.toolCallId,
                        tool_name: item.toolName,
                        result: item.result,
                    })),
                )
                .returning('ai_agent_tool_result_uuid');

            return toolResults.map((tr) => tr.ai_agent_tool_result_uuid);
        });
    }
}
