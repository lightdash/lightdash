import {
    AI_THREAD_FILE_UNCLAIMED_TTL_HOURS,
    AI_THREAD_IMAGES_MAX_PER_PROMPT,
    AI_THREAD_IMAGES_MAX_PER_THREAD,
    AI_THREAD_IMAGES_MAX_THREAD_BYTES,
    assertUnreachable,
    ParameterError,
    type AiThreadFile,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { AiThreadTableName } from '../database/entities/ai';
import {
    AiThreadFileTableName,
    AiThreadImageObjectTableName,
    type DbAiThreadFile,
    type DbAiThreadImageObject,
} from '../database/entities/aiThreadFile';

export type AiThreadFileWithContent =
    | (Extract<AiThreadFile, { kind: 'text' }> & { content: string })
    | (Extract<AiThreadFile, { kind: 'image' }> & {
          storageKey: string;
          uploadedAt: Date | null;
          objectDeletedAt: Date | null;
      });

const UNCLAIMED_TTL_INTERVAL = `${AI_THREAD_FILE_UNCLAIMED_TTL_HOURS} hours`;

const toAiThreadFile = (
    row: DbAiThreadFile,
    image: DbAiThreadImageObject | undefined,
): AiThreadFile => {
    const metadata = {
        uuid: row.ai_thread_file_uuid,
        fileName: row.file_name,
        sizeBytes: row.size_bytes,
        threadUuid: row.ai_thread_uuid,
        promptUuid: row.ai_prompt_uuid,
        createdAt: row.created_at,
    };
    switch (row.kind) {
        case 'text':
            return { ...metadata, kind: 'text' };
        case 'image':
            if (!image || image.organization_uuid !== row.organization_uuid) {
                throw new Error('Image attachment metadata is unavailable');
            }
            return {
                ...metadata,
                kind: 'image',
                mediaType: image.media_type,
                width: image.width,
                height: image.height,
                expiresAt: image.expires_at,
            };
        default:
            return assertUnreachable(row.kind, 'Unknown attachment kind');
    }
};

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
        if (!row) throw new Error('Failed to create thread file');
        return toAiThreadFile(row, undefined);
    }

    async createImage(args: {
        fileUuid: string;
        createdByUserUuid: string;
        fileName: string;
        object: Omit<
            DbAiThreadImageObject,
            'uploaded_at' | 'object_deleted_at' | 'cleanup_attempted_at'
        >;
    }): Promise<AiThreadFile> {
        return this.database.transaction(async (trx) => {
            const [image] = await trx(AiThreadImageObjectTableName)
                .insert(args.object)
                .returning('*');
            const [row] = await trx(AiThreadFileTableName)
                .insert({
                    ai_thread_file_uuid: args.fileUuid,
                    organization_uuid: args.object.organization_uuid,
                    created_by_user_uuid: args.createdByUserUuid,
                    file_name: args.fileName,
                    content: '',
                    kind: 'image',
                    storage_key: args.object.storage_key,
                    size_bytes: args.object.size_bytes,
                })
                .returning('*');
            if (!row || !image)
                throw new Error('Failed to create image attachment');
            return toAiThreadFile(row, image);
        });
    }

    async markImageUploaded(storageKey: string): Promise<void> {
        await this.database(AiThreadImageObjectTableName)
            .where('storage_key', storageKey)
            .update({ uploaded_at: new Date() });
    }

    private async imageObjects(rows: DbAiThreadFile[]) {
        const keys = rows.flatMap((row) =>
            row.storage_key === null ? [] : [row.storage_key],
        );
        const objects =
            keys.length === 0
                ? []
                : await this.database(AiThreadImageObjectTableName)
                      .whereIn('storage_key', keys)
                      .select('*');
        return new Map(objects.map((object) => [object.storage_key, object]));
    }

    async findClaimableByUser(args: {
        fileUuids: string[];
        userUuid: string;
        organizationUuid: string;
    }): Promise<AiThreadFile[]> {
        if (args.fileUuids.length === 0) return [];
        const rows = await this.claimable(this.database)
            .whereIn('ai_thread_file_uuid', args.fileUuids)
            .where('created_by_user_uuid', args.userUuid)
            .where('organization_uuid', args.organizationUuid)
            .select('*');
        const objects = await this.imageObjects(rows);
        return rows.map((row) =>
            toAiThreadFile(row, objects.get(row.storage_key ?? '')),
        );
    }

    // Used by both the pre-check and the authoritative transactional claim.
    private claimable(db: Knex) {
        return db(AiThreadFileTableName)
            .whereNull('ai_thread_uuid')
            .whereNull('claimed_at')
            .where(
                'created_at',
                '>',
                db.raw('NOW() - ?::interval', [UNCLAIMED_TTL_INTERVAL]),
            )
            .where((query) =>
                query
                    .where('kind', 'text')
                    .orWhere((images) =>
                        images
                            .where('kind', 'image')
                            .whereIn(
                                'storage_key',
                                db(AiThreadImageObjectTableName)
                                    .select('storage_key')
                                    .whereNotNull('uploaded_at')
                                    .whereNull('object_deleted_at')
                                    .where('expires_at', '>', db.fn.now()),
                            ),
                    ),
            );
    }

    async claimForPrompt(
        trx: Knex,
        args: {
            fileUuids: string[];
            userUuid: string;
            threadUuid: string;
            promptUuid: string;
        },
    ): Promise<DbAiThreadFile[]> {
        if (args.fileUuids.length === 0) return [];
        const threadOrganization = trx(AiThreadTableName)
            .select('organization_uuid')
            .where('ai_thread_uuid', args.threadUuid);
        const images = await this.claimable(trx)
            .whereIn('ai_thread_file_uuid', args.fileUuids)
            .where('created_by_user_uuid', args.userUuid)
            .whereIn('organization_uuid', threadOrganization)
            .where('kind', 'image')
            .select('size_bytes');
        if (images.length > 0) {
            await trx(AiThreadTableName)
                .where('ai_thread_uuid', args.threadUuid)
                .forNoKeyUpdate()
                .first('ai_thread_uuid');
            const [budget] = await trx(AiThreadFileTableName)
                .where('ai_thread_uuid', args.threadUuid)
                .where('kind', 'image')
                .select<
                    { count: string; bytes: string; prompt_count: string }[]
                >(
                    trx.raw(
                        'COUNT(*)::text AS count, COALESCE(SUM(size_bytes), 0)::text AS bytes, COUNT(*) FILTER (WHERE ai_prompt_uuid = ?)::text AS prompt_count',
                        [args.promptUuid],
                    ),
                );
            const bytes = images.reduce(
                (total, image) => total + image.size_bytes,
                0,
            );
            if (
                images.length + Number(budget?.prompt_count ?? 0) >
                    AI_THREAD_IMAGES_MAX_PER_PROMPT ||
                images.length + Number(budget?.count ?? 0) >
                    AI_THREAD_IMAGES_MAX_PER_THREAD ||
                bytes + Number(budget?.bytes ?? 0) >
                    AI_THREAD_IMAGES_MAX_THREAD_BYTES
            ) {
                throw new ParameterError(
                    'Image attachment limit reached: up to 5 images per message, 10 images and 12 MiB per conversation.',
                );
            }
        }
        return this.claimable(trx)
            .whereIn('ai_thread_file_uuid', args.fileUuids)
            .where('created_by_user_uuid', args.userUuid)
            .whereIn('organization_uuid', threadOrganization)
            .update({
                ai_thread_uuid: args.threadUuid,
                ai_prompt_uuid: args.promptUuid,
                claimed_at: new Date(),
            })
            .returning('*');
    }

    async findForThread(
        threadUuid: string,
    ): Promise<AiThreadFileWithContent[]> {
        const rows = await this.database(AiThreadFileTableName)
            .where('ai_thread_uuid', threadUuid)
            .orderBy('created_at', 'asc')
            .select('*');
        const objects = await this.imageObjects(rows);
        return rows.map((row): AiThreadFileWithContent => {
            const image = objects.get(row.storage_key ?? '');
            const file = toAiThreadFile(row, image);
            switch (file.kind) {
                case 'text':
                    return { ...file, content: row.content };
                case 'image':
                    if (!image)
                        throw new Error(
                            'Image attachment metadata is unavailable',
                        );
                    return {
                        ...file,
                        storageKey: image.storage_key,
                        uploadedAt: image.uploaded_at,
                        objectDeletedAt: image.object_deleted_at,
                    };
                default:
                    return assertUnreachable(file, 'Unknown attachment kind');
            }
        });
    }

    async deleteUnclaimed(args: {
        fileUuid: string;
        userUuid: string;
    }): Promise<boolean> {
        const deleted = await this.database(AiThreadFileTableName)
            .where('ai_thread_file_uuid', args.fileUuid)
            .where('created_by_user_uuid', args.userUuid)
            .whereNull('ai_thread_uuid')
            .whereNull('claimed_at')
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

    async sweepExpiredUnclaimed(): Promise<number> {
        return this.database(AiThreadFileTableName)
            .whereIn(
                'ai_thread_file_uuid',
                this.database(AiThreadFileTableName)
                    .select('ai_thread_file_uuid')
                    .whereNull('ai_thread_uuid')
                    .where(
                        'created_at',
                        '<=',
                        this.database.raw('NOW() - ?::interval', [
                            UNCLAIMED_TTL_INTERVAL,
                        ]),
                    )
                    .orderBy('created_at')
                    .limit(100),
            )
            .whereNull('ai_thread_uuid')
            .delete();
    }

    async findImageObjectsForCleanup(
        attemptedBefore = new Date(),
    ): Promise<DbAiThreadImageObject[]> {
        return this.database(AiThreadImageObjectTableName)
            .where((query) =>
                query
                    .whereNull('cleanup_attempted_at')
                    .orWhere('cleanup_attempted_at', '<', attemptedBefore),
            )
            .where((query) =>
                query
                    .where((expired) =>
                        expired
                            .where('expires_at', '<=', this.database.fn.now())
                            .whereNull('object_deleted_at'),
                    )
                    .orWhere((orphan) =>
                        orphan
                            .where(
                                'created_at',
                                '<=',
                                this.database.raw("NOW() - interval '1 hour'"),
                            )
                            .whereNotExists(
                                this.database(AiThreadFileTableName)
                                    .select('storage_key')
                                    .whereRaw('?? = ??', [
                                        `${AiThreadFileTableName}.storage_key`,
                                        `${AiThreadImageObjectTableName}.storage_key`,
                                    ]),
                            ),
                    ),
            )
            .orderBy('cleanup_attempted_at', 'asc', 'first')
            .orderBy('created_at')
            .limit(100)
            .select('*');
    }

    async markImageCleanupAttempted(storageKey: string): Promise<void> {
        await this.database(AiThreadImageObjectTableName)
            .where('storage_key', storageKey)
            .update({ cleanup_attempted_at: new Date() });
    }

    async markImageObjectDeleted(storageKey: string): Promise<void> {
        await this.database(AiThreadImageObjectTableName)
            .where('storage_key', storageKey)
            .update({ object_deleted_at: new Date() });
        await this.database(AiThreadImageObjectTableName)
            .where('storage_key', storageKey)
            .whereNotExists(
                this.database(AiThreadFileTableName)
                    .select('storage_key')
                    .whereRaw('?? = ??', [
                        `${AiThreadFileTableName}.storage_key`,
                        `${AiThreadImageObjectTableName}.storage_key`,
                    ]),
            )
            .delete();
    }
}
