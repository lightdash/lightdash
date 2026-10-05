import { Ability } from '@casl/ability';
import {
    AiIdentityStatus,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    PossibleAbilities,
    WarehouseTypes,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { AiIdentityModel } from '../../models/AiIdentityModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { AiIdentityService } from './AiIdentityService';
import { checkAiTwinConnection } from './aiTwinConnection';
import { getSnowflakeLogin } from './snowflakeLogin';

vi.mock('./aiTwinConnection', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('./aiTwinConnection')>();
    return { ...original, checkAiTwinConnection: vi.fn() };
});
vi.mock('./snowflakeLogin', () => ({ getSnowflakeLogin: vi.fn() }));

const projectUuid = 'project';
const adminAccount = fromSession(
    {
        ...defaultSessionUser,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'update' },
        ]),
    },
    'session-cookie',
);
const viewerAccount = fromSession(
    {
        ...defaultSessionUser,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'view' },
        ]),
    },
    'session-cookie',
);
const identity = {
    aiIdentityUuid: 'identity',
    userUuid: 'user',
    email: 'person@example.com',
    firstName: 'First',
    lastName: 'Last',
    snowflakeLogin: 'LOGIN',
    twinNameOverride: null,
    twinName: 'LOGIN_AI',
    publicKey: 'KEY',
    publicKeyFingerprint: 'SHA256:KEY',
    status: AiIdentityStatus.PENDING,
    statusMessage: null,
    checkedAt: null,
};
const aiIdentityModel = {
    getSettings: vi
        .fn()
        .mockResolvedValue({ twinNameTemplate: '{snowflake_login}_AI' }),
    updateSettings: vi
        .fn()
        .mockImplementation(async (_projectUuid, settings) => settings),
    list: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue(identity),
    findWithPrivateKey: vi
        .fn()
        .mockResolvedValue({ ...identity, privateKey: 'PRIVATE' }),
    create: vi.fn().mockResolvedValue(identity),
    getProjectMembers: vi.fn().mockResolvedValue([]),
    regenerateKey: vi.fn().mockResolvedValue(identity),
    setSnowflakeLogin: vi.fn(),
    setTwinNameOverride: vi.fn().mockResolvedValue(identity),
    updateStatus: vi.fn().mockImplementation(async (_uuid, update) => ({
        ...identity,
        ...update,
    })),
};
const projectModel = {
    get: vi.fn().mockResolvedValue({
        organizationUuid: 'org',
        warehouseConnection: { type: WarehouseTypes.SNOWFLAKE },
    }),
    getWarehouseCredentialsForProject: vi.fn().mockResolvedValue({
        type: WarehouseTypes.SNOWFLAKE,
        account: 'account',
        user: 'project',
        password: 'secret',
        database: 'DB',
        warehouse: 'WH',
        schema: 'SCHEMA',
    }),
};
const featureFlagModel = {
    get: vi.fn().mockResolvedValue({
        id: FeatureFlags.SnowflakeAiTwins,
        enabled: true,
    }),
};
const service = new AiIdentityService({
    aiIdentityModel: aiIdentityModel as unknown as AiIdentityModel,
    projectModel: projectModel as unknown as ProjectModel,
    featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
    userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
});
afterEach(() => {
    vi.clearAllMocks();
    aiIdentityModel.getProjectMembers.mockResolvedValue([]);
    featureFlagModel.get.mockResolvedValue({
        id: FeatureFlags.SnowflakeAiTwins,
        enabled: true,
    });
    aiIdentityModel.findWithPrivateKey.mockResolvedValue({
        ...identity,
        privateKey: 'PRIVATE',
    });
});

