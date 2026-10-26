import {
    FeatureFlags,
    ParameterError,
    WarehouseTypes,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { UserService } from '../../../services/UserService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test.each([
    { strictPersonalOverlay: false, clearSignInStatus: false },
    { strictPersonalOverlay: false, clearSignInStatus: true },
    { strictPersonalOverlay: true, clearSignInStatus: false },
    { strictPersonalOverlay: true, clearSignInStatus: true },
])(
    'persists Athena key edits after a rename with policy $strictPersonalOverlay and effect $clearSignInStatus',
    async ({ strictPersonalOverlay, clearSignInStatus }) => {
        const { database } = migrated;
        const [user] = await database('users')
            .insert({
                first_name: 'Test',
                last_name: 'User',
                is_marketing_opted_in: false,
                is_tracking_anonymized: true,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_uuid');
        const encryptionUtil = new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        });
        const model = new UserWarehouseCredentialsModel({
            database,
            encryptionUtil,
        });
        const policy = { strictPersonalOverlay };
        const sessionUser = {
            userUuid: user.user_uuid,
            organizationUuid: randomUUID(),
        } as SessionUser;
        const service = new UserService({
            userWarehouseCredentialsModel: model,
            featureFlagModel: {
                get: vi.fn<FeatureFlagModel['get']>(
                    async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled:
                            featureFlagId === FeatureFlags.AgentIdentity
                                ? strictPersonalOverlay
                                : clearSignInStatus,
                    }),
                ),
            },
            analytics: { track: vi.fn() },
        } as unknown as ConstructorParameters<typeof UserService>[0]);
        const original = {
            type: WarehouseTypes.ATHENA as const,
            accessKeyId: randomUUID(),
            secretAccessKey: randomUUID(),
        };
        const { uuid } = await service.createWarehouseCredentials(sessionUser, {
            name: 'Test credential',
            credentials: original,
        });
        const readRow = () =>
            database('user_warehouse_credentials')
                .where('user_warehouse_credentials_uuid', uuid)
                .first();
        const created = await readRow();
        expect((await model.getByUuid(uuid)).credentials).toEqual({
            type: WarehouseTypes.ATHENA,
            accessKeyId: original.accessKeyId,
        });
        await service.updateWarehouseCredentials(sessionUser, uuid, {
            name: 'Renamed credential',
            credentials: {
                type: original.type,
                accessKeyId: original.accessKeyId,
            },
        });
        const renamed = await readRow();
        const renamedSecrets = await model.getByUuidWithSecrets(
            uuid,
            undefined,
            policy,
        );
        expect(renamed!.name).toBe('Renamed credential');
        expect(renamedSecrets.credentials.type).toBe(WarehouseTypes.ATHENA);
        expect(
            'secretAccessKey' in renamedSecrets.credentials &&
                renamedSecrets.credentials.secretAccessKey ===
                    original.secretAccessKey,
        ).toBe(true);
        expect(
            renamed!.encrypted_credentials.equals(
                created!.encrypted_credentials,
            ),
        ).toBe(false);
        const replacement = {
            ...original,
            accessKeyId: randomUUID(),
            secretAccessKey: randomUUID(),
        };
        await expect(
            service.updateWarehouseCredentials(sessionUser, uuid, {
                name: 'Renamed credential',
                credentials: {
                    type: replacement.type,
                    accessKeyId: replacement.accessKeyId,
                },
            }),
        ).rejects.toThrow(
            new ParameterError(
                'Enter the AWS secret access key when changing the access key ID.',
            ),
        );
        await expect(
            service.updateWarehouseCredentials(sessionUser, uuid, {
                name: 'Renamed credential',
                credentials: { ...replacement, secretAccessKey: '' },
            }),
        ).rejects.toThrow(ParameterError);
        const rejected = await readRow();
        expect(
            rejected!.encrypted_credentials.equals(
                renamed!.encrypted_credentials,
            ),
        ).toBe(true);
        const updated = await service.updateWarehouseCredentials(
            sessionUser,
            uuid,
            { name: 'Renamed credential', credentials: replacement },
        );
        expect(updated.credentials).toEqual({
            type: WarehouseTypes.ATHENA,
            accessKeyId: replacement.accessKeyId,
        });
        expect((await model.getByUuid(uuid)).credentials).toEqual({
            type: WarehouseTypes.ATHENA,
            accessKeyId: replacement.accessKeyId,
        });
        const listed = (
            await service.getWarehouseCredentials(sessionUser)
        ).find((credential) => credential.uuid === uuid);
        expect(listed?.name).toBe('Renamed credential');
        expect(listed?.credentials).toEqual({
            type: WarehouseTypes.ATHENA,
            accessKeyId: replacement.accessKeyId,
        });
        const saved = await readRow();
        const persisted = JSON.parse(
            encryptionUtil.decrypt(saved!.encrypted_credentials),
        );
        expect(persisted.accessKeyId === replacement.accessKeyId).toBe(true);
        expect(persisted.secretAccessKey === replacement.secretAccessKey).toBe(
            true,
        );
        expect(
            saved!.encrypted_credentials.equals(renamed!.encrypted_credentials),
        ).toBe(false);
    },
);
