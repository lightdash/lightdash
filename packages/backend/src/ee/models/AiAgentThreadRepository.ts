import {
    assertUnreachable,
    NotFoundError,
    ReadOnlyThreadError,
    type AiAgentV3ThreadSummary,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { UserTableName } from '../../database/entities/users';
import type { AiAgentObservabilityMetrics } from '../../prometheus/PrometheusMetrics';
import {
    AiPromptTableName,
    AiThreadTableName,
    AiWebAppThreadTableName,
} from '../database/entities/ai';
import {
    type AiAgentStorageVersion,
    type AiCanonicalThread,
} from '../database/entities/aiAgentV3';
import { getAiAgentThreadOwnerExpression } from './aiAgentThreadOwner';
import { AiAgentV1ReadAdapter } from './AiAgentV1ReadAdapter';
import { AiAgentV3Model } from './AiAgentV3Model';

export type AiAgentThreadHeader = Omit<
    AiAgentV3ThreadSummary,
    'readOnly' | 'readOnlyReason'
>;

export class AiAgentThreadRepository {
    private readonly database: Knex;

    private readonly v1ReadAdapter: AiAgentV1ReadAdapter;

    private readonly v3Model: AiAgentV3Model;

    private readonly prometheusMetrics: AiAgentObservabilityMetrics | null;

    constructor({
        database,
        v1ReadAdapter,
        v3Model,
        prometheusMetrics,
    }: {
        database: Knex;
        v1ReadAdapter: AiAgentV1ReadAdapter;
        v3Model: AiAgentV3Model;
        prometheusMetrics: AiAgentObservabilityMetrics | null;
    }) {
        this.database = database;
        this.v1ReadAdapter = v1ReadAdapter;
        this.v3Model = v3Model;
        this.prometheusMetrics = prometheusMetrics;
    }

    private async readV1<T>(read: () => Promise<T>): Promise<T> {
        try {
            return await read();
        } catch (error) {
            this.prometheusMetrics?.incrementAiAgentV1ReadAdapterError();
            throw error;
        }
    }

    async getThread(threadUuid: string): Promise<AiCanonicalThread> {
        const thread = await this.database(AiThreadTableName)
            .where('ai_thread_uuid', threadUuid)
            .first();
        if (thread === undefined) {
            throw new NotFoundError('Thread not found');
        }

        switch (thread.storage_version) {
            case 1:
                return this.readV1(() => this.v1ReadAdapter.getThread(thread));
            case 3:
                return this.v3Model.getThreadFromRow(thread);
            default:
                return assertUnreachable(
                    thread.storage_version,
                    'Unsupported thread storage version',
                );
        }
    }

    async listThreadHeaders({
        organizationUuid,
        agentUuid,
        ownerUserUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
        ownerUserUuid: string | null;
    }): Promise<AiAgentThreadHeader[]> {
        const ownerExpression = getAiAgentThreadOwnerExpression({
            webAppOwner: `${AiWebAppThreadTableName}.user_uuid`,
            firstPromptOwner: `(
                SELECT created_by_user_uuid
                FROM ${AiPromptTableName}
                WHERE ${AiPromptTableName}.ai_thread_uuid = ${AiThreadTableName}.ai_thread_uuid
                ORDER BY created_at, ai_prompt_uuid
                LIMIT 1
            )`,
        });
        const query = this.database(AiThreadTableName)
            .leftJoin(
                AiWebAppThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiWebAppThreadTableName}.ai_thread_uuid`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                this.database.raw(ownerExpression),
            )
            .where(`${AiThreadTableName}.organization_uuid`, organizationUuid)
            .where(`${AiThreadTableName}.agent_uuid`, agentUuid)
            .whereIn(`${AiThreadTableName}.created_from`, ['web_app', 'slack'])
            .where((builder) =>
                builder
                    .whereNull(`${AiThreadTableName}.lineage_kind`)
                    .orWhereNot(`${AiThreadTableName}.lineage_kind`, 'spawn'),
            )
            .select<
                {
                    ai_thread_uuid: string;
                    storage_version: AiAgentStorageVersion;
                    agent_uuid: string;
                    created_at: Date;
                    created_from: AiCanonicalThread['createdFrom'];
                    title: string | null;
                    owner_user_uuid: string | null;
                    user_name: string | null;
                }[]
            >(
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.storage_version`,
                `${AiThreadTableName}.agent_uuid`,
                `${AiThreadTableName}.created_at`,
                `${AiThreadTableName}.created_from`,
                `${AiThreadTableName}.title`,
                this.database.raw(`${ownerExpression} AS owner_user_uuid`),
                this.database.raw(
                    `NULLIF(TRIM(CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name)), '') AS user_name`,
                ),
            )
            .orderBy(`${AiThreadTableName}.created_at`, 'desc');

        if (ownerUserUuid !== null) {
            void query.whereRaw(`${ownerExpression} = ?`, [ownerUserUuid]);
        }

        const rows = await query;
        const [v1FirstMessages, v3FirstMessages] = await Promise.all([
            this.readV1(() =>
                this.v1ReadAdapter.listFirstMessages(
                    rows
                        .filter((row) => row.storage_version === 1)
                        .map((row) => row.ai_thread_uuid),
                ),
            ),
            this.v3Model.listFirstMessages(
                rows
                    .filter((row) => row.storage_version === 3)
                    .map((row) => row.ai_thread_uuid),
            ),
        ]);
        return rows.map((row) => ({
            uuid: row.ai_thread_uuid,
            storageVersion: row.storage_version,
            agentUuid: row.agent_uuid,
            createdAt: row.created_at.toISOString(),
            createdFrom: row.created_from,
            title: row.title,
            firstMessage:
                (row.storage_version === 1
                    ? v1FirstMessages
                    : v3FirstMessages
                ).get(row.ai_thread_uuid) ?? null,
            user: {
                uuid: row.owner_user_uuid,
                name: row.user_name ?? 'Unknown user',
            },
        }));
    }

    async getStorageVersion(
        threadUuid: string,
    ): Promise<AiAgentStorageVersion> {
        const thread = await this.database(AiThreadTableName)
            .select('storage_version')
            .where('ai_thread_uuid', threadUuid)
            .first();
        if (thread === undefined) {
            throw new NotFoundError('Thread not found');
        }
        return thread.storage_version;
    }

    async assertMutationStorageVersion(
        threadUuid: string,
        expectedStorageVersion: AiAgentStorageVersion,
        knownStorageVersion: AiAgentStorageVersion | null = null,
    ): Promise<void> {
        const storageVersion =
            knownStorageVersion ?? (await this.getStorageVersion(threadUuid));
        if (storageVersion !== expectedStorageVersion) {
            throw new ReadOnlyThreadError(threadUuid, storageVersion);
        }
    }
}
