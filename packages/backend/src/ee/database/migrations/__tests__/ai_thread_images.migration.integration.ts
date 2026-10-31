import {
    AI_THREAD_IMAGE_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_DIMENSION,
    AI_THREAD_IMAGE_MEDIA_TYPES,
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    ProjectType,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import { fromSession } from '../../../../auth/account';
import { defaultSessionUser } from '../../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../../../models/FeatureFlagModel/FeatureFlagModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiThreadFileModel } from '../../../models/AiThreadFileModel';
import { AiThreadFileService } from '../../../services/AiThreadFileService';
import {
    AiThreadFileTableName,
    AiThreadImageObjectTableName,
} from '../../entities/aiThreadFile';
import { down, up } from '../20261029190000_add_ai_thread_images';

vi.mock('../../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

let migrated: MigratedDatabase;
let model: AiThreadFileModel;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    model = new AiThreadFileModel({ database: migrated.database });
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const db = migrated.database;
    const [organization] = await db('organizations')
        .insert({ organization_name: 'Image attachment test' })
        .returning('*');
    const [user] = await db('users')
        .insert({
            first_name: 'Image',
            last_name: 'Tester',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    if (!organization || !user)
        throw new Error('Failed to create image test fixture');
    const [project] = await db('projects')
        .insert({
            name: 'Images',
            organization_id: organization.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection_type: DbtProjectType.NONE,
            dbt_connection: null,
            copied_from_project_uuid: null,
            dbt_version: 'v1.9',
            created_by_user_uuid: null,
            organization_warehouse_credentials_uuid: null,
        })
        .returning('*');
    if (!project) throw new Error('Failed to create project');
    const [thread] = await db('ai_thread')
        .insert({
            organization_uuid: organization.organization_uuid,
            project_uuid: project.project_uuid,
            created_from: 'web_app',
            agent_uuid: null,
        })
        .returning('*');
    if (!thread) throw new Error('Failed to create thread');
    const [prompt] = await db('ai_prompt')
        .insert({
            ai_thread_uuid: thread.ai_thread_uuid,
            created_by_user_uuid: user.user_uuid,
            prompt: 'Recreate this chart',
        })
        .returning('*');
    if (!prompt) throw new Error('Failed to create prompt');
    return {
        organizationUuid: organization.organization_uuid,
        userUuid: user.user_uuid,
        threadUuid: thread.ai_thread_uuid,
        promptUuid: prompt.ai_prompt_uuid,
    };
};
type Fixture = Awaited<ReturnType<typeof fixture>>;

const image = async (
    owner: Fixture,
    sizeBytes = 100,
    dimensions = { width: 100, height: 100 },
) => {
    const fileUuid = randomUUID();
    const storageKey = `ai-chat-images/${owner.organizationUuid}/${fileUuid}.png`;
    const file = await model.createImage({
        fileUuid,
        createdByUserUuid: owner.userUuid,
        fileName: 'chart.png',
        object: {
            storage_key: storageKey,
            organization_uuid: owner.organizationUuid,
            media_type: 'image/png',
            width: dimensions.width,
            height: dimensions.height,
            size_bytes: sizeBytes,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 30 * 86400000),
        },
    });
    return { file, storageKey };
};
const claim = (owner: Fixture, fileUuids: string[]) =>
    migrated.database.transaction((trx) =>
        model.claimForPrompt(trx, { ...owner, fileUuids }),
    );

const nextPrompt = async (owner: Fixture) => {
    const [prompt] = await migrated
        .database('ai_prompt')
        .insert({
            ai_thread_uuid: owner.threadUuid,
            created_by_user_uuid: owner.userUuid,
            prompt: 'Another screenshot',
        })
        .returning('ai_prompt_uuid');
    if (!prompt) throw new Error('Failed to create follow-up prompt');
    return { ...owner, promptUuid: prompt.ai_prompt_uuid };
};

test('legacy text inserts default to text and never expose content or storage keys', async () => {
    const owner = await fixture();
    const file = await model.create({
        organizationUuid: owner.organizationUuid,
        createdByUserUuid: owner.userUuid,
        fileName: 'notes.txt',
        content: 'hello',
        sizeBytes: 5,
    });
    expect(file).toMatchObject({ kind: 'text', fileName: 'notes.txt' });
    expect(file).not.toHaveProperty('content');
    expect(file).not.toHaveProperty('storageKey');
    expect(await claim(owner, [file.uuid])).toHaveLength(1);
    expect(await model.findForThread(owner.threadUuid)).toMatchObject([
        { kind: 'text', content: 'hello' },
    ]);
});

test('unfinished uploads cannot be claimed; completed images preserve their original prompt', async () => {
    const owner = await fixture();
    const { file, storageKey } = await image(owner);
    expect(file).not.toHaveProperty('storageKey');
    expect(await claim(owner, [file.uuid])).toEqual([]);
    await model.markImageUploaded(storageKey);
    expect(await claim(owner, [file.uuid])).toHaveLength(1);
    expect(await model.findForThread(owner.threadUuid)).toMatchObject([
        { kind: 'image', promptUuid: owner.promptUuid, storageKey },
    ]);
    expect(
        await model.deleteUnclaimed({
            fileUuid: file.uuid,
            userUuid: owner.userUuid,
        }),
    ).toBe(false);
    expect(await claim(owner, [file.uuid])).toEqual([]);
});

test('a shared uploader cannot claim an attachment into a different organization', async () => {
    const owner = await fixture();
    const other = await fixture();
    const { file, storageKey } = await image(owner);
    await model.markImageUploaded(storageKey);
    expect(
        await claim({ ...other, userUuid: owner.userUuid }, [file.uuid]),
    ).toEqual([]);
    expect(
        await model.findClaimableByUser({
            fileUuids: [file.uuid],
            userUuid: other.userUuid,
            organizationUuid: owner.organizationUuid,
        }),
    ).toEqual([]);
    expect(
        await model.findClaimableByUser({
            fileUuids: [file.uuid],
            userUuid: owner.userUuid,
            organizationUuid: other.organizationUuid,
        }),
    ).toEqual([]);
});

test('concurrent prompts serialize the aggregate byte budget', async () => {
    const owner = await fixture();
    const images = await Promise.all(
        Array.from({ length: 6 }, () => image(owner, 3 * 1024 * 1024)),
    );
    await Promise.all(
        images.map(({ storageKey }) => model.markImageUploaded(storageKey)),
    );
    await claim(
        owner,
        images.slice(0, 2).map(({ file }) => file.uuid),
    );
    const inserted = Promise.withResolvers<void>();
    let inserts = 0;
    const createPromptAndClaim = (fileUuids: string[]) =>
        migrated.database.transaction(async (trx) => {
            const [prompt] = await trx('ai_prompt')
                .insert({
                    ai_thread_uuid: owner.threadUuid,
                    created_by_user_uuid: owner.userUuid,
                    prompt: 'Concurrent follow-up',
                })
                .returning('ai_prompt_uuid');
            if (!prompt) throw new Error('Failed to create concurrent prompt');
            inserts += 1;
            if (inserts === 2) inserted.resolve();
            await inserted.promise;
            await trx('ai_thread')
                .where('ai_thread_uuid', owner.threadUuid)
                .update({ updated_at: new Date() });
            return model.claimForPrompt(trx, {
                ...owner,
                promptUuid: prompt.ai_prompt_uuid,
                fileUuids,
            });
        });
    const outcomes = await Promise.allSettled([
        createPromptAndClaim(images.slice(2, 4).map(({ file }) => file.uuid)),
        createPromptAndClaim(images.slice(4, 6).map(({ file }) => file.uuid)),
    ]);
    expect(
        outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        ParameterError,
    );
    expect(await model.findForThread(owner.threadUuid)).toHaveLength(4);
});

test('more than five images are refused before any claim is committed', async () => {
    const owner = await fixture();
    const images = await Promise.all(
        Array.from({ length: 6 }, () => image(owner)),
    );
    await Promise.all(
        images.map(({ storageKey }) => model.markImageUploaded(storageKey)),
    );
    await expect(
        claim(
            owner,
            images.map(({ file }) => file.uuid),
        ),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(await model.findForThread(owner.threadUuid)).toEqual([]);
});

test('expired images cannot be claimed, and their metadata survives byte deletion', async () => {
    const owner = await fixture();
    const { file, storageKey } = await image(owner);
    await model.markImageUploaded(storageKey);
    await claim(owner, [file.uuid]);
    await migrated.database.raw(
        'UPDATE ai_thread_image_object SET created_at = ?, expires_at = ? WHERE storage_key = ?',
        [
            new Date(Date.now() - 31 * 86400000),
            new Date(Date.now() - 1000),
            storageKey,
        ],
    );
    expect(await model.findImageObjectsForCleanup()).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ storage_key: storageKey }),
        ]),
    );
    await model.markImageObjectDeleted(storageKey);
    expect(await model.findForThread(owner.threadUuid)).toMatchObject([
        { kind: 'image', objectDeletedAt: expect.any(Date) },
    ]);
    expect(await model.findImageObjectsForCleanup()).not.toEqual(
        expect.arrayContaining([
            expect.objectContaining({ storage_key: storageKey }),
        ]),
    );
});

