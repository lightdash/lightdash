import { ParameterError, WarehouseTypes } from '@lightdash/common';
import { AiServiceAccountCredentialsModel } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { LegacyAiServiceAccountCredentialReader } from '../../../models/WarehouseCredentialReader/LegacyAiServiceAccountCredentialReader';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

let migrated: MigratedDatabase;
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: 'reader-test-secret',
        lightdashSecrets: {
            active: 'reader-test-secret',
            all: ['reader-test-secret'],
            fallbacks: [],
        },
    },
});
const secrets = {
    type: WarehouseTypes.POSTGRES,
    user: '__NOT_A_USER__',
    password: '__NOT_A_SECRET__',
} as const;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async (scope: 'original' | 'connection') => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Reader test' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'Reader', last_name: 'Test' } as never)
        .returning('user_uuid');
    const projects = await database('projects')
        .insert(
            ['Saved slot', 'No slot'].map(
                (name) =>
                    ({ name, organization_id: org.organization_id }) as never,
            ),
        )
        .returning(['project_uuid', 'project_id']);
    await database('warehouse_credentials').insert(
        projects.map((project) => ({
            project_id: project.project_id,
            warehouse_type: WarehouseTypes.POSTGRES,
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(secrets),
            ),
        })),
    );
    const connections = await database('warehouse_connections')
        .insert(
            projects.map((project) => ({
                project_uuid: project.project_uuid,
                name: 'Reader connection',
                is_original: false,
                warehouse_type: WarehouseTypes.POSTGRES,
                encrypted_credentials: encryptionUtil.encrypt('{}'),
            })),
        )
        .returning('warehouse_connection_uuid');
    const warehouseConnectionUuid =
        scope === 'original' ? null : connections[0].warehouse_connection_uuid;
    const otherConnectionUuid =
        scope === 'original' ? null : connections[1].warehouse_connection_uuid;
    const model = new AiServiceAccountCredentialsModel({
        database,
        encryptionUtil,
    });
    const reader = new LegacyAiServiceAccountCredentialReader({
        aiServiceAccountCredentialsModel: model,
    });
    const projectUuid = projects[0].project_uuid;
    const otherProjectUuid = projects[1].project_uuid;
    const slot = await model.upsert(
        projectUuid,
        warehouseConnectionUuid,
        secrets,
        user.user_uuid,
    );
    return {
        model,
        reader,
        slot,
        projectUuid,
        otherProjectUuid,
        warehouseConnectionUuid,
        otherConnectionUuid,
    };
};

describe.each(['original', 'connection'] as const)('%s slot', (scope) => {
    test('reads the saved slot and its row identity', async () => {
        const { model, reader, projectUuid, warehouseConnectionUuid } =
            await fixture(scope);
        const read = await reader.readSlotWithSecrets(
            projectUuid,
            warehouseConnectionUuid,
        );
        expect(read).toEqual(
            await model.getSecrets(projectUuid, warehouseConnectionUuid, true),
        );
        expect(read?.secrets).toEqual(secrets);
        expect(read?.slot.warehouseConnectionUuid).toBe(
            warehouseConnectionUuid,
        );
    });

    test('preserves a missing slot', async () => {
        const { model, reader, otherProjectUuid, otherConnectionUuid } =
            await fixture(scope);
        const read = await reader.readSlotWithSecrets(
            otherProjectUuid,
            otherConnectionUuid,
        );
        expect(read).toBeNull();
        expect(
            await model.getSecrets(otherProjectUuid, otherConnectionUuid, true),
        ).toBeNull();
    });

    test('preserves missing replaceable secrets', async () => {
        const { model, reader, otherProjectUuid, otherConnectionUuid } =
            await fixture(scope);
        expect(
            await model.getReplaceableSecrets(
                otherProjectUuid,
                otherConnectionUuid,
            ),
        ).toBeNull();
        expect(
            await reader.readReplaceableSecrets(
                otherProjectUuid,
                otherConnectionUuid,
            ),
        ).toBeNull();
    });

    test('reads replaceable secrets', async () => {
        const { model, reader, projectUuid, warehouseConnectionUuid } =
            await fixture(scope);
        const read = await reader.readReplaceableSecrets(
            projectUuid,
            warehouseConnectionUuid,
        );
        expect(read).toEqual(
            await model.getReplaceableSecrets(
                projectUuid,
                warehouseConnectionUuid,
            ),
        );
    });

    test('preserves both unreadable-row behaviours', async () => {
        const { model, reader, slot, projectUuid, warehouseConnectionUuid } =
            await fixture(scope);
        await migrated
            .database('ai_service_account_credentials')
            .where('ai_service_account_credential_uuid', slot.uuid)
            .update({ encrypted_credentials: Buffer.from('__NOT_A_SECRET__') });
        const [modelResult, readerResult] = await Promise.allSettled([
            model.getSecrets(projectUuid, warehouseConnectionUuid, true),
            reader.readSlotWithSecrets(projectUuid, warehouseConnectionUuid),
        ]);
        expect(modelResult.status).toBe('rejected');
        expect(readerResult.status).toBe('rejected');
        if (
            modelResult.status !== 'rejected' ||
            readerResult.status !== 'rejected'
        ) {
            throw new Error(
                'Unreadable credentials must reject both slot reads',
            );
        }
        expect(modelResult.reason).toBeInstanceOf(ParameterError);
        expect(readerResult.reason).toBeInstanceOf(
            modelResult.reason.constructor,
        );
        expect(readerResult.reason.message).toBe(modelResult.reason.message);
        expect(
            await model.getReplaceableSecrets(
                projectUuid,
                warehouseConnectionUuid,
            ),
        ).toBeNull();
        const read = await reader.readReplaceableSecrets(
            projectUuid,
            warehouseConnectionUuid,
        );
        expect(read).toBeNull();
    });
});
