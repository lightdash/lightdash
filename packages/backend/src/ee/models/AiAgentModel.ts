import {
    AgentToolOutput,
    AiAgentAdminConversationsSummary,
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentAdminThreadSummary,
    AiAgentEvaluation,
    AiAgentEvaluationRun,
    AiAgentEvaluationRunResult,
    AiAgentEvaluationRunSummary,
    AiAgentEvaluationSummary,
    AiAgentMessage,
    AiAgentMessageAssistant,
    AiAgentMessageAssistantArtifact,
    AiAgentMessageUser,
    AiAgentNotFoundError,
    AiAgentReasoning,
    AiAgentSummary,
    AiAgentThreadSummary,
    AiAgentToolCall,
    AiAgentToolResult,
    AiAgentUser,
    AiAgentUserPreferences,
    AiArtifact,
    AiResultType,
    AiThread,
    AiWebAppPrompt,
    ApiAppendEvaluationRequest,
    ApiCreateAiAgent,
    ApiCreateEvaluationRequest,
    ApiUpdateAiAgent,
    ApiUpdateEvaluationRequest,
    assertUnreachable,
    CreateSlackPrompt,
    CreateSlackThread,
    CreateWebAppPrompt,
    CreateWebAppThread,
    isToolName,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    NotImplementedError,
    SlackPrompt,
    ToolName,
    ToolNameSchema,
    ToolProposeChangeOutput,
    toolProposeChangeOutputSchema,
    UpdateSlackResponse,
    UpdateSlackResponseTs,
    UpdateWebAppResponse,
    type AiAgent,
} from '@lightdash/common';
import { Knex } from 'knex';
import { AiAgentReasoningTableName } from '../../database/entities/aiAgentReasoning';
import { DbEmail, EmailTableName } from '../../database/entities/emails';
import { DbProject, ProjectTableName } from '../../database/entities/projects';
import { DbUser, UserTableName } from '../../database/entities/users';
import KnexPaginate from '../../database/pagination';
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
    AiAgentGroupAccessTableName,
    AiAgentInstructionVersionsTableName,
    AiAgentIntegrationTableName,
    AiAgentSlackIntegrationTableName,
    AiAgentTableName,
    AiAgentUserAccessTableName,
    DbAiAgent,
    DbAiAgentIntegration,
    DbAiAgentSlackIntegration,
} from '../database/entities/aiAgent';
import { AiAgentUserPreferencesTableName } from '../database/entities/aiAgentUserPreferences';
import {
    AiArtifactsTable,
    AiArtifactsTableName,
    AiArtifactVersionsTable,
    AiArtifactVersionsTableName,
    DbAiArtifactVersion,
} from '../database/entities/aiArtifacts';
import {
    AiEvalPromptTableName,
    AiEvalRunResultTableName,
    AiEvalRunTableName,
    AiEvalTableName,
    DbAiEval,
    DbAiEvalPrompt,
    DbAiEvalRun,
    DbAiEvalRunResult,
} from '../database/entities/aiEvals';

type Dependencies = {
    database: Knex;
};