test('organization cascades leave a retryable object cleanup record', async () => {
    const owner = await fixture();
    const { file, storageKey } = await image(owner);
    await model.markImageUploaded(storageKey);
    await claim(owner, [file.uuid]);
    await migrated.database.raw(
        'UPDATE ai_thread_image_object SET created_at = ? WHERE storage_key = ?',
        [new Date(Date.now() - 2 * 3600000), storageKey],
    );
    await migrated
        .database('organizations')
        .where('organization_uuid', owner.organizationUuid)
        .delete();
    expect(
        await migrated
            .database(AiThreadFileTableName)
            .where('ai_thread_file_uuid', file.uuid)
            .first(),
    ).toBeUndefined();
    expect(await model.findImageObjectsForCleanup()).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ storage_key: storageKey }),
        ]),
    );
    await model.markImageObjectDeleted(storageKey);
    expect(
        await migrated
            .database(AiThreadImageObjectTableName)
            .where('storage_key', storageKey)
            .first(),
    ).toBeUndefined();
});

test('schema shape checks reject image rows with text content', async () => {
    const owner = await fixture();
    const { file } = await image(owner);
    await expect(
        migrated.database.raw(
            'UPDATE ai_thread_file SET content = ? WHERE ai_thread_file_uuid = ?',
            ['not an image row', file.uuid],
        ),
    ).rejects.toThrow('ai_thread_file_kind_shape');
});

