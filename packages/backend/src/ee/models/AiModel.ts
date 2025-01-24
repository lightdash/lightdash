import {
    AiPrompt,
    AiThread,
    AiWebAppPrompt,
    CreateSlackPrompt,
    CreateSlackThread,
    CreateWebAppPrompt,
    CreateWebAppThread,
    SlackPrompt,
    UpdateSlackResponse,
    UpdateSlackResponseTs,
    UpdateWebAppResponse,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DbUser, UserTableName } from '../../database/entities/users';
import {
    AiPromptTableName,
    AiSlackPromptTableName,
    AiSlackThreadTableName,
    AiThreadTableName,
    AiWebAppPromptTableName,
    AiWebAppThreadTableName,
    DbAiPrompt,
    DbAiThread,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

export class AiModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async findThread(uuid: string): Promise<AiThread | undefined> {
        return this.database(AiThreadTableName)
            .select({
                aiThreadUuid: 'ai_thread_uuid',
                organizationUuid: 'organization_uuid',
                projectUuid: 'project_uuid',
                createdAt: 'created_at',
                createdFrom: 'created_from',
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
                        'ai_thread_uuid' | 'created_at' | 'created_from'
                    > &
                        Pick<DbAiPrompt, 'prompt'> &
                        Pick<DbUser, 'user_uuid'> & { user_name: string }
                >
            >(
                `${AiThreadTableName}.ai_thread_uuid`,
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

    async updateSlackResponse(data: UpdateSlackResponse) {
        await this.database(AiPromptTableName)
            .update({
                responded_at: new Date(),
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

    async updateWebAppResponse(data: UpdateWebAppResponse) {
        await this.database(AiPromptTableName)
            .update({
                responded_at: new Date(),
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
}