describe('AiIdentityService', () => {
    it('refuses users without project update permission', async () => {
        await expect(
            service.getSummary(viewerAccount, projectUuid),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('refuses access when the flag is off', async () => {
        featureFlagModel.get.mockResolvedValueOnce({
            id: FeatureFlags.SnowflakeAiTwins,
            enabled: false,
        });
        await expect(
            service.getSummary(adminAccount, projectUuid),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('validates the naming template', async () => {
        await expect(
            service.updateSettings(adminAccount, projectUuid, {
                twinNameTemplate: 'BAD-NAME',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            service.updateSettings(adminAccount, projectUuid, {
                twinNameTemplate: 'AI_{snowflake_login}',
            }),
        ).resolves.toEqual({ twinNameTemplate: 'AI_{snowflake_login}' });
    });

    it('rejects a template that yields an invalid name for an existing login', async () => {
        aiIdentityModel.list.mockResolvedValueOnce([
            { ...identity, snowflakeLogin: 'BAD-LOGIN' },
        ]);
        await expect(
            service.updateSettings(adminAccount, projectUuid, {
                twinNameTemplate: 'AI_{snowflake_login}',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('provisions only members without an identity', async () => {
        aiIdentityModel.list
            .mockResolvedValueOnce([identity])
            .mockResolvedValueOnce([identity]);
        aiIdentityModel.getProjectMembers.mockResolvedValue([
            {
                userUuid: 'user',
                email: 'person@example.com',
                firstName: 'First',
                lastName: 'Last',
            },
            {
                userUuid: 'missing',
                email: 'missing@example.com',
                firstName: 'Missing',
                lastName: 'Person',
            },
        ]);
        await service.provision(adminAccount, projectUuid);
        expect(aiIdentityModel.create).toHaveBeenCalledTimes(1);
        expect(aiIdentityModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                userUuid: 'missing',
                snowflakeLogin: null,
            }),
        );
    });

    it('regenerates an existing identity key', async () => {
        await service.regenerateKey(adminAccount, projectUuid, 'user');
        expect(aiIdentityModel.regenerateKey).toHaveBeenCalledWith(
            'identity',
            expect.objectContaining({
                publicKey: expect.any(String),
                privateKey: expect.any(String),
            }),
        );
    });

    it('continues provisioning when one personal login lookup fails', async () => {
        const first = { ...identity, snowflakeLogin: null };
        const second = {
            ...first,
            aiIdentityUuid: 'second',
            userUuid: 'second',
        };
        aiIdentityModel.list
            .mockResolvedValueOnce([first, second])
            .mockResolvedValueOnce([first, second])
            .mockResolvedValueOnce([first, second]);
        projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'account',
            user: 'project',
            password: 'secret',
            database: 'DB',
            warehouse: 'WH',
            schema: 'SCHEMA',
            requireUserCredentials: true,
        });
        vi.mocked(getSnowflakeLogin)
            .mockRejectedValueOnce(new Error('Connection failed'))
            .mockResolvedValueOnce('SECOND');
        await service.provision(adminAccount, projectUuid);
        expect(getSnowflakeLogin).toHaveBeenCalledTimes(2);
        expect(aiIdentityModel.setSnowflakeLogin).toHaveBeenCalledWith(
            'second',
            'SECOND',
        );
    });

    it('marks a working AI identity ready', async () => {
        vi.mocked(checkAiTwinConnection).mockResolvedValueOnce({
            ok: true,
            currentUser: 'LOGIN_AI',
            currentRole: 'ROLE',
        });
        const result = await service.testIdentity(
            adminAccount,
            projectUuid,
            'user',
        );
        expect(result.status).toBe(AiIdentityStatus.READY);
        expect(aiIdentityModel.updateStatus).toHaveBeenCalledWith('identity', {
            status: AiIdentityStatus.READY,
            statusMessage: null,
        });
    });

    it('marks a rejected AI identity failed', async () => {
        vi.mocked(checkAiTwinConnection).mockResolvedValueOnce({
            ok: false,
            message: 'Agent session inactive',
        });
        const result = await service.testIdentity(
            adminAccount,
            projectUuid,
            'user',
        );
        expect(result.status).toBe(AiIdentityStatus.FAILED);
        expect(aiIdentityModel.updateStatus).toHaveBeenCalledWith('identity', {
            status: AiIdentityStatus.FAILED,
            statusMessage: 'Agent session inactive',
        });
    });
});