export class AiAgentModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    static async withTrx<T>(
        db: Knex | Knex.Transaction,
        callback: (trx: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        if (db.isTransaction) {
            return callback(db as Knex.Transaction);
        }
        return db.transaction(callback);
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
        const integrations = this.database
            .from(AiAgentIntegrationTableName)
            .leftJoin(
                AiAgentSlackIntegrationTableName,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .select(
                `${AiAgentIntegrationTableName}.ai_agent_uuid`,
                `${AiAgentIntegrationTableName}.integration_type`,
                `${AiAgentSlackIntegrationTableName}.slack_channel_id`,
            )
            .whereNotNull(`${AiAgentIntegrationTableName}.integration_type`)
            .where(`${AiAgentIntegrationTableName}.ai_agent_uuid`, agentUuid);

        const groupAccess = this.database
            .from(AiAgentGroupAccessTableName)
            .select('ai_agent_uuid', 'group_uuid')
            .where(`${AiAgentGroupAccessTableName}.ai_agent_uuid`, agentUuid);

        const userAccess = this.database
            .from(AiAgentUserAccessTableName)
            .select('ai_agent_uuid', 'user_uuid')
            .where(`${AiAgentUserAccessTableName}.ai_agent_uuid`, agentUuid);

        const latestInstruction = this.database
            .from(AiAgentInstructionVersionsTableName)
            .select(
                'ai_agent_uuid',
                this.database.raw('instruction'),
                this.database.raw(
                    'ROW_NUMBER() OVER (PARTITION BY ai_agent_uuid ORDER BY created_at DESC) as rn',
                ),
            );

        const query = this.database
            .with('integrations', integrations)
            .with('latest_instruction', latestInstruction)
            .with('group_access', groupAccess)
            .with('user_access', userAccess)
            .from(AiAgentTableName)
            .select({
                uuid: `${AiAgentTableName}.ai_agent_uuid`,
                organizationUuid: `${AiAgentTableName}.organization_uuid`,
                projectUuid: `${AiAgentTableName}.project_uuid`,
                name: `${AiAgentTableName}.name`,
                tags: `${AiAgentTableName}.tags`,
                integrations: this.database.raw(`
                    COALESCE(
                        (SELECT json_agg(
                            json_build_object(
                                'type', integration_type,
                                'channelId', slack_channel_id
                            )
                        ) FROM integrations
                         WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid),
                        '[]'::json
                    )
                `),
                updatedAt: `${AiAgentTableName}.updated_at`,
                createdAt: `${AiAgentTableName}.created_at`,
                instruction: this.database.raw(`
                    (SELECT instruction FROM latest_instruction
                     WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid AND rn = 1)
                `),
                imageUrl: `${AiAgentTableName}.image_url`,
                enableDataAccess: `${AiAgentTableName}.enable_data_access`,
                enableSelfImprovement: `${AiAgentTableName}.enable_self_improvement`,
                enableReasoning: `${AiAgentTableName}.enable_reasoning`,
                version: `${AiAgentTableName}.version`,
                groupAccess: this.database.raw(`
                    COALESCE(
                        (SELECT json_agg(group_uuid)
                         FROM group_access
                         WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid),
                        '[]'::json
                    )
                `),
                userAccess: this.database.raw(`
                    COALESCE(
                        (SELECT json_agg(user_uuid)
                         FROM user_access
                         WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid),
                        '[]'::json
                    )
                `),
            } satisfies Record<keyof AiAgent, unknown>)
            .where(`${AiAgentTableName}.organization_uuid`, organizationUuid)
            .where(`${AiAgentTableName}.ai_agent_uuid`, agentUuid)
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
        const integrations = this.database
            .from(AiAgentIntegrationTableName)
            .leftJoin(
                AiAgentSlackIntegrationTableName,
                `${AiAgentIntegrationTableName}.ai_agent_integration_uuid`,
                `${AiAgentSlackIntegrationTableName}.ai_agent_integration_uuid`,
            )
            .select(
                `${AiAgentIntegrationTableName}.ai_agent_uuid`,
                `${AiAgentIntegrationTableName}.integration_type`,
                `${AiAgentSlackIntegrationTableName}.slack_channel_id`,
            )
            .whereNotNull(`${AiAgentIntegrationTableName}.integration_type`);

        const groupAccess = this.database
            .from(AiAgentGroupAccessTableName)
            .select('ai_agent_uuid', 'group_uuid');

        const userAccess = this.database
            .from(AiAgentUserAccessTableName)
            .select('ai_agent_uuid', 'user_uuid');

        const latestInstruction = this.database
            .from(AiAgentInstructionVersionsTableName)
            .select(
                'ai_agent_uuid',
                this.database.raw('instruction'),
                this.database.raw(
                    'ROW_NUMBER() OVER (PARTITION BY ai_agent_uuid ORDER BY created_at DESC) as rn',
                ),
            );

        const query = this.database
            .with('integrations', integrations)
            .with('latest_instruction', latestInstruction)
            .with('group_access', groupAccess)
            .with('user_access', userAccess)
            .from(AiAgentTableName)
            .select({
                uuid: `${AiAgentTableName}.ai_agent_uuid`,
                organizationUuid: `${AiAgentTableName}.organization_uuid`,
                projectUuid: `${AiAgentTableName}.project_uuid`,
                name: `${AiAgentTableName}.name`,
                tags: `${AiAgentTableName}.tags`,
                integrations: this.database.raw(`
                    COALESCE(
                        (SELECT json_agg(
                            json_build_object(
                                'type', integration_type,
                                'channelId', slack_channel_id
                            )
                        ) FROM integrations
                         WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid),
                        '[]'::json
                    )
                `),
                updatedAt: `${AiAgentTableName}.updated_at`,
                createdAt: `${AiAgentTableName}.created_at`,
                instruction: this.database.raw(`
                    (SELECT instruction FROM latest_instruction
                     WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid AND rn = 1)
                `),
                imageUrl: `${AiAgentTableName}.image_url`,
                enableDataAccess: `${AiAgentTableName}.enable_data_access`,
                enableSelfImprovement: `${AiAgentTableName}.enable_self_improvement`,
                enableReasoning: `${AiAgentTableName}.enable_reasoning`,
                version: `${AiAgentTableName}.version`,
                groupAccess: this.database.raw(`
                    COALESCE(
                        (SELECT json_agg(group_uuid)
                         FROM group_access
                         WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid),
                        '[]'::json
                    )
                `),
                userAccess: this.database.raw(`
                    COALESCE(
                        (SELECT json_agg(user_uuid)
                         FROM user_access
                         WHERE ai_agent_uuid = ${AiAgentTableName}.ai_agent_uuid),
                        '[]'::json
                    )
                `),
            } satisfies Record<keyof AiAgentSummary, unknown>)
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
            | 'name'
            | 'projectUuid'
            | 'tags'
            | 'integrations'
            | 'instruction'
            | 'groupAccess'
            | 'userAccess'
            | 'enableDataAccess'
            | 'enableSelfImprovement'
            | 'enableReasoning'
            | 'version'
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
                    enable_data_access: args.enableDataAccess,
                    enable_self_improvement: args.enableSelfImprovement,
                    enable_reasoning: args.enableReasoning,
                    version: args.version,
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

            const groupAccess = await this.setAndGetGroupAccess(
                agent.ai_agent_uuid,
                args.groupAccess ?? undefined,
                { trx },
            );

            const userAccess = await this.setAndGetUserAccess(
                agent.ai_agent_uuid,
                args.userAccess ?? undefined,
                { trx },
            );

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
                groupAccess,
                userAccess,
                enableDataAccess: agent.enable_data_access,
                enableSelfImprovement: agent.enable_self_improvement,
                enableReasoning: agent.enable_reasoning,
                version: agent.version,
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
                    ...(args.enableDataAccess !== undefined
                        ? { enable_data_access: args.enableDataAccess }
                        : {}),
                    ...(args.enableSelfImprovement !== undefined
                        ? {
                              enable_self_improvement:
                                  args.enableSelfImprovement,
                          }
                        : {}),
                    ...(args.enableReasoning !== undefined
                        ? { enable_reasoning: args.enableReasoning }
                        : {}),
                    ...(args.version !== undefined
                        ? { version: args.version }
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

            const groupAccess = await this.setAndGetGroupAccess(
                agent.ai_agent_uuid,
                args.groupAccess ?? undefined,
                { trx },
            );

            const userAccess = await this.setAndGetUserAccess(
                agent.ai_agent_uuid,
                args.userAccess ?? undefined,
                { trx },
            );

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
                groupAccess,
                userAccess,
                enableDataAccess: agent.enable_data_access,
                enableSelfImprovement: agent.enable_self_improvement,
                enableReasoning: agent.enable_reasoning,
                version: agent.version,
            };
        });
    }

    private async getGroupAccess(
        agentUuid: AiAgent['uuid'],
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<NonNullable<AiAgent['groupAccess']>> {
        const rows = await trx(AiAgentGroupAccessTableName)
            .select('group_uuid')
            .where('ai_agent_uuid', agentUuid);

        return rows.map((row) => row.group_uuid);
    }

    private async setGroupAccess(
        agentUuid: AiAgent['uuid'],
        groupAccess: NonNullable<AiAgent['groupAccess']>,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<NonNullable<AiAgent['groupAccess']>> {
        // Delete existing group access
        await trx(AiAgentGroupAccessTableName)
            .where('ai_agent_uuid', agentUuid)
            .delete();

        if (groupAccess.length === 0) {
            return [];
        }

        await trx(AiAgentGroupAccessTableName).insert(
            groupAccess.map((groupUuid) => ({
                ai_agent_uuid: agentUuid,
                group_uuid: groupUuid,
            })),
        );

        return groupAccess;
    }

    private async setAndGetGroupAccess(
        agentUuid: AiAgent['uuid'],
        groupAccess: NonNullable<AiAgent['groupAccess']> | undefined,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<NonNullable<AiAgent['groupAccess']>> {
        if (groupAccess !== undefined) {
            await this.setGroupAccess(agentUuid, groupAccess, { trx });
        }
        return this.getGroupAccess(agentUuid, { trx });
    }

    private async getUserAccess(
        agentUuid: AiAgent['uuid'],
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<AiAgent['userAccess']> {
        const rows = await trx(AiAgentUserAccessTableName)
            .select('user_uuid')
            .where('ai_agent_uuid', agentUuid);

        return rows.map((row) => row.user_uuid);
    }

    private async setUserAccess(
        agentUuid: AiAgent['uuid'],
        userAccess: NonNullable<AiAgent['userAccess']>,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<NonNullable<AiAgent['userAccess']>> {
        // Delete existing user access
        await trx(AiAgentUserAccessTableName)
            .where('ai_agent_uuid', agentUuid)
            .delete();

        if (userAccess.length === 0) {
            return [];
        }

        await trx(AiAgentUserAccessTableName).insert(
            userAccess.map((userUuid) => ({
                ai_agent_uuid: agentUuid,
                user_uuid: userUuid,
            })),
        );

        return userAccess;
    }

    private async setAndGetUserAccess(
        agentUuid: AiAgent['uuid'],
        userAccess: NonNullable<AiAgent['userAccess']> | undefined,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<NonNullable<AiAgent['userAccess']>> {
        if (userAccess !== undefined) {
            await this.setUserAccess(agentUuid, userAccess, { trx });
        }
        return this.getUserAccess(agentUuid, { trx });
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
        createdFrom,
    }: {
        organizationUuid: string;
        agentUuid: string;
        threadUuid?: string;
        userUuid?: string;
        createdFrom?: ('web_app' | 'slack' | 'evals')[];
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
                    | 'title'
                    | 'title_generated_at'
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
                `${AiThreadTableName}.title`,
                `${AiThreadTableName}.title_generated_at`,
                `${AiPromptTableName}.prompt`,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${UserTableName}.user_uuid`,
                this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name) as user_name`,
                ),
                `${AiSlackThreadTableName}.slack_user_id`,
            )
            .orderBy(`${AiThreadTableName}.created_at`, 'desc');

        if (createdFrom) {
            void query.andWhere(
                `${AiThreadTableName}.created_from`,
                'in',
                createdFrom,
            );
        }

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
            title: row.title,
            titleGeneratedAt: row.title_generated_at?.toString() ?? null,
            firstMessage: {
                uuid: row.ai_prompt_uuid,
                message: row.prompt,
            },
            user: {
                uuid: row.user_uuid,
                name: row.user_name,
                slackUserId: row.slack_user_id,
            },
        }));
    }

    async findAdminThreadsPaginated({
        organizationUuid,
        paginateArgs,
        filters,
        sort,
    }: {
        organizationUuid: string;
        paginateArgs?: KnexPaginateArgs;
        filters?: AiAgentAdminFilters;
        sort?: AiAgentAdminSort;
    }): Promise<KnexPaginatedData<AiAgentAdminConversationsSummary>> {
        const threadFeedbackQuery = this.database(AiPromptTableName)
            .select([
                'ai_thread_uuid',
                this.database.raw(`
                     COUNT(CASE WHEN human_score = 1 THEN 1 END)::integer as upvotes,
                     COUNT(CASE WHEN human_score = -1 THEN 1 END)::integer as downvotes,
                     COUNT(CASE WHEN human_score = 0 THEN 1 END)::integer as neutral,
                     COUNT(*)::integer as total_feedback
                 `),
            ])
            .from(AiPromptTableName)
            .whereNotNull('human_score')
            .groupBy('ai_thread_uuid');

        const threadPromptCountQuery = this.database(AiPromptTableName)
            .select([
                'ai_thread_uuid',
                this.database.raw('COUNT(*)::integer as prompt_count'),
            ])
            .groupBy('ai_thread_uuid');
        const threadsWithFeedbackQuery = this.database
            .with('thread_feedback', threadFeedbackQuery)
            .with('thread_prompt_count', threadPromptCountQuery)
            .select<
                {
                    ai_thread_uuid: DbAiThread['ai_thread_uuid'];
                    agent_uuid: AiAgent['uuid'];
                    agent_image_url: AiAgent['imageUrl'];
                    created_at: Date;
                    created_from: DbAiThread['created_from'];
                    title: DbAiThread['title'];
                    title_generated_at: DbAiThread['title_generated_at'];
                    first_prompt: DbAiPrompt['prompt'];
                    user_uuid: DbUser['user_uuid'];
                    user_name: string;
                    user_email: DbEmail['email'];
                    slack_user_id: DbAiSlackThread['slack_user_id'];
                    slack_channel_id: DbAiSlackThread['slack_channel_id'];
                    slack_thread_ts: DbAiSlackThread['slack_thread_ts'];
                    agent_name: AiAgent['name'];
                    project_name: DbProject['name'];
                    organization_uuid: DbAiThread['organization_uuid'];
                    project_uuid: DbAiThread['project_uuid'];

                    // Feedback aggregation from CTE
                    upvotes: number | null;
                    downvotes: number | null;
                    neutral: number | null;
                    total_feedback: number | null;

                    // Prompt count from CTE
                    prompt_count: number | null;
                }[]
            >([
                // Original thread fields
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.agent_uuid`,
                `${AiThreadTableName}.created_at`,
                `${AiThreadTableName}.created_from`,
                `${AiThreadTableName}.title`,
                `${AiThreadTableName}.title_generated_at`,
                `${AiPromptTableName}.prompt as first_prompt`,
                `${UserTableName}.user_uuid`,
                this.database.raw(
                    `CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name) as user_name`,
                ),
                `${EmailTableName}.email as user_email`,
                `${AiSlackThreadTableName}.slack_user_id`,
                `${AiSlackThreadTableName}.slack_channel_id`,
                `${AiSlackThreadTableName}.slack_thread_ts`,
                `${AiAgentTableName}.name as agent_name`,
                `${AiAgentTableName}.image_url as agent_image_url`,
                `${ProjectTableName}.name as project_name`,
                `${ProjectTableName}.project_uuid`,

                // Feedback aggregation from CTE
                'thread_feedback.upvotes',
                'thread_feedback.downvotes',
                'thread_feedback.neutral',
                'thread_feedback.total_feedback',

                // Prompt count from CTE
                'thread_prompt_count.prompt_count',
            ])
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
            .leftJoin(
                EmailTableName,
                `${EmailTableName}.user_id`,
                '=',
                `${UserTableName}.user_id`,
            )
            .andWhere(`${EmailTableName}.is_primary`, true)
            .join(
                AiAgentTableName,
                `${AiThreadTableName}.agent_uuid`,
                `${AiAgentTableName}.ai_agent_uuid`,
            )
            .join(
                ProjectTableName,
                `${AiAgentTableName}.project_uuid`,
                `${ProjectTableName}.project_uuid`,
            )
            .leftJoin(
                AiSlackThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiSlackThreadTableName}.ai_thread_uuid`,
            )
            .leftJoin(
                'thread_feedback',
                `${AiThreadTableName}.ai_thread_uuid`,
                'thread_feedback.ai_thread_uuid',
            )
            .leftJoin(
                'thread_prompt_count',
                `${AiThreadTableName}.ai_thread_uuid`,
                'thread_prompt_count.ai_thread_uuid',
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
            // Exclude eval threads by default - only show web_app and slack threads
            .whereIn(`${AiThreadTableName}.created_from`, ['web_app', 'slack']);

        const finalQuery = threadsWithFeedbackQuery;

        if (filters) {
            if (filters.projectUuids && filters.projectUuids.length > 0) {
                void finalQuery.whereIn(
                    `${ProjectTableName}.project_uuid`,
                    filters.projectUuids,
                );
            }
            if (filters.agentUuids && filters.agentUuids.length > 0) {
                void finalQuery.whereIn(
                    `${AiThreadTableName}.agent_uuid`,
                    filters.agentUuids,
                );
            }
            if (filters.userUuids && filters.userUuids.length > 0) {
                void finalQuery.whereIn(
                    `${UserTableName}.user_uuid`,
                    filters.userUuids,
                );
            }
            if (filters.createdFrom) {
                void finalQuery.where(
                    `${AiThreadTableName}.created_from`,
                    filters.createdFrom,
                );
            }
            if (filters.dateFrom) {
                void finalQuery.where(
                    `${AiThreadTableName}.created_at`,
                    '>=',
                    filters.dateFrom,
                );
            }
            if (filters.dateTo) {
                void finalQuery.where(
                    `${AiThreadTableName}.created_at`,
                    '<=',
                    filters.dateTo,
                );
            }
            if (filters.humanScore !== undefined) {
                void finalQuery.whereExists((qb) => {
                    void qb
                        .select('*')
                        .from(AiPromptTableName)
                        .whereRaw(
                            `${AiPromptTableName}.ai_thread_uuid = ${AiThreadTableName}.ai_thread_uuid`,
                        )
                        .where(
                            'human_score',
                            filters.humanScore === 0
                                ? null
                                : filters.humanScore,
                        );
                });
            }
            if (filters.search) {
                void finalQuery.where(
                    `${AiThreadTableName}.title`,
                    'ILIKE',
                    `%${filters.search}%`,
                );
            }
        }

        if (sort) {
            const { field, direction } = sort;
            switch (field) {
                case 'createdAt':
                    void finalQuery.orderBy(
                        `${AiThreadTableName}.created_at`,
                        direction,
                    );
                    break;
                case 'title':
                    void finalQuery.orderBy(
                        `${AiThreadTableName}.title`,
                        direction,
                    );
                    break;
                default:
                    void finalQuery.orderBy(
                        `${AiThreadTableName}.created_at`,
                        'desc',
                    );
            }
        } else {
            void finalQuery.orderBy(`${AiThreadTableName}.created_at`, 'desc');
        }

        const { pagination, data } = await KnexPaginate.paginate(
            finalQuery,
            paginateArgs,
        );

        const threads: AiAgentAdminThreadSummary[] = data.map(
            (row): AiAgentAdminThreadSummary => ({
                uuid: row.ai_thread_uuid,
                createdAt: row.created_at.toISOString(),
                createdFrom: row.created_from,
                title: row.title || row.first_prompt,
                user: {
                    uuid: row.user_uuid,
                    name: row.user_name,
                    slackUserId: row.slack_user_id,
                    email: row.user_email,
                },
                agent: {
                    uuid: row.agent_uuid,
                    name: row.agent_name,
                    imageUrl: row.agent_image_url,
                },
                project: {
                    uuid: row.project_uuid,
                    name: row.project_name,
                },
                feedbackSummary: {
                    upvotes: row.upvotes || 0,
                    downvotes: row.downvotes || 0,
                    neutral: row.neutral || 0,
                    total: row.total_feedback || 0,
                },
                promptCount: row.prompt_count || 0,
                slackChannelId: row.slack_channel_id || null,
                slackThreadTs: row.slack_thread_ts || null,
            }),
        );

        return {
            data: {
                threads,
            },
            pagination,
        };
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
                `AI agent thread not found for uuid: ${agentUuid}/${threadUuid}`,
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
        const promptRows = await this.database(AiPromptTableName)
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
                    | 'saved_query_uuid'
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
                `${AiPromptTableName}.saved_query_uuid`,
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

        const promptUuids = promptRows.map((row) => row.ai_prompt_uuid);

        const artifactsMap = await this.findThreadArtifacts({ promptUuids });

        const messagesPromises = promptRows.map(async (row) => {
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

            const toolResults = await this.getToolResultsForPrompt(
                row.ai_prompt_uuid,
            );

            const reasoning = await this.getReasoningForPrompt(
                row.ai_prompt_uuid,
            );

            if (row.responded_at != null) {
                const artifacts = artifactsMap.get(row.ai_prompt_uuid) || [];

                messages.push({
                    role: 'assistant',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,
                    message: row.response,
                    createdAt: row.responded_at.toISOString(),
                    humanScore: row.human_score,
                    artifacts: artifacts.length > 0 ? artifacts : null,
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
                    toolResults,
                    reasoning,
                    savedQueryUuid: row.saved_query_uuid,
                });
            }

            return messages;
        });

        return (await Promise.all(messagesPromises)).flat();
    }

    async findThreadArtifacts({
        promptUuids,
    }: {
        promptUuids: string[];
    }): Promise<Map<string, AiAgentMessageAssistantArtifact[]>> {
        const artifactsMap = new Map<
            string,
            AiAgentMessageAssistantArtifact[]
        >();

        if (promptUuids.length > 0) {
            const artifactRows = await this.database(
                AiArtifactVersionsTableName,
            )
                .join(
                    AiArtifactsTableName,
                    `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                    `${AiArtifactsTableName}.ai_artifact_uuid`,
                )
                .select(
                    `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
                    `${AiArtifactsTableName}.ai_artifact_uuid`,
                    `${AiArtifactVersionsTableName}.version_number`,
                    `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                    `${AiArtifactVersionsTableName}.title`,
                    `${AiArtifactVersionsTableName}.description`,
                    `${AiArtifactsTableName}.artifact_type`,
                )
                .whereIn(
                    `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
                    promptUuids,
                )
                .orderBy(`${AiArtifactVersionsTableName}.created_at`, 'asc');

            for (const artifactRow of artifactRows) {
                const promptUuid = artifactRow.ai_prompt_uuid;
                if (!artifactsMap.has(promptUuid)) {
                    artifactsMap.set(promptUuid, []);
                }
                artifactsMap.get(promptUuid)!.push({
                    artifactUuid: artifactRow.ai_artifact_uuid,
                    versionNumber: artifactRow.version_number ?? 1,
                    versionUuid: artifactRow.ai_artifact_version_uuid,
                    title: artifactRow.title,
                    description: artifactRow.description,
                    artifactType: artifactRow.artifact_type as
                        | 'chart'
                        | 'dashboard',
                });
            }
        }

        return artifactsMap;
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
                    | 'saved_query_uuid'
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
                `${AiPromptTableName}.saved_query_uuid`,
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

        const artifactRows = await this.database(AiArtifactVersionsTableName)
            .select<
                (DbAiArtifactVersion & {
                    artifact_type: 'chart' | 'dashboard';
                })[]
            >(
                `${AiArtifactsTableName}.ai_artifact_uuid`,
                `${AiArtifactVersionsTableName}.version_number`,
                `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                `${AiArtifactVersionsTableName}.title`,
                `${AiArtifactVersionsTableName}.description`,
                `${AiArtifactsTableName}.artifact_type`,
            )
            .join(
                AiArtifactsTableName,
                `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                `${AiArtifactsTableName}.ai_artifact_uuid`,
            )
            .where(`${AiArtifactVersionsTableName}.ai_prompt_uuid`, messageUuid)
            .orderBy(`${AiArtifactVersionsTableName}.created_at`, 'asc');

        const artifacts = artifactRows.map((artifactRow) => ({
            artifactUuid: artifactRow.ai_artifact_uuid,
            versionNumber: artifactRow.version_number,
            versionUuid: artifactRow.ai_artifact_version_uuid,
            title: artifactRow.title,
            description: artifactRow.description,
            artifactType: artifactRow.artifact_type as 'chart' | 'dashboard',
        }));

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
                const toolResults = await this.getToolResultsForPrompt(
                    row.ai_prompt_uuid,
                );
                const reasoning = await this.getReasoningForPrompt(
                    row.ai_prompt_uuid,
                );
                return {
                    role: 'assistant',
                    uuid: row.ai_prompt_uuid,
                    threadUuid: row.ai_thread_uuid,

                    // TODO: handle null response
                    message: row.response ?? '',
                    createdAt: row.responded_at?.toString() ?? '',

                    humanScore: row.human_score,
                    artifacts: artifacts.length > 0 ? artifacts : null,
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
                    toolResults,
                    reasoning,
                    savedQueryUuid: row.saved_query_uuid,
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
                        Pick<DbAiPrompt, 'prompt' | 'ai_prompt_uuid'> &
                        Pick<DbUser, 'user_uuid'> & { user_name: string }
                >
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
                humanScore: `${AiPromptTableName}.human_score`,
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
                ...(data.humanScore ? { human_score: data.humanScore } : {}),
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

    async updateMessageSavedQuery(data: {
        messageUuid: string;
        savedQueryUuid: string | null;
    }): Promise<void> {
        await this.database(AiPromptTableName)
            .update({
                saved_query_uuid: data.savedQueryUuid,
            })
            .where({
                ai_prompt_uuid: data.messageUuid,
            });
    }

    async updateArtifactVersion(
        artifactVersionUuid: string,
        update: Pick<AiArtifact, 'savedDashboardUuid'>,
    ): Promise<void> {
        await this.database(AiArtifactVersionsTableName)
            .update({
                saved_dashboard_uuid: update.savedDashboardUuid,
            } satisfies Partial<DbAiArtifactVersion>)
            .where({
                ai_artifact_version_uuid: artifactVersionUuid,
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
                humanScore: `${AiPromptTableName}.human_score`,
            })
            .where(`${AiPromptTableName}.ai_prompt_uuid`, promptUuid)
            .first();
    }

    async createWebAppThread(
        data: CreateWebAppThread,
        { db }: { db: Knex } = { db: this.database },
    ) {
        return AiAgentModel.withTrx(db, async (trx) => {
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

    async createWebAppPrompt(
        data: CreateWebAppPrompt,
        { db }: { db: Knex } = { db: this.database },
    ) {
        return AiAgentModel.withTrx(db, async (trx) => {
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

    async deleteUserAgentPreferences({
        userUuid,
        projectUuid,
    }: {
        userUuid: string;
        projectUuid: string;
    }): Promise<void> {
        await this.database(AiAgentUserPreferencesTableName)
            .where({ user_uuid: userUuid, project_uuid: projectUuid })
            .delete();
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

    // eslint-disable-next-line class-methods-use-this
    private parseToolResult(row: DbAiAgentToolResult): AiAgentToolResult {
        const toolName = ToolNameSchema.parse(row.tool_name);

        switch (toolName) {
            case 'proposeChange':
                return {
                    uuid: row.ai_agent_tool_result_uuid,
                    promptUuid: row.ai_prompt_uuid,
                    toolCallId: row.tool_call_id,
                    toolName,
                    result: row.result,
                    metadata:
                        toolProposeChangeOutputSchema.shape.metadata.parse(
                            row.metadata,
                        ),
                    createdAt: row.created_at,
                };
            default:
                return {
                    uuid: row.ai_agent_tool_result_uuid,
                    promptUuid: row.ai_prompt_uuid,
                    toolCallId: row.tool_call_id,
                    toolName,
                    result: row.result,
                    metadata: row.metadata as AgentToolOutput['metadata'],
                    createdAt: row.created_at,
                };
        }
    }

    /**
     * Gets all tool calls and results for a prompt using a single query
     * @param promptUuid
     * @returns Array<{toolCall: AiAgentToolCall, toolResult: AiAgentToolResult}>
     */
    async getToolCallsAndResultsForPrompt(promptUuid: string): Promise<
        Array<{
            toolCall: AiAgentToolCall;
            toolResult: AiAgentToolResult;
        }>
    > {
        const rows = await this.database(AiAgentToolCallTableName)
            .select<
                Array<
                    DbAiAgentToolCall &
                        Pick<
                            DbAiAgentToolResult,
                            'ai_agent_tool_result_uuid' | 'result' | 'metadata'
                        > & { result_created_at: Date }
                >
            >(
                `${AiAgentToolCallTableName}.*`,
                `${AiAgentToolResultTableName}.ai_agent_tool_result_uuid`,
                `${AiAgentToolResultTableName}.result`,
                `${AiAgentToolResultTableName}.metadata`,
                `${AiAgentToolResultTableName}.created_at as result_created_at`,
            )
            .innerJoin(
                AiAgentToolResultTableName,
                `${AiAgentToolCallTableName}.tool_call_id`,
                `${AiAgentToolResultTableName}.tool_call_id`,
            )
            .where(`${AiAgentToolCallTableName}.ai_prompt_uuid`, promptUuid)
            .orderBy(`${AiAgentToolCallTableName}.created_at`, 'asc');

        return rows.map((row) => {
            const toolCall = {
                uuid: row.ai_agent_tool_call_uuid,
                promptUuid: row.ai_prompt_uuid,
                toolCallId: row.tool_call_id,
                toolName: row.tool_name,
                toolArgs: row.tool_args,
                createdAt: row.created_at,
            } satisfies AiAgentToolCall;

            const toolResult = this.parseToolResult({
                ai_agent_tool_result_uuid: row.ai_agent_tool_result_uuid,
                ai_prompt_uuid: row.ai_prompt_uuid,
                tool_call_id: row.tool_call_id,
                tool_name: row.tool_name,
                result: row.result,
                metadata: row.metadata,
                created_at: row.result_created_at,
            });

            return {
                toolCall,
                toolResult,
            };
        });
    }

    async getToolCallsForPrompt(
        promptUuid: string,
    ): Promise<DbAiAgentToolCall[]> {
        return this.database(AiAgentToolCallTableName)
            .where('ai_prompt_uuid', promptUuid)
            .orderBy('created_at', 'asc');
    }

    async getToolResultsForPrompt(
        promptUuid: string,
    ): Promise<AiAgentToolResult[]> {
        const rows = await this.database(AiAgentToolResultTableName)
            .select<DbAiAgentToolResult[]>(
                'ai_agent_tool_result_uuid',
                'ai_prompt_uuid',
                'tool_call_id',
                'tool_name',
                'result',
                'metadata',
                'created_at',
            )
            .where('ai_prompt_uuid', promptUuid)
            .orderBy('created_at', 'asc');

        return rows.map(this.parseToolResult);
    }

    async createToolResults(
        data: Array<{
            promptUuid: string;
            toolCallId: string;
            toolName: string;
            result: string;
            metadata?: AgentToolOutput['metadata'];
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
                        ...(item.metadata && { metadata: item.metadata }),
                    })),
                )
                .returning('ai_agent_tool_result_uuid');

            return toolResults.map((tr) => tr.ai_agent_tool_result_uuid);
        });
    }

    async createReasoning(
        promptUuid: string,
        reasonings: Array<{ reasoningId: string; text: string }>,
    ): Promise<string[]> {
        if (reasonings.length === 0) return [];

        // Group by reasoningId and concatenate texts
        const grouped = reasonings.reduce<Record<string, string[]>>(
            (acc, r) => {
                if (!acc[r.reasoningId]) {
                    acc[r.reasoningId] = [];
                }
                acc[r.reasoningId].push(r.text);
                return acc;
            },
            {},
        );

        const inserted = await this.database(AiAgentReasoningTableName)
            .insert(
                Object.entries(grouped).map(([reasoningId, texts]) => ({
                    ai_prompt_uuid: promptUuid,
                    reasoning_id: reasoningId,
                    text: texts.join('\n\n'),
                })),
            )
            .returning('ai_agent_reasoning_uuid');

        return inserted.map((row) => row.ai_agent_reasoning_uuid);
    }

    async getReasoningForPrompt(
        promptUuid: string,
    ): Promise<AiAgentReasoning[]> {
        const rows = await this.database(AiAgentReasoningTableName)
            .where('ai_prompt_uuid', promptUuid)
            .orderBy('created_at', 'asc');

        return rows.map((row) => ({
            uuid: row.ai_agent_reasoning_uuid,
            promptUuid: row.ai_prompt_uuid,
            reasoningId: row.reasoning_id,
            text: row.text,
            createdAt: row.created_at,
        }));
    }

    async updateToolResultMetadata(
        promptUuid: string,
        toolCallId: string,
        metadata: AgentToolOutput['metadata'],
    ): Promise<void> {
        await this.database(AiAgentToolResultTableName)
            .where({
                ai_prompt_uuid: promptUuid,
                tool_call_id: toolCallId,
            })
            .update({
                metadata,
            });
    }

    async createArtifact(
        data: {
            threadUuid: string;
            promptUuid: string;
            artifactType: 'chart' | 'dashboard';
            title?: string;
            description?: string;
            vizConfig: Record<string, unknown>;
        },
        { db }: { db: Knex } = { db: this.database },
    ): Promise<AiArtifact> {
        return AiAgentModel.withTrx(db, async (trx) => {
            // Insert artifact
            const [artifact] = await trx<AiArtifactsTable>(AiArtifactsTableName)
                .insert({
                    ai_thread_uuid: data.threadUuid,
                    artifact_type: data.artifactType,
                })
                .returning('*');

            if (!artifact) {
                throw new Error('Failed to create artifact');
            }

            // Insert first version
            const [version] = await trx<AiArtifactVersionsTable>(
                AiArtifactVersionsTableName,
            )
                .insert({
                    ai_artifact_uuid: artifact.ai_artifact_uuid,
                    ai_prompt_uuid: data.promptUuid,
                    version_number: 1,
                    title: data.title ?? null,
                    description: data.description ?? null,
                    chart_config:
                        data.artifactType === 'chart' ? data.vizConfig : null,
                    dashboard_config:
                        data.artifactType === 'dashboard'
                            ? data.vizConfig
                            : null,
                    saved_query_uuid: null,
                    saved_dashboard_uuid: null,
                })
                .returning('*');

            if (!version) {
                throw new Error('Failed to create artifact version');
            }

            return {
                artifactUuid: artifact.ai_artifact_uuid,
                threadUuid: artifact.ai_thread_uuid,
                artifactType: artifact.artifact_type as 'chart' | 'dashboard',
                savedQueryUuid: version.saved_query_uuid,
                createdAt: artifact.created_at,
                versionNumber: version.version_number,
                versionUuid: version.ai_artifact_version_uuid,
                title: version.title,
                description: version.description,
                chartConfig: version.chart_config as AiArtifact['chartConfig'],
                dashboardConfig:
                    version.dashboard_config as AiArtifact['dashboardConfig'],
                promptUuid: version.ai_prompt_uuid,
                versionCreatedAt: version.created_at,
            } as AiArtifact;
        });
    }

    async createArtifactVersion(
        data: {
            artifactUuid: string;
            promptUuid: string;
            title?: string;
            description?: string;
            vizConfig: Record<string, unknown>;
        },
        { db }: { db: Knex } = { db: this.database },
    ): Promise<AiArtifact> {
        return AiAgentModel.withTrx(db, async (trx) => {
            // Get artifact to determine type
            const artifact = await trx<AiArtifactsTable>(AiArtifactsTableName)
                .select('*')
                .where('ai_artifact_uuid', data.artifactUuid)
                .first();

            if (!artifact) {
                throw new NotFoundError('Artifact not found');
            }

            // Get next version number
            const result = await trx<AiArtifactVersionsTable>(
                AiArtifactVersionsTableName,
            )
                .select(
                    trx.raw(
                        'COALESCE(MAX(version_number), 0) + 1 as next_version',
                    ),
                )
                .where('ai_artifact_uuid', data.artifactUuid)
                .first<{ next_version: number }>();

            const nextVersion = result?.next_version ?? 1;

            // Insert new version
            const [version] = await trx<AiArtifactVersionsTable>(
                AiArtifactVersionsTableName,
            )
                .insert({
                    ai_artifact_uuid: data.artifactUuid,
                    ai_prompt_uuid: data.promptUuid,
                    version_number: nextVersion,
                    title: data.title ?? null,
                    description: data.description ?? null,
                    chart_config:
                        artifact.artifact_type === 'chart'
                            ? data.vizConfig
                            : null,
                    dashboard_config:
                        artifact.artifact_type === 'dashboard'
                            ? data.vizConfig
                            : null,
                    saved_query_uuid: null,
                    saved_dashboard_uuid: null,
                })
                .returning('*');

            if (!version) {
                throw new Error('Failed to create artifact version');
            }

            return {
                artifactUuid: artifact.ai_artifact_uuid,
                threadUuid: artifact.ai_thread_uuid,
                artifactType: artifact.artifact_type,
                savedQueryUuid: version.saved_query_uuid,
                createdAt: artifact.created_at,
                versionNumber: version.version_number,
                versionUuid: version.ai_artifact_version_uuid,
                title: version.title,
                description: version.description,
                chartConfig: version.chart_config as AiArtifact['chartConfig'],
                dashboardConfig:
                    version.dashboard_config as AiArtifact['dashboardConfig'],
                promptUuid: version.ai_prompt_uuid,
                versionCreatedAt: version.created_at,
            } as AiArtifact;
        });
    }

    async createOrUpdateArtifact(data: {
        threadUuid: string;
        promptUuid: string;
        artifactType: 'chart' | 'dashboard';
        title?: string;
        description?: string;
        vizConfig: Record<string, unknown>;
        retry?: boolean;
    }): Promise<AiArtifact> {
        try {
            return await this.database.transaction(async (trx) => {
                const existingArtifacts = await this.findArtifactsByThreadUuid(
                    data.threadUuid,
                    data.artifactType,
                    { db: trx },
                );

                if (existingArtifacts.length > 0) {
                    // TODO: Currently assuming first artifact in array since we only support one artifact per thread per artifact type
                    // In the future, we may support multiple artifacts per thread
                    const existingArtifact = existingArtifacts[0];
                    return this.createArtifactVersion(
                        {
                            artifactUuid: existingArtifact.artifactUuid,
                            promptUuid: data.promptUuid,
                            title: data.title,
                            description: data.description,
                            vizConfig: data.vizConfig,
                        },
                        {
                            db: trx,
                        },
                    );
                }

                return this.createArtifact({ ...data }, { db: trx });
            });
        } catch (e) {
            if (!data.retry) {
                // TODO fix the race condition for version number
                // this temporarily fixes the issue by retrying the operation
                return this.createOrUpdateArtifact({ ...data, retry: true });
            }
            throw e;
        }
    }

    async getArtifact(
        artifactUuid: string,
        versionUuid?: string,
    ): Promise<AiArtifact> {
        const query = this.database
            .select({
                artifactUuid: `${AiArtifactsTableName}.ai_artifact_uuid`,
                threadUuid: `${AiArtifactsTableName}.ai_thread_uuid`,
                artifactType: `${AiArtifactsTableName}.artifact_type`,
                savedQueryUuid: `${AiArtifactVersionsTableName}.saved_query_uuid`,
                savedDashboardUuid: `${AiArtifactVersionsTableName}.saved_dashboard_uuid`,
                createdAt: `${AiArtifactsTableName}.created_at`,
                versionNumber: `${AiArtifactVersionsTableName}.version_number`,
                versionUuid: `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                title: `${AiArtifactVersionsTableName}.title`,
                description: `${AiArtifactVersionsTableName}.description`,
                chartConfig: `${AiArtifactVersionsTableName}.chart_config`,
                dashboardConfig: `${AiArtifactVersionsTableName}.dashboard_config`,
                promptUuid: `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
                versionCreatedAt: `${AiArtifactVersionsTableName}.created_at`,
            } satisfies Record<keyof AiArtifact, string>)
            .from(AiArtifactsTableName)
            .join(
                AiArtifactVersionsTableName,
                `${AiArtifactsTableName}.ai_artifact_uuid`,
                `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
            );

        if (versionUuid) {
            // Get specific version by UUID
            void query.where(
                `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                versionUuid,
            );
        } else {
            // Get latest version by artifact UUID
            void query
                .where(`${AiArtifactsTableName}.ai_artifact_uuid`, artifactUuid)
                .andWhere(
                    `${AiArtifactVersionsTableName}.version_number`,
                    this.database
                        .select(this.database.raw('MAX(version_number)'))
                        .from(AiArtifactVersionsTableName)
                        .where(
                            'ai_artifact_uuid',
                            this.database.ref(
                                `${AiArtifactsTableName}.ai_artifact_uuid`,
                            ),
                        ),
                );
        }

        const result = await query.first<AiArtifact>();

        if (!result) {
            const identifier = versionUuid
                ? `${artifactUuid}, version ${versionUuid}`
                : `${artifactUuid}`;
            throw new NotFoundError(`Artifact ${identifier} not found`);
        }

        return result;
    }

    async findArtifactsByThreadUuid(
        threadUuid: string,
        artifactType?: AiArtifact['artifactType'],
        { db }: { db: Knex } = { db: this.database },
    ): Promise<AiArtifact[]> {
        return AiAgentModel.withTrx(db, async (trx) => {
            const query = trx
                .select({
                    artifactUuid: `${AiArtifactsTableName}.ai_artifact_uuid`,
                    threadUuid: `${AiArtifactsTableName}.ai_thread_uuid`,
                    artifactType: `${AiArtifactsTableName}.artifact_type`,
                    savedQueryUuid: `${AiArtifactVersionsTableName}.saved_query_uuid`,
                    savedDashboardUuid: `${AiArtifactVersionsTableName}.saved_dashboard_uuid`,
                    createdAt: `${AiArtifactsTableName}.created_at`,
                    versionNumber: `${AiArtifactVersionsTableName}.version_number`,
                    versionUuid: `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                    title: `${AiArtifactVersionsTableName}.title`,
                    description: `${AiArtifactVersionsTableName}.description`,
                    chartConfig: `${AiArtifactVersionsTableName}.chart_config`,
                    dashboardConfig: `${AiArtifactVersionsTableName}.dashboard_config`,
                    promptUuid: `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
                    versionCreatedAt: `${AiArtifactVersionsTableName}.created_at`,
                } satisfies Record<keyof AiArtifact, string>)
                .from(AiArtifactsTableName)
                .join(
                    AiArtifactVersionsTableName,
                    `${AiArtifactsTableName}.ai_artifact_uuid`,
                    `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                )
                .where(`${AiArtifactsTableName}.ai_thread_uuid`, threadUuid)
                .andWhere(
                    `${AiArtifactVersionsTableName}.version_number`,
                    this.database
                        .select(this.database.raw('MAX(version_number)'))
                        .from(AiArtifactVersionsTableName)
                        .where(
                            'ai_artifact_uuid',
                            this.database.ref(
                                `${AiArtifactsTableName}.ai_artifact_uuid`,
                            ),
                        ),
                )
                .orderBy(`${AiArtifactsTableName}.created_at`, 'desc');

            if (artifactType) {
                void query.andWhere(
                    `${AiArtifactsTableName}.artifact_type`,
                    artifactType,
                );
            }

            const results = await query;
            return results;
        });
    }

    async updateThreadTitle({
        threadUuid,
        title,
    }: {
        threadUuid: string;
        title: string;
    }): Promise<void> {
        await this.database(AiThreadTableName)
            .where('ai_thread_uuid', threadUuid)
            .update({
                title,
                title_generated_at: new Date(),
            });
    }

    async appendInstruction(data: {
        agentUuid: string;
        instruction: string;
    }): Promise<string> {
        const currentInstruction = await this.getAgentLastInstruction({
            agentUuid: data.agentUuid,
        });

        const updatedInstruction = currentInstruction
            ? `${currentInstruction}\n\n${data.instruction}`
            : data.instruction;

        await this.database(AiAgentInstructionVersionsTableName).insert({
            ai_agent_uuid: data.agentUuid,
            instruction: updatedInstruction,
        });

        return updatedInstruction;
    }

    async createEval(
        agentUuid: string,
        data: ApiCreateEvaluationRequest,
        createdByUserUuid: string,
    ): Promise<AiAgentEvaluation> {
        return this.database.transaction(async (trx) => {
            const [evalRecord] = await trx(AiEvalTableName)
                .insert({
                    agent_uuid: agentUuid,
                    title: data.title,
                    description: data.description ?? null,
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning('*');

            // Create prompts - handle both string and object format
            const promptInserts = data.prompts.map((promptData) => {
                if (typeof promptData === 'string') {
                    // Legacy string format
                    return {
                        ai_eval_uuid: evalRecord.ai_eval_uuid,
                        prompt: promptData,
                        ai_prompt_uuid: null,
                        ai_thread_uuid: null,
                    };
                }
                // New object format with referenced prompt/thread
                return {
                    ai_eval_uuid: evalRecord.ai_eval_uuid,
                    prompt: null,
                    ai_prompt_uuid: promptData.promptUuid,
                    ai_thread_uuid: promptData.threadUuid,
                };
            });

            const promptRecords = await trx(AiEvalPromptTableName)
                .insert(promptInserts)
                .returning('*');

            return {
                evalUuid: evalRecord.ai_eval_uuid,
                agentUuid: evalRecord.agent_uuid,
                title: evalRecord.title,
                description: evalRecord.description,
                createdAt: evalRecord.created_at,
                updatedAt: evalRecord.updated_at,
                prompts: promptRecords.map((p) => ({
                    evalPromptUuid: p.ai_eval_prompt_uuid,
                    createdAt: p.created_at,
                    ...(p.prompt
                        ? {
                              type: 'string' as const,
                              prompt: p.prompt,
                          }
                        : {
                              type: 'thread' as const,
                              promptUuid: p.ai_prompt_uuid!,
                              threadUuid: p.ai_thread_uuid!,
                          }),
                })),
            };
        });
    }

    async getEval({
        evalUuid,
        agentUuid,
    }: {
        evalUuid: string;
        agentUuid?: string;
    }): Promise<AiAgentEvaluation> {
        const evalQuery = this.database(AiEvalTableName).where(
            'ai_eval_uuid',
            evalUuid,
        );

        if (agentUuid) {
            void evalQuery.andWhere('agent_uuid', agentUuid);
        }

        const [evalRecord, prompts] = await Promise.all([
            evalQuery.first(),
            this.database(AiEvalPromptTableName)
                .where('ai_eval_uuid', evalUuid)
                .orderBy('created_at', 'asc'),
        ]);

        if (!evalRecord)
            throw new NotFoundError(
                `Evaluation not found for uuid: ${evalUuid}`,
            );

        return {
            evalUuid: evalRecord.ai_eval_uuid,
            agentUuid: evalRecord.agent_uuid,
            title: evalRecord.title,
            description: evalRecord.description,
            createdAt: evalRecord.created_at,
            updatedAt: evalRecord.updated_at,
            prompts: prompts.map((p) => ({
                evalPromptUuid: p.ai_eval_prompt_uuid,
                createdAt: p.created_at,
                ...(p.prompt
                    ? {
                          type: 'string' as const,
                          prompt: p.prompt,
                      }
                    : {
                          type: 'thread' as const,
                          promptUuid: p.ai_prompt_uuid!,
                          threadUuid: p.ai_thread_uuid!,
                      }),
            })),
        };
    }

    async getEvalsByAgent(
        agentUuid: string,
    ): Promise<AiAgentEvaluationSummary[]> {
        const evals = await this.database(AiEvalTableName)
            .where('agent_uuid', agentUuid)
            .orderBy('created_at', 'desc');

        return evals.map((evalRecord) => ({
            evalUuid: evalRecord.ai_eval_uuid,
            agentUuid: evalRecord.agent_uuid,
            title: evalRecord.title,
            description: evalRecord.description,
            createdAt: evalRecord.created_at,
            updatedAt: evalRecord.updated_at,
        }));
    }

    async updateEval(
        evalUuid: string,
        data: ApiUpdateEvaluationRequest,
    ): Promise<AiAgentEvaluation> {
        await AiAgentModel.withTrx(this.database, async (trx) => {
            if (data.title !== undefined || data.description !== undefined) {
                await trx(AiEvalTableName)
                    .where('ai_eval_uuid', evalUuid)
                    .update({
                        ...(data.title !== undefined
                            ? { title: data.title }
                            : {}),
                        ...(data.description !== undefined
                            ? { description: data.description }
                            : {}),
                        updated_at: trx.fn.now(),
                    });
            }

            if (data.prompts !== undefined) {
                // Delete existing prompts
                await trx(AiEvalPromptTableName)
                    .where('ai_eval_uuid', evalUuid)
                    .delete();

                // Insert new prompts - handle both string and object format
                if (data.prompts.length > 0) {
                    const promptRecords = data.prompts.map((promptData) => {
                        if (typeof promptData === 'string') {
                            // Legacy string format
                            return {
                                ai_eval_uuid: evalUuid,
                                prompt: promptData,
                                ai_prompt_uuid: null,
                                ai_thread_uuid: null,
                            };
                        }
                        // New object format with referenced prompt/thread
                        return {
                            ai_eval_uuid: evalUuid,
                            prompt: null,
                            ai_prompt_uuid: promptData.promptUuid,
                            ai_thread_uuid: promptData.threadUuid,
                        };
                    });
                    await trx(AiEvalPromptTableName).insert(promptRecords);
                }
            }
        });

        return this.getEval({ evalUuid });
    }

    async appendToEval(
        evalUuid: string,
        data: ApiAppendEvaluationRequest,
    ): Promise<AiAgentEvaluation> {
        await AiAgentModel.withTrx(this.database, async (trx) => {
            if (data.prompts.length === 0) return;

            await trx(AiEvalTableName).where('ai_eval_uuid', evalUuid).update({
                updated_at: trx.fn.now(),
            });

            const promptRecords = data.prompts.map((promptData) => {
                if (typeof promptData === 'string') {
                    return {
                        ai_eval_uuid: evalUuid,
                        prompt: promptData,
                        ai_prompt_uuid: null,
                        ai_thread_uuid: null,
                    };
                }
                return {
                    ai_eval_uuid: evalUuid,
                    prompt: null,
                    ai_prompt_uuid: promptData.promptUuid,
                    ai_thread_uuid: promptData.threadUuid,
                };
            });
            await trx(AiEvalPromptTableName).insert(promptRecords);
        });

        return this.getEval({ evalUuid });
    }

    async deleteEval(evalUuid: string): Promise<void> {
        await this.database(AiEvalTableName)
            .where('ai_eval_uuid', evalUuid)
            .delete();
    }

    async createEvalRun(
        evalUuid: string,
    ): Promise<AiAgentEvaluationRunSummary> {
        const [runRecord] = await this.database(AiEvalRunTableName)
            .insert({ ai_eval_uuid: evalUuid })
            .returning('*');

        return {
            runUuid: runRecord.ai_eval_run_uuid,
            evalUuid: runRecord.ai_eval_uuid,
            status: runRecord.status,
            completedAt: runRecord.completed_at,
            createdAt: runRecord.created_at,
        };
    }

    async updateEvalRunStatus(
        runUuid: string,
        status: DbAiEvalRun['status'],
        completedAt?: Date,
    ): Promise<void> {
        const update: Partial<DbAiEvalRun> = { status };
        if (completedAt) update.completed_at = completedAt;

        await this.database(AiEvalRunTableName)
            .where('ai_eval_run_uuid', runUuid)
            .update(update);
    }

    async createEvalRunResult(
        runUuid: string,
        promptUuid: string,
        threadUuid: string,
    ): Promise<string> {
        const [evalRunResult] = await this.database(AiEvalRunResultTableName)
            .insert({
                ai_eval_run_uuid: runUuid,
                ai_eval_prompt_uuid: promptUuid,
                ai_thread_uuid: threadUuid,
            })
            .returning(['ai_eval_run_result_uuid']);

        if (!evalRunResult) {
            throw new Error('Failed to create evaluation run result');
        }

        return evalRunResult.ai_eval_run_result_uuid;
    }

    async updateEvalRunResult(
        resultUuid: string,
        data: {
            status?: DbAiEvalRunResult['status'];
            threadUuid?: string;
            errorMessage?: string;
            completedAt?: Date;
        },
    ): Promise<void> {
        const update: Partial<DbAiEvalRunResult> = {};

        if (data.status !== undefined) update.status = data.status;
        if (data.threadUuid !== undefined)
            update.ai_thread_uuid = data.threadUuid;
        if (data.errorMessage !== undefined)
            update.error_message = data.errorMessage;
        if (data.completedAt !== undefined)
            update.completed_at = data.completedAt;

        await this.database(AiEvalRunResultTableName)
            .where('ai_eval_run_result_uuid', resultUuid)
            .update(update);
    }

    async getEvalRunResult(
        resultUuid: string,
    ): Promise<AiAgentEvaluationRunResult> {
        const result = await this.database(AiEvalRunResultTableName)
            .where('ai_eval_run_result_uuid', resultUuid)
            .first();

        if (!result) {
            throw new NotFoundError(
                `Evaluation run result not found for uuid: ${resultUuid}`,
            );
        }

        return {
            resultUuid: result.ai_eval_run_result_uuid,
            evalPromptUuid: result.ai_eval_prompt_uuid,
            threadUuid: result.ai_thread_uuid,
            status: result.status,
            errorMessage: result.error_message,
            completedAt: result.completed_at,
            createdAt: result.created_at,
        };
    }

    async getEvalRuns(
        evalUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<{ runs: AiAgentEvaluationRunSummary[] }>> {
        const query = this.database(AiEvalRunTableName)
            .select<DbAiEvalRun[]>('*')
            .where('ai_eval_uuid', evalUuid)
            .orderBy('created_at', 'desc');

        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        const runs: AiAgentEvaluationRunSummary[] = data.map(
            (run: DbAiEvalRun) => ({
                runUuid: run.ai_eval_run_uuid,
                evalUuid: run.ai_eval_uuid,
                status: run.status,
                completedAt: run.completed_at,
                createdAt: run.created_at,
            }),
        );

        return {
            data: {
                runs,
            },
            pagination,
        };
    }

    async getEvalRunWithResults(
        runUuid: string,
    ): Promise<AiAgentEvaluationRun> {
        const run = await this.database(AiEvalRunTableName)
            .where('ai_eval_run_uuid', runUuid)
            .first();

        if (!run)
            throw new NotFoundError(
                `Evaluation run not found for uuid: ${runUuid}`,
            );

        const results = await this.database(AiEvalRunResultTableName)
            .leftJoin(
                AiEvalPromptTableName,
                `${AiEvalRunResultTableName}.ai_eval_prompt_uuid`,
                `${AiEvalPromptTableName}.ai_eval_prompt_uuid`,
            )
            .where(`${AiEvalRunResultTableName}.ai_eval_run_uuid`, runUuid)
            .select<
                (Pick<
                    DbAiEvalRunResult,
                    | 'ai_eval_run_result_uuid'
                    | 'error_message'
                    | 'completed_at'
                    | 'created_at'
                    | 'status'
                    | 'ai_thread_uuid'
                > &
                    Pick<DbAiEvalPrompt, 'ai_eval_prompt_uuid'>)[]
            >(
                `${AiEvalRunResultTableName}.ai_eval_run_result_uuid`,
                `${AiEvalRunResultTableName}.error_message`,
                `${AiEvalRunResultTableName}.completed_at`,
                `${AiEvalRunResultTableName}.created_at`,
                `${AiEvalRunResultTableName}.status`,
                `${AiEvalRunResultTableName}.ai_thread_uuid`,
                `${AiEvalPromptTableName}.ai_eval_prompt_uuid`,
            )
            .orderBy(`${AiEvalRunResultTableName}.created_at`, 'asc');

        return {
            runUuid: run.ai_eval_run_uuid,
            evalUuid: run.ai_eval_uuid,
            status: run.status,
            completedAt: run.completed_at,
            createdAt: run.created_at,
            results: results.map((result) => ({
                resultUuid: result.ai_eval_run_result_uuid,
                evalPromptUuid: result.ai_eval_prompt_uuid,
                threadUuid: result.ai_thread_uuid,
                status: result.status,
                errorMessage: result.error_message,
                completedAt: result.completed_at,
                createdAt: result.created_at,
            })),
        };
    }

    async checkAndUpdateEvalRunCompletion(evalRunUuid: string): Promise<void> {
        return this.database.transaction(async (trx) => {
            const runData = await this.getEvalRunWithResults(evalRunUuid);
            if (!runData) return;

            const allCompleted = runData.results.every(
                (r) => r.status === 'completed' || r.status === 'failed',
            );

            if (allCompleted) {
                const hasFailures = runData.results.some(
                    (r) => r.status === 'failed',
                );
                await trx(AiEvalRunTableName)
                    .where('ai_eval_run_uuid', evalRunUuid)
                    .update({
                        status: hasFailures ? 'failed' : 'completed',
                        completed_at: new Date(),
                    });
            }
        });
    }

    private async cloneThreadArtifacts({
        sourceThreadUuid,
        targetThreadUuid,
        db,
    }: {
        sourceThreadUuid: string;
        targetThreadUuid: string;
        db?: Knex;
    }): Promise<Map<string, string>> {
        return AiAgentModel.withTrx(db ?? this.database, async (trx) => {
            const sourceArtifacts = await trx<AiArtifactsTable>(
                AiArtifactsTableName,
            )
                .select('ai_artifact_uuid', 'artifact_type', 'created_at')
                .where('ai_thread_uuid', sourceThreadUuid);

            const artifactMapping = new Map<string, string>();

            const clonePromises = sourceArtifacts.map(
                async (sourceArtifact) => {
                    const [newArtifact] = await trx<AiArtifactsTable>(
                        AiArtifactsTableName,
                    )
                        .insert({
                            ai_thread_uuid: targetThreadUuid,
                            artifact_type: sourceArtifact.artifact_type,
                        })
                        .returning('ai_artifact_uuid');

                    if (!newArtifact) {
                        throw new Error(
                            `Failed to clone artifact ${sourceArtifact.ai_artifact_uuid}`,
                        );
                    }

                    return {
                        oldUuid: sourceArtifact.ai_artifact_uuid,
                        newUuid: newArtifact.ai_artifact_uuid,
                    };
                },
            );

            const clonedArtifacts = await Promise.all(clonePromises);
            clonedArtifacts.forEach(({ oldUuid, newUuid }) => {
                artifactMapping.set(oldUuid, newUuid);
            });

            return artifactMapping;
        });
    }

    private async cloneWebAppPrompt({
        sourcePromptUuid,
        targetThreadUuid,
        targetUserUuid,
        artifactMapping,
        includeAssistantResponse = true,
        db,
    }: {
        sourcePromptUuid: string;
        targetThreadUuid: string;
        targetUserUuid: string;
        artifactMapping: Map<string, string>;
        includeAssistantResponse?: boolean;
        db?: Knex;
    }): Promise<string> {
        return AiAgentModel.withTrx(db ?? this.database, async (trx) => {
            const sourcePrompt = await trx(AiPromptTableName)
                .select(
                    'prompt',
                    'response',
                    'responded_at',
                    'created_by_user_uuid',
                    'created_at',
                    // we dont copy legacy fields
                    // we don't copy saved chart link
                    // we don't copy human score
                )
                .where('ai_prompt_uuid', sourcePromptUuid)
                .first();

            if (!sourcePrompt) {
                throw new NotFoundError(
                    `Source prompt ${sourcePromptUuid} not found`,
                );
            }

            const newPromptUuid = await this.createWebAppPrompt(
                {
                    threadUuid: targetThreadUuid,
                    createdByUserUuid: targetUserUuid,
                    prompt: sourcePrompt.prompt,
                },
                { db: trx },
            );

            // Update with assistant response data if needed
            if (includeAssistantResponse) {
                if (
                    sourcePrompt.created_at ||
                    (sourcePrompt.response && sourcePrompt.responded_at)
                ) {
                    await trx(AiPromptTableName)
                        .where('ai_prompt_uuid', newPromptUuid)
                        // @ts-expect-error - responded_at is a date and update works `created_at` is not in the update type but we just need it for cloning
                        .update({
                            ...(sourcePrompt.created_at && {
                                created_at: sourcePrompt.created_at,
                            }),
                            ...(sourcePrompt.response &&
                                sourcePrompt.responded_at && {
                                    response: sourcePrompt.response,

                                    responded_at: sourcePrompt.responded_at,
                                }),
                        });
                }
            }

            // Clone assistant response data if requested
            if (includeAssistantResponse) {
                // Clone tool calls
                const toolCalls = await trx(AiAgentToolCallTableName)
                    .select(
                        'tool_call_id',
                        'tool_name',
                        'tool_args',
                        'created_at',
                    )
                    .where('ai_prompt_uuid', sourcePromptUuid);

                const toolCallUpdates = toolCalls.map((toolCall) => ({
                    ai_prompt_uuid: newPromptUuid,
                    tool_call_id: toolCall.tool_call_id,
                    tool_name: toolCall.tool_name,
                    tool_args: toolCall.tool_args,
                }));

                // Clone tool results
                const toolResults = await trx(AiAgentToolResultTableName)
                    .select(
                        'tool_call_id',
                        'tool_name',
                        'result',
                        'metadata',
                        'created_at',
                    )
                    .where('ai_prompt_uuid', sourcePromptUuid);

                const toolResultUpdates = toolResults.map((toolResult) => ({
                    ai_prompt_uuid: newPromptUuid,
                    tool_call_id: toolResult.tool_call_id,
                    tool_name: toolResult.tool_name,
                    result: toolResult.result,
                    metadata: toolResult.metadata,
                }));

                await Promise.all([
                    toolCallUpdates.length > 0 &&
                        trx(AiAgentToolCallTableName).insert(toolCallUpdates),
                    toolResultUpdates.length > 0 &&
                        trx(AiAgentToolResultTableName).insert(
                            toolResultUpdates,
                        ),
                ]);

                // Clone artifact versions
                const artifactVersions = await trx(AiArtifactVersionsTableName)
                    .select(
                        'ai_artifact_uuid',
                        'version_number',
                        'title',
                        'description',
                        'chart_config',
                        'dashboard_config',
                        // we don't copy saved query or dashboard uuid
                    )
                    .where('ai_prompt_uuid', sourcePromptUuid);

                const artifactVersionInserts = artifactVersions.map(
                    (artifactVersion) => {
                        const newArtifactUuid = artifactMapping.get(
                            artifactVersion.ai_artifact_uuid,
                        );

                        if (!newArtifactUuid) {
                            throw new Error(
                                `No mapping found for artifact ${artifactVersion.ai_artifact_uuid}`,
                            );
                        }
                        return {
                            ai_artifact_uuid: newArtifactUuid,
                            ai_prompt_uuid: newPromptUuid,
                            version_number: artifactVersion.version_number,
                            title: artifactVersion.title,
                            description: artifactVersion.description,
                            chart_config: artifactVersion.chart_config,
                            dashboard_config: artifactVersion.dashboard_config,
                        };
                    },
                );

                if (artifactVersionInserts.length > 0) {
                    await trx(AiArtifactVersionsTableName).insert(
                        artifactVersionInserts,
                    );
                }
            }

            return newPromptUuid;
        });
    }

    async cloneThread({
        sourceThreadUuid,
        sourcePromptUuid,
        targetUserUuid,
        createdFrom,
        db,
    }: {
        sourceThreadUuid: string;
        sourcePromptUuid: string;
        targetUserUuid: string;
        createdFrom?: 'web_app' | 'evals';
        db?: Knex;
    }): Promise<string> {
        return AiAgentModel.withTrx(db ?? this.database, async (trx) => {
            // Get source thread metadata
            const sourceThread = await trx(AiThreadTableName)
                .select(
                    'organization_uuid',
                    'project_uuid',
                    'agent_uuid',
                    'created_from',
                    'title',
                )
                .where('ai_thread_uuid', sourceThreadUuid)
                .first();

            if (!sourceThread) {
                throw new NotFoundError(
                    `Source thread ${sourceThreadUuid} not found`,
                );
            }

            // Create new thread using existing method
            const newThreadUuid = await this.createWebAppThread(
                {
                    organizationUuid: sourceThread.organization_uuid,
                    projectUuid: sourceThread.project_uuid,
                    agentUuid: sourceThread.agent_uuid,
                    userUuid: targetUserUuid,
                    // If `createdFrom` is not passed, default all cloned threads to web_app
                    createdFrom: createdFrom ?? 'web_app',
                },
                { db: trx },
            );

            // Clone thread artifacts and get mapping
            const artifactMapping = await this.cloneThreadArtifacts({
                sourceThreadUuid,
                targetThreadUuid: newThreadUuid,
                db: trx,
            });

            // Get all prompts up to the specified prompt (inclusive)
            const sourcePrompts = await trx(AiPromptTableName)
                .select('ai_prompt_uuid', 'created_at')
                .where('ai_thread_uuid', sourceThreadUuid)
                .orderBy('created_at', 'asc');

            // Find the target prompt index
            const targetPromptIndex = sourcePrompts.findIndex(
                (p) => p.ai_prompt_uuid === sourcePromptUuid,
            );

            if (targetPromptIndex === -1) {
                throw new NotFoundError(
                    `Source prompt ${sourcePromptUuid} not found in thread ${sourceThreadUuid}`,
                );
            }

            // Get prompts up to and including the target prompt
            const promptsToClone = sourcePrompts.slice(
                0,
                targetPromptIndex + 1,
            );

            // Clone each prompt sequentially to maintain chronological order
            // eslint-disable-next-line no-await-in-loop
            for (let i = 0; i < promptsToClone.length; i += 1) {
                const promptToClone = promptsToClone[i];
                const isLastPrompt = i === promptsToClone.length - 1;

                // eslint-disable-next-line no-await-in-loop
                await this.cloneWebAppPrompt({
                    sourcePromptUuid: promptToClone.ai_prompt_uuid,
                    targetThreadUuid: newThreadUuid,
                    targetUserUuid,
                    artifactMapping,
                    includeAssistantResponse: !isLastPrompt,
                    db: trx,
                });
            }

            return newThreadUuid;
        });
    }
}
