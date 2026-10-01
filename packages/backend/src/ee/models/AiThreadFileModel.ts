import {
    AI_THREAD_FILE_UNCLAIMED_TTL_HOURS,
    type AiThreadFile,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiThreadFileTableName,
    type DbAiThreadFile,
} from '../database/entities/aiThreadFile';

export type AiThreadFileWithContent = AiThreadFile & { content: string };

const UNCLAIMED_TTL_INTERVAL = `${AI_THREAD_FILE_UNCLAIMED_TTL_HOURS} hours`;

const toAiThreadFile = (row: DbAiThreadFile): AiThreadFile => ({
    uuid: row.ai_thread_file_uuid,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    threadUuid: row.ai_thread_uuid,
    promptUuid: row.ai_prompt_uuid,
    createdAt: row.created_at,
});

export class AiThreadFileModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(args: {
        organizationUuid: string;
        createdByUserUuid: string;
        fileName: string;
        content: string;
        sizeBytes: number;
    }): Promise<AiThreadFile> {
        const [row] = await this.database(AiThreadFileTableName)
            .insert({
                organization_uuid: args.organizationUuid,
                created_by_user_uuid: args.createdByUserUuid,
                file_name: args.fileName,
                content: args.content,
                size_bytes: args.sizeBytes,
            })
            .returning('*');
        if (!row) {
            throw new Error('Failed to create thread file');
        }
        return toAiThreadFile(row);
    }

    /** Unclaimed, unexpired files the user uploaded, by uuid. */
    async findClaimableByUser(args: {
        fileUuids: string[];
        userUuid: string;
        organizationUuid: string;
    }): Promise<AiThreadFile[]> {
        if (args.fileUuids.length === 0) return [];
        const rows = await this.database(AiThreadFileTableName)
            .whereIn('ai_thread_file_uuid', args.fileUuids)
            .where('created_by_user_uuid', args.userUuid)
            .where('organization_uuid', args.organizationUuid)
            .whereNull('ai_thread_uuid')
            .where(
                'created_at',
                '>',
                this.database.raw(
                    `NOW() - INTERVAL '${UNCLAIMED_TTL_INTERVAL}'`,
                ),
            )
            .select<DbAiThreadFile[]>('*');
        return rows.map(toAiThreadFile);
    }

    /**
     * Attach files to a prompt. The conditional update is the ownership check:
     * only the uploader's own unclaimed, unexpired files match, and a file
     * already sent elsewhere no longer matches. Returns how many rows changed
     * so the caller can reject the whole request on a shortfall.
     */
    static async claimForPrompt(
        trx: Knex,
        args: {
            fileUuids: string[];
            userUuid: string;
            threadUuid: string;
            promptUuid: string;
        },
    ): Promise<DbAiThreadFile[]> {
        if (args.fileUuids.length === 0) return [];
        return trx(AiThreadFileTableName)
            .whereIn('ai_thread_file_uuid', args.fileUuids)
            .where('created_by_user_uuid', args.userUuid)
            .whereNull('ai_thread_uuid')
            .where(
                'created_at',
                '>',
                trx.raw(`NOW() - INTERVAL '${UNCLAIMED_TTL_INTERVAL}'`),
            )
            .update({
                ai_thread_uuid: args.threadUuid,
                ai_prompt_uuid: args.promptUuid,
                claimed_at: new Date(),
            })
            .returning('*');
    }

    /** Files owned by a thread, oldest first, with their text. */
    async findForThread(
        threadUuid: string,
    ): Promise<AiThreadFileWithContent[]> {
        const rows = await this.database(AiThreadFileTableName)
            .where('ai_thread_uuid', threadUuid)
            .orderBy('created_at', 'asc')
            .select<DbAiThreadFile[]>('*');
        return rows.map((row) => ({
            ...toAiThreadFile(row),
            content: row.content,
        }));
    }

    /** Deletes only the uploader's own unclaimed file. Returns whether a row went. */
    async deleteUnclaimed(args: {
        fileUuid: string;
        userUuid: string;
    }): Promise<boolean> {
        const deleted = await this.database(AiThreadFileTableName)
            .where('ai_thread_file_uuid', args.fileUuid)
            .where('created_by_user_uuid', args.userUuid)
            .whereNull('ai_thread_uuid')
            .delete();
        return deleted > 0;
    }

    async countUnclaimedForUser(userUuid: string): Promise<number> {
        const [row] = await this.database(AiThreadFileTableName)
            .where('created_by_user_uuid', userUuid)
            .whereNull('ai_thread_uuid')
            .count<{ count: string }[]>({ count: '*' });
        return Number(row?.count ?? 0);
    }

    async countRecentUploadsForUser(
        userUuid: string,
        windowMs: number,
    ): Promise<number> {
        const [row] = await this.database(AiThreadFileTableName)
            .where('created_by_user_uuid', userUuid)
            .where('created_at', '>', new Date(Date.now() - windowMs))
            .count<{ count: string }[]>({ count: '*' });
        return Number(row?.count ?? 0);
    }

    /** Removes unclaimed uploads older than the TTL. Returns the number swept. */
    async sweepExpiredUnclaimed(): Promise<number> {
        return this.database(AiThreadFileTableName)
            .whereNull('ai_thread_uuid')
            .where(
                'created_at',
                '<=',
                this.database.raw(
                    `NOW() - INTERVAL '${UNCLAIMED_TTL_INTERVAL}'`,
                ),
            )
            .delete();
    }
}
