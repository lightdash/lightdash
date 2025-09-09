import {
    AiAgentAdminConversationsSummary,
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentAdminThreadSummary,
    AiAgentMessage,
    AiAgentMessageAssistant,
    AiAgentMessageUser,
    AiAgentNotFoundError,
    AiAgentSummary,
    AiAgentThreadSummary,
    AiAgentUser,
    AiAgentUserPreferences,
    AiArtifact,
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
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    SlackPrompt,
    ToolName,
    UpdateSlackResponse,
    UpdateSlackResponseTs,
    UpdateWebAppResponse,
    type AiAgent,
} from '@lightdash/common';
import { Knex } from 'knex';
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
} from '../database/entities/aiArtifacts';

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
            );

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
                    | 'saved_query_uuid'
                > &
                    Pick<DbUser, 'user_uuid'> &
                    Pick<DbAiThread, 'ai_thread_uuid'> &
                    Pick<DbAiSlackPrompt, 'slack_user_id'> &
                    Pick<DbAiWebAppPrompt, 'user_uuid'> & {
                        user_name: string;
                        ai_artifact_uuid: string | null;
                        version_number: number | null;
                        ai_artifact_version_uuid: string | null;
                        title: string | null;
                        description: string | null;
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
                `${AiArtifactsTableName}.ai_artifact_uuid`,
                `${AiArtifactVersionsTableName}.version_number`,
                `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                `${AiArtifactVersionsTableName}.title`,
                `${AiArtifactVersionsTableName}.description`,
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
            .leftJoin(
                AiArtifactVersionsTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
            )
            .leftJoin(
                AiArtifactsTableName,
                `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                `${AiArtifactsTableName}.ai_artifact_uuid`,
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
                    artifact: row.ai_artifact_uuid
                        ? {
                              uuid: row.ai_artifact_uuid,
                              versionNumber: row.version_number ?? 1,
                              versionUuid: row.ai_artifact_version_uuid!,
                              title: row.title,
                              description: row.description,
                          }
                        : null,
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
                    savedQueryUuid: row.saved_query_uuid,
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
                    | 'saved_query_uuid'
                > &
                    Pick<DbUser, 'user_uuid'> &
                    Pick<DbAiThread, 'ai_thread_uuid'> &
                    Pick<DbAiSlackPrompt, 'slack_user_id'> &
                    Pick<DbAiWebAppPrompt, 'user_uuid'> & {
                        user_name: string;
                        ai_artifact_uuid: string | null;
                        version_number: number | null;
                        ai_artifact_version_uuid: string | null;
                        title: string | null;
                        description: string | null;
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
                `${AiArtifactsTableName}.ai_artifact_uuid`,
                `${AiArtifactVersionsTableName}.version_number`,
                `${AiArtifactVersionsTableName}.ai_artifact_version_uuid`,
                `${AiArtifactVersionsTableName}.title`,
                `${AiArtifactVersionsTableName}.description`,
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
            .leftJoin(
                AiArtifactVersionsTableName,
                `${AiPromptTableName}.ai_prompt_uuid`,
                `${AiArtifactVersionsTableName}.ai_prompt_uuid`,
            )
            .leftJoin(
                AiArtifactsTableName,
                `${AiArtifactVersionsTableName}.ai_artifact_uuid`,
                `${AiArtifactsTableName}.ai_artifact_uuid`,
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
                    artifact: row.ai_artifact_uuid
                        ? {
                              uuid: row.ai_artifact_uuid,
                              versionNumber: row.version_number ?? 1,
                              versionUuid: row.ai_artifact_version_uuid!,
                              title: row.title,
                              description: row.description,
                          }
                        : null,
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
                ...(data.vizConfigOutput
                    ? { viz_config_output: data.vizConfigOutput }
                    : {}),
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

    async getToolResultsForPrompt(
        promptUuid: string,
    ): Promise<DbAiAgentToolResult[]> {
        return this.database(AiAgentToolResultTableName)
            .where('ai_prompt_uuid', promptUuid)
            .orderBy('created_at', 'asc');
    }

    async getToolCallsAndResultsForPrompt(promptUuid: string) {
        const toolCallsAndResults = await this.database(
            AiAgentToolCallTableName,
        )
            .select<
                Array<
                    Pick<
                        DbAiAgentToolCall,
                        | 'ai_agent_tool_call_uuid'
                        | 'tool_call_id'
                        | 'tool_name'
                        | 'tool_args'
                        | 'created_at'
                    > &
                        Pick<
                            DbAiAgentToolResult,
                            'ai_agent_tool_result_uuid' | 'result'
                        >
                >
            >(
                `${AiAgentToolCallTableName}.ai_agent_tool_call_uuid`,
                `${AiAgentToolCallTableName}.tool_call_id`,
                `${AiAgentToolCallTableName}.tool_name`,
                `${AiAgentToolCallTableName}.tool_args`,
                `${AiAgentToolCallTableName}.created_at`,
                `${AiAgentToolResultTableName}.ai_agent_tool_result_uuid`,
                `${AiAgentToolResultTableName}.result`,
            )
            // we only want to return tool_calls that have a matching tool_result
            .innerJoin(
                AiAgentToolResultTableName,
                `${AiAgentToolCallTableName}.tool_call_id`,
                `${AiAgentToolResultTableName}.tool_call_id`,
            )
            .where(`${AiAgentToolCallTableName}.ai_prompt_uuid`, promptUuid)
            .andWhere(
                `${AiAgentToolResultTableName}.ai_prompt_uuid`,
                promptUuid,
            )
            .orderBy(`${AiAgentToolCallTableName}.created_at`, 'asc');

        return toolCallsAndResults;
    }

    async createArtifact(data: {
        threadUuid: string;
        promptUuid: string;
        artifactType: 'chart' | 'dashboard';
        title?: string;
        description?: string;
        vizConfig: Record<string, unknown>;
    }): Promise<AiArtifact> {
        return this.database.transaction(async (trx) => {
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
                chartConfig: version.chart_config,
                dashboardConfig: version.dashboard_config,
                promptUuid: version.ai_prompt_uuid,
                versionCreatedAt: version.created_at,
            };
        });
    }

    async createArtifactVersion(data: {
        artifactUuid: string;
        promptUuid: string;
        title?: string;
        description?: string;
        vizConfig: Record<string, unknown>;
    }): Promise<AiArtifact> {
        return this.database.transaction(async (trx) => {
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
                chartConfig: version.chart_config,
                dashboardConfig: version.dashboard_config,
                promptUuid: version.ai_prompt_uuid,
                versionCreatedAt: version.created_at,
            };
        });
    }

    async createOrUpdateArtifact(data: {
        threadUuid: string;
        promptUuid: string;
        artifactType: 'chart' | 'dashboard';
        title?: string;
        description?: string;
        vizConfig: Record<string, unknown>;
    }): Promise<AiArtifact> {
        const existingArtifacts = await this.findArtifactsByThreadUuid(
            data.threadUuid,
        );

        if (existingArtifacts.length > 0) {
            // TODO: Currently assuming first artifact in array since we only support one artifact per thread
            // In the future, we may support multiple artifacts per thread
            const existingArtifact = existingArtifacts[0];
            return this.createArtifactVersion({
                artifactUuid: existingArtifact.artifactUuid,
                promptUuid: data.promptUuid,
                title: data.title,
                description: data.description,
                vizConfig: data.vizConfig,
            });
        }

        return this.createArtifact(data);
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

    async findArtifactsByThreadUuid(threadUuid: string): Promise<AiArtifact[]> {
        const results = await this.database
            .select({
                artifactUuid: `${AiArtifactsTableName}.ai_artifact_uuid`,
                threadUuid: `${AiArtifactsTableName}.ai_thread_uuid`,
                artifactType: `${AiArtifactsTableName}.artifact_type`,
                savedQueryUuid: `${AiArtifactVersionsTableName}.saved_query_uuid`,
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

        return results;
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
}
