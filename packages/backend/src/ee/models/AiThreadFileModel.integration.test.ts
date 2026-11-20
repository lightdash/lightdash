import {
    ParameterError,
    SEED_ORG_1,
    SEED_ORG_1_EDITOR,
    SEED_ORG_2,
    SEED_PROJECT,
    type AiPromptContextInput,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import { AiThreadTableName } from '../database/entities/ai';
import {
    AiThreadFileTableName,
    AiThreadImageObjectTableName,
} from '../database/entities/aiThreadFile';
import { type AiAgentModel } from './AiAgentModel';
import { AiThreadFileModel } from './AiThreadFileModel';

/**
 * A routed conversation is created by the same call as one for an agent the
 * user chose, after an image may have waited at the agent picker. The claim
 * inside prompt creation is what decides whose image may join it.
 */
describe('AiThreadFileModel image claim on prompt creation', () => {
    let database: Knex;
    let aiAgentModel: AiAgentModel;
    let fileModel: AiThreadFileModel;
    let userUuid = '';
    const threadUuids: string[] = [];
    const storageKeys: string[] = [];

    const uploadImage = async ({
        uploaderUuid,
        organizationUuid,
    }: {
        uploaderUuid: string;
        organizationUuid: string;
    }) => {
        const fileUuid = uuidv4();
        const storageKey = `test/router-images/${fileUuid}`;
        storageKeys.push(storageKey);
        await fileModel.createImage({
            fileUuid,
            createdByUserUuid: uploaderUuid,
            fileName: 'chart.png',
            object: {
                storage_key: storageKey,
                organization_uuid: organizationUuid,
                media_type: 'image/png',
                width: 800,
                height: 600,
                size_bytes: 1024,
                created_at: new Date(),
            },
        });
        await fileModel.markImageUploaded(storageKey);
        return fileUuid;
    };

    const imageContext = (...fileUuids: string[]): AiPromptContextInput =>
        fileUuids.map((fileUuid) => ({ type: 'thread_image', fileUuid }));

    /** What thread creation does once an agent is known, routed or chosen. */
    const startConversation = async (context: AiPromptContextInput) => {
        const threadUuid = await aiAgentModel.createWebAppThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid,
            createdFrom: 'web_app',
            agentUuid: null,
        });
        threadUuids.push(threadUuid);
        const promptUuid = await aiAgentModel.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: userUuid,
            prompt: 'Recreate this chart',
            context,
            modelConfig: null,
        });
        return { threadUuid, promptUuid };
    };

    const fileRow = async (fileUuid: string) => {
        const row = await database(AiThreadFileTableName)
            .where('ai_thread_file_uuid', fileUuid)
            .first();
        if (!row) throw new Error('The image row is gone');
        return row;
    };

    const expectUnclaimed = async (fileUuid: string) => {
        const row = await fileRow(fileUuid);
        expect(row.ai_thread_uuid).toBeNull();
        expect(row.ai_prompt_uuid).toBeNull();
        expect(row.claimed_at).toBeNull();
    };

    beforeAll(() => {
        const ctx = getTestContext();
        database = ctx.db;
        aiAgentModel = getModels(ctx.app).aiAgentModel;
        fileModel = new AiThreadFileModel({ database });
        userUuid = ctx.testUser.userUuid;
    });

    afterAll(async () => {
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', threadUuids)
            .delete();
        await database(AiThreadFileTableName)
            .whereIn('storage_key', storageKeys)
            .delete();
        await database(AiThreadImageObjectTableName)
            .whereIn('storage_key', storageKeys)
            .delete();
    });

    it('claims the images a user uploaded before an agent was known', async () => {
        const fileUuids = [
            await uploadImage({
                uploaderUuid: userUuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
            }),
            await uploadImage({
                uploaderUuid: userUuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
            }),
        ];
        expect(
            await fileModel.findClaimableByUser({
                fileUuids,
                userUuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
            }),
        ).toHaveLength(2);

        const { threadUuid, promptUuid } = await startConversation(
            imageContext(...fileUuids),
        );

        const rows = await Promise.all(fileUuids.map(fileRow));
        rows.forEach((row) => {
            expect(row.ai_thread_uuid).toBe(threadUuid);
            expect(row.ai_prompt_uuid).toBe(promptUuid);
            expect(row.claimed_at).not.toBeNull();
        });
        expect(
            (await fileModel.findForThread(threadUuid)).map(({ uuid }) => uuid),
        ).toEqual(expect.arrayContaining(fileUuids));
    });

    it('claims an image only once', async () => {
        const fileUuid = await uploadImage({
            uploaderUuid: userUuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
        });
        const first = await startConversation(imageContext(fileUuid));

        await expect(startConversation(imageContext(fileUuid))).rejects.toThrow(
            ParameterError,
        );

        expect((await fileRow(fileUuid)).ai_thread_uuid).toBe(first.threadUuid);
    });

    it("refuses another user's image and leaves it unclaimed", async () => {
        const fileUuid = await uploadImage({
            uploaderUuid: SEED_ORG_1_EDITOR.user_uuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
        });
        expect(
            await fileModel.findClaimableByUser({
                fileUuids: [fileUuid],
                userUuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
            }),
        ).toEqual([]);

        await expect(startConversation(imageContext(fileUuid))).rejects.toThrow(
            ParameterError,
        );

        await expectUnclaimed(fileUuid);
    });

    it('refuses an image uploaded in another organisation and leaves it unclaimed', async () => {
        const fileUuid = await uploadImage({
            uploaderUuid: userUuid,
            organizationUuid: SEED_ORG_2.organization_uuid,
        });
        expect(
            await fileModel.findClaimableByUser({
                fileUuids: [fileUuid],
                userUuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
            }),
        ).toEqual([]);

        await expect(startConversation(imageContext(fileUuid))).rejects.toThrow(
            ParameterError,
        );

        await expectUnclaimed(fileUuid);
    });

    it('refuses an image held past the claim window instead of sending without it', async () => {
        const fileUuid = await uploadImage({
            uploaderUuid: userUuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
        });
        await database.raw(
            "UPDATE ?? SET created_at = NOW() - INTERVAL '25 hours' WHERE ai_thread_file_uuid = ?",
            [AiThreadFileTableName, fileUuid],
        );
        expect(
            await fileModel.findClaimableByUser({
                fileUuids: [fileUuid],
                userUuid,
                organizationUuid: SEED_ORG_1.organization_uuid,
            }),
        ).toEqual([]);

        await expect(startConversation(imageContext(fileUuid))).rejects.toThrow(
            'One or more attached files are unavailable. Remove them and upload again.',
        );

        await expectUnclaimed(fileUuid);
    });

    it('refuses the whole message when one of its images cannot be claimed', async () => {
        const own = await uploadImage({
            uploaderUuid: userUuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
        });
        const foreign = await uploadImage({
            uploaderUuid: SEED_ORG_1_EDITOR.user_uuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
        });

        await expect(
            startConversation(imageContext(own, foreign)),
        ).rejects.toThrow(ParameterError);

        await expectUnclaimed(own);
        await expectUnclaimed(foreign);
    });
});
