import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiServiceAccountCredentialsModel } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { AiServiceAccountService } from '../../../services/AiServiceAccountService/AiServiceAccountService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
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
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: 'slot-test-secret',
        lightdashSecrets: {
            active: 'slot-test-secret',
            all: ['slot-test-secret'],
            fallbacks: [],
        },
    },
});
const submitted = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        private_key: 'replacement-test-key',
        client_email: 'replacement@example.com',
    },
} as const;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Test replacement credentials' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'Slot', last_name: 'Creator' } as never)
        .returning('user_uuid');
    const [project] = await database('projects')
        .insert({
            name: 'Slot project',
            organization_id: org.organization_id,
        } as never)
        .returning(['project_uuid', 'project_id']);
    await database('warehouse_credentials').insert({
        project_id: project.project_id,
        warehouse_type: WarehouseTypes.BIGQUERY,
        encrypted_credentials: encryptionUtil.encrypt(
            JSON.stringify({
                ...submitted,
                project: 'warehouse-project',
                dataset: 'dataset',
                keyfileContents: {
                    type: 'authorized_user',
                    refresh_token: 'personal-refresh',
                },
                requireUserCredentials: true,
                allowUserCredentials: true,
            }),
        ),
    });
    const model = new AiServiceAccountCredentialsModel({
        database,
        encryptionUtil,
    });
    const slot = await model.upsert(
        project.project_uuid,
        null,
        {
            ...submitted,
            keyfileContents: {
                ...submitted.keyfileContents,
                private_key: 'saved-test-key',
            },
        },
        user.user_uuid,
    );
    await database.raw(
        'UPDATE ai_service_account_credentials SET encrypted_credentials = ? WHERE ai_service_account_credential_uuid = ?',
        [Buffer.from('not-ciphertext'), slot.uuid],
    );
    const account = buildAccount();
    account.user.id = user.user_uuid;
    account.organization.organizationUuid = org.organization_uuid;
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Project' },
    ]);
    const runQuery = vi.fn().mockResolvedValue({
        rows: [{ principal: 'replacement@example.com' }],
    });
    const withWarehouseClient = vi.fn(async (_ref, _context, callback) =>
        callback({ warehouseClient: { runQuery } }),
    );
    const analytics = { track: vi.fn() };
    const service = new AiServiceAccountService({
        analytics,
        aiServiceAccountCredentialsModel: model,
        projectModel: new ProjectModel({
            database,
            encryptionUtil,
            lightdashConfig: lightdashConfigMock,
        }),
        warehouseConnectionModel: new WarehouseConnectionModel({
            database,
            encryptionUtil,
            organizationWarehouseCredentialsModel:
                new OrganizationWarehouseCredentialsModel({
                    database,
                    encryptionUtil,
                }),
        }),
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as unknown as FeatureFlagModel,
        projectService: {
            warehouseClientFactory: { withWarehouseClient },
        } as unknown as Pick<ProjectService, 'warehouseClientFactory'>,
    });
    return {
        service,
        model,
        account,
        projectUuid: project.project_uuid,
        withWarehouseClient,
        runQuery,
        analytics,
        slot,
    };
};

test('tests a complete submitted key when the saved ciphertext is unreadable', async () => {
    const f = await fixture();
    await expect(f.model.getSecrets(f.projectUuid, null)).rejects.toThrow(
        'could not be read',
    );
    await expect(
        f.service.test(f.account, f.projectUuid, null, submitted),
    ).resolves.toMatchObject({
        ok: true,
        principal: 'replacement@example.com',
    });
    expect(f.withWarehouseClient).toHaveBeenCalledOnce();
    expect(f.withWarehouseClient.mock.calls[0][0]).toEqual({
        kind: 'bypass',
        mode: 'connection_test',
        agentSession: true,
        projectUuid: f.projectUuid,
        credentials: {
            ...submitted,
            project: 'warehouse-project',
            dataset: 'dataset',
            requireUserCredentials: false,
            allowUserCredentials: false,
        },
    });
    expect(f.runQuery).toHaveBeenCalledWith(
        'SELECT SESSION_USER() AS principal',
        {},
    );
    expect(await f.model.getSlot(f.projectUuid, null)).toEqual(f.slot);
    await expect(f.model.getSecrets(f.projectUuid, null)).rejects.toThrow(
        'could not be read',
    );
});

test('returns a sanitized failure when testing unreadable saved credentials', async () => {
    const f = await fixture();
    await expect(
        f.service.test(f.account, f.projectUuid, null, null),
    ).resolves.toEqual({
        ok: false,
        principal: null,
        observed: {},
        message:
            'Could not verify the shared agent account. Check the credentials and connection settings.',
        checkedAt: expect.any(Date),
    });
    expect(f.withWarehouseClient).not.toHaveBeenCalled();
    expect(f.analytics.track).toHaveBeenCalledOnce();
    expect(f.analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
            event: 'agent_identity.service_account_tested',
            properties: expect.objectContaining({
                result: 'failure',
                failureReason: 'connection_failed',
                credentialSource: 'saved',
            }),
        }),
    );
    expect(JSON.stringify(f.analytics.track.mock.calls)).not.toMatch(
        /saved-test-key|replacement-test-key|not-ciphertext/,
    );
});

test('requires a complete submitted key when the saved ciphertext is unreadable', async () => {
    const f = await fixture();
    await expect(
        f.service.test(f.account, f.projectUuid, null, {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        }),
    ).rejects.toEqual(
        new ParameterError(
            'Provide complete shared agent account credentials for the selected method.',
        ),
    );
    expect(f.withWarehouseClient).not.toHaveBeenCalled();
    expect(f.analytics.track).not.toHaveBeenCalled();
});
