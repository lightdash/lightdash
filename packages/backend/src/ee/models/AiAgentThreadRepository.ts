import { assertUnreachable, NotFoundError } from '@lightdash/common';
import { type Knex } from 'knex';
import { AiThreadTableName } from '../database/entities/ai';
import {
    type AiAgentStorageVersion,
    type AiCanonicalThread,
} from '../database/entities/aiAgentV3';
import { AiAgentV1ReadAdapter } from './AiAgentV1ReadAdapter';
import { AiAgentV3Model } from './AiAgentV3Model';

export class AiAgentThreadRepository {
    private readonly database: Knex;

    private readonly v1ReadAdapter: AiAgentV1ReadAdapter;

    private readonly v3Model: AiAgentV3Model;

    constructor({
        database,
        v1ReadAdapter,
        v3Model,
    }: {
        database: Knex;
        v1ReadAdapter: AiAgentV1ReadAdapter;
        v3Model: AiAgentV3Model;
    }) {
        this.database = database;
        this.v1ReadAdapter = v1ReadAdapter;
        this.v3Model = v3Model;
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
                return this.v1ReadAdapter.getThread(thread);
            case 3:
                return this.v3Model.getThreadFromRow(thread);
            default:
                return assertUnreachable(
                    thread.storage_version,
                    'Unsupported thread storage version',
                );
        }
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
}