test('the ten-image conversation budget applies across prompts', async () => {
    const owner = await fixture();
    const images = await Promise.all(
        Array.from({ length: 11 }, () => image(owner)),
    );
    await Promise.all(
        images.map(({ storageKey }) => model.markImageUploaded(storageKey)),
    );
    await claim(
        owner,
        images.slice(0, 5).map(({ file }) => file.uuid),
    );
    await claim(
        await nextPrompt(owner),
        images.slice(5, 10).map(({ file }) => file.uuid),
    );
    await expect(
        claim(
            await nextPrompt(owner),
            images.slice(10).map(({ file }) => file.uuid),
        ),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(await model.findForThread(owner.threadUuid)).toHaveLength(10);
});

test('unsent cleanup removes stale file rows without losing object identity', async () => {
    const owner = await fixture();
    const { file, storageKey } = await image(owner);
    await migrated.database.raw(
        'UPDATE ai_thread_file SET created_at = ? WHERE ai_thread_file_uuid = ?',
        [new Date(Date.now() - 25 * 3600000), file.uuid],
    );
    expect(await claim(owner, [file.uuid])).toEqual([]);
    expect(await model.sweepExpiredUnclaimed()).toBeGreaterThanOrEqual(1);
    expect(
        await migrated
            .database(AiThreadFileTableName)
            .where('ai_thread_file_uuid', file.uuid)
            .first(),
    ).toBeUndefined();
    expect(
        await migrated
            .database(AiThreadImageObjectTableName)
            .where('storage_key', storageKey)
            .first(),
    ).toBeDefined();
});

test('cleanup failures cannot starve a later unattempted object', async () => {
    const owner = await fixture();
    const images = await Promise.all(
        Array.from({ length: 101 }, () => image(owner)),
    );
    const keys = images.map(({ storageKey }) => storageKey);
    await migrated
        .database(AiThreadFileTableName)
        .whereIn('storage_key', keys)
        .delete();
    await migrated.database.raw(
        "UPDATE ai_thread_image_object SET created_at = NOW() - interval '2 hours' WHERE storage_key = ANY(?::text[])",
        [keys],
    );
    const started = new Date();
    const firstBatch = await model.findImageObjectsForCleanup(started);
    expect(firstBatch).toHaveLength(100);
    await Promise.all(
        firstBatch.map((object) =>
            model.markImageCleanupAttempted(object.storage_key),
        ),
    );
    const nextBatch = await model.findImageObjectsForCleanup(started);
    expect(nextBatch).toHaveLength(1);
    expect(firstBatch.map((object) => object.storage_key)).not.toContain(
        nextBatch[0]?.storage_key,
    );
});

test('frozen database image limits match the shared application limits', async () => {
    const owner = await fixture();
    const { storageKey } = await image(owner, AI_THREAD_IMAGE_MAX_BYTES, {
        width: AI_THREAD_IMAGE_MAX_DIMENSION,
        height: AI_THREAD_IMAGE_MAX_DIMENSION,
    });
    await expect(image(owner, AI_THREAD_IMAGE_MAX_BYTES + 1)).rejects.toThrow(
        /check constraint/,
    );
    await expect(
        image(owner, 100, {
            width: AI_THREAD_IMAGE_MAX_DIMENSION + 1,
            height: 100,
        }),
    ).rejects.toThrow(/check constraint/);
    await expect(
        image(owner, 100, {
            width: 100,
            height: AI_THREAD_IMAGE_MAX_DIMENSION + 1,
        }),
    ).rejects.toThrow(/check constraint/);
    for (const mediaType of AI_THREAD_IMAGE_MEDIA_TYPES) {
        // eslint-disable-next-line no-await-in-loop -- Validate each media type against the same constrained row in order.
        await migrated.database.raw(
            'UPDATE ai_thread_image_object SET media_type = ? WHERE storage_key = ?',
            [mediaType, storageKey],
        );
    }
});

test('Console-style organization enablement gates the actual upload with production resolution', async () => {
    const owner = await fixture();
    const other = await fixture();
    const config = {
        ...lightdashConfigMock,
        previewFeatureFlags: { enabled: false },
        enabledFeatureFlags: new Set<string>(),
        disabledFeatureFlags: new Set<string>(),
    };
    const flags = new FeatureFlagModel({
        database: migrated.database,
        lightdashConfig: config,
    });
    const createUploadStream = vi.fn(() => {
        const writeStream = new PassThrough();
        writeStream.resume();
        return {
            writeStream,
            write: async () => {},
            close: async () => {
                writeStream.end();
            },
        };
    });
    const service = new AiThreadFileService({
        aiThreadFileModel: model,
        aiAgentService: { getIsCopilotEnabled: async () => true },
        featureFlagModel: flags,
        uploadsFileStorageClient: {
            isEnabled: () => true,
            createUploadStream,
            deleteFile: async () => {},
        },
        durableUploadsConfigured: true,
    });
    const ownerAccount = fromSession({
        ...defaultSessionUser,
        userUuid: owner.userUuid,
        organizationUuid: owner.organizationUuid,
    });
    const otherAccount = fromSession({
        ...defaultSessionUser,
        userUuid: other.userUuid,
        organizationUuid: other.organizationUuid,
    });
    const bytes = await sharp({
        create: { width: 2, height: 2, channels: 3, background: 'red' },
    })
        .png()
        .toBuffer();
    const input = { fileName: 'chart.png', bytes };
    await expect(
        service.uploadImage(ownerAccount, input),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(createUploadStream).not.toHaveBeenCalled();
    await migrated
        .database('feature_flags')
        .insert({
            flag_id: FeatureFlags.AiThreadImages,
            default_enabled: false,
        })
        .onConflict('flag_id')
        .ignore();
    await migrated.database('feature_flag_overrides').insert({
        flag_id: FeatureFlags.AiThreadImages,
        organization_uuid: owner.organizationUuid,
        enabled: true,
    });
    await expect(
        service.uploadImage(ownerAccount, input),
    ).resolves.toMatchObject({ kind: 'image' });
    await expect(
        service.uploadImage(otherAccount, input),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const override = () =>
        migrated
            .database('feature_flag_overrides')
            .where('flag_id', FeatureFlags.AiThreadImages)
            .where('organization_uuid', owner.organizationUuid);
    await override().update({ enabled: false });
    await expect(
        service.uploadImage(ownerAccount, input),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await override().update({ enabled: true });
    await expect(
        service.uploadImage(ownerAccount, input),
    ).resolves.toMatchObject({ kind: 'image' });
    config.disabledFeatureFlags.add(FeatureFlags.AiThreadImages);
    await expect(
        service.uploadImage(ownerAccount, input),
    ).rejects.toBeInstanceOf(ForbiddenError);
    config.enabledFeatureFlags.add(FeatureFlags.AiThreadImages);
    await expect(
        service.uploadImage(ownerAccount, input),
    ).resolves.toMatchObject({ kind: 'image' });
});

test('an unused schema can be rolled back and migrated again', async () => {
    const clean = await createMigratedDatabase();
    try {
        await down(clean.database);
        expect(
            await clean.database.schema.hasColumn(
                AiThreadFileTableName,
                'kind',
            ),
        ).toBe(false);
        await up(clean.database);
        expect(
            await clean.database.schema.hasTable(AiThreadImageObjectTableName),
        ).toBe(true);
    } finally {
        await clean.destroy();
    }
});

test('migration is resumable and refuses rollback while cleanup records remain', async () => {
    await up(migrated.database);
    await expect(down(migrated.database)).rejects.toThrow('irreversible:');
});
