import { Ability } from '@casl/ability';
import {
    AiIdentityCreationMode,
    AiIdentityFailureReason,
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityProvisionerStatus,
    AiIdentitySort,
    AiIdentityState,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    PossibleAbilities,
    WarehouseTypes,
    type AiIdentity,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { AiIdentityModel } from '../../models/AiIdentityModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { AiIdentityService } from './AiIdentityService';
import { checkAiTwinConnection } from './aiTwinConnection';
import { ProvisionerConnection } from './provisionerConnection';

vi.mock('./aiTwinConnection', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('./aiTwinConnection')>();
    return { ...original, checkAiTwinConnection: vi.fn() };
});

const { organizationUuid } = defaultSessionUser;
if (!organizationUuid) throw new Error('Test user needs an organization');
const admin = fromSession(
    {
        ...defaultSessionUser,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'manage' },
        ]),
    },
    'session-cookie',
);
const viewer = fromSession(
    {
        ...defaultSessionUser,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'view' },
        ]),
    },
    'session-cookie',
);
const projectViewer = fromSession(
    {
        ...defaultSessionUser,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'view' },
        ]),
    },
    'session-cookie',
);
const account = {
    aiIdentityAccountUuid: 'account',
    organizationUuid,
    snowflakeAccount: 'ACCOUNT',
    twinNameTemplate: null,
    roleTemplate: null,
    lastFullCheckAt: null,
    effectiveMode: AiIdentityCreationMode.GUIDED,
    fallbackReason: null,
    counts: { total: 1, ready: 0, pending: 1, failed: 0, needs_sign_in: 0 },
};
const identity = {
    aiIdentityUuid: 'identity',
    aiIdentityAccountUuid: 'account',
    snowflakeAccount: 'ACCOUNT',
    userUuid: 'user',
    email: 'person@example.com',
    firstName: 'Person',
    lastName: 'Example',
    snowflakeLogin: 'PERSON',
    twinNameOverride: null,
    twinName: 'PERSON_AI',
    publicKey: 'KEY',
    publicKeyFingerprint: 'SHA256:KEY',
    state: AiIdentityState.PENDING,
    stale: false,
    failureReason: null,
    statusMessage: null,
    checkedAt: null,
    createdAt: new Date(),
};
const model = {
    listAccounts: vi.fn().mockResolvedValue([account]),
    getAccount: vi.fn().mockResolvedValue(account),
    getOrCreateAccount: vi.fn().mockResolvedValue(account),
    getProvisioner: vi
        .fn()
        .mockResolvedValue({ status: 'ready', firstRunApprovedAt: null }),
    updateProvisioner: vi.fn(),
    getProvisioningMode: vi
        .fn()
        .mockResolvedValue(AiIdentityCreationMode.GUIDED),
    withProvisioningLock: vi
        .fn()
        .mockImplementation((_accountUuid, run) => run()),
    getRoleMappings: vi.fn().mockResolvedValue([]),
    getAiRoles: vi.fn().mockResolvedValue([]),
    getProvisioningIdentities: vi.fn().mockResolvedValue([]),
    listProvisioningDrops: vi.fn().mockResolvedValue([]),
    getProjectMemberIds: vi.fn().mockResolvedValue(['user']),
    markProvisioned: vi.fn(),
    markProvisionedKey: vi.fn(),
    getOrganizationGroupUuids: vi.fn().mockResolvedValue(new Set(['group'])),
    replaceRoleMappings: vi.fn(),
    findByUuid: vi.fn().mockResolvedValue(identity),
    find: vi.fn().mockResolvedValue(identity),
    findByUuidWithPrivateKey: vi
        .fn()
        .mockResolvedValue({ ...identity, privateKey: 'PRIVATE' }),
    list: vi.fn().mockResolvedValue({
        data: [identity],
        counts: account.counts,
        pagination: {
            page: 1,
            pageSize: 50,
            totalResults: 1,
            totalPageCount: 1,
        },
        failureGroups: [],
    }),
    updateAccountTemplate: vi.fn().mockResolvedValue(account),
    setTwinNameOverride: vi.fn().mockResolvedValue(identity),
    setKeys: vi.fn().mockResolvedValue(identity),
    updateStatus: vi.fn().mockResolvedValue(identity),
    addEvent: vi.fn(),
    getJob: vi.fn(),
    updateJob: vi.fn(),
    idsForFilter: vi.fn(),
    setLastFullCheck: vi.fn(),
    listEvents: vi.fn().mockResolvedValue({
        data: [],
        pagination: {
            page: 1,
            pageSize: 20,
            totalResults: 0,
            totalPageCount: 0,
        },
    }),
    createJob: vi.fn().mockResolvedValue({
        jobUuid: 'job',
        kind: AiIdentityJobKind.TEST,
        status: AiIdentityJobStatus.QUEUED,
        total: 0,
        done: 0,
        fileUrl: null,
        error: null,
        createdAt: new Date(),
    }),
};
const projects = {
    getAllByOrganizationUuid: vi
        .fn()
        .mockResolvedValue([
            { projectUuid: 'project', warehouseType: WarehouseTypes.SNOWFLAKE },
        ]),
    getWarehouseCredentialsForProject: vi.fn().mockResolvedValue({
        type: WarehouseTypes.SNOWFLAKE,
        account: 'account',
        warehouse: 'COMPUTE_WH',
        user: 'PROJECT',
    }),
    getSummary: vi.fn().mockResolvedValue({
        projectUuid: 'project',
        organizationUuid,
    }),
    getAiAccessRestrictions: vi.fn().mockResolvedValue(true),
};
const flags = {
    get: vi.fn().mockResolvedValue({
        enabled: true,
        id: FeatureFlags.SnowflakeAiTwins,
    }),
};
const scheduler = {
    scheduleTask: vi.fn().mockResolvedValue({ jobId: 'queued' }),
};
const storage = {
    uploadTextFile: vi.fn().mockResolvedValue('https://storage.example/export'),
    uploadCsv: vi.fn().mockResolvedValue('https://storage.example/export.csv'),
};
const service = new AiIdentityService({
    aiIdentityModel: model as unknown as AiIdentityModel,
    projectModel: projects as unknown as ProjectModel,
    featureFlagModel: flags as unknown as FeatureFlagModel,
    userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
    schedulerClient: scheduler as unknown as SchedulerClient,
    fileStorageClient: storage as unknown as FileStorageClient,
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    flags.get.mockResolvedValue({
        enabled: true,
        id: FeatureFlags.SnowflakeAiTwins,
    });
    model.findByUuidWithPrivateKey.mockResolvedValue({
        ...identity,
        privateKey: 'PRIVATE',
    });
    model.idsForFilter.mockReset();
    model.getJob.mockReset();
    model.getAccount.mockResolvedValue(account);
    model.getProvisioner.mockResolvedValue({
        status: 'ready',
        firstRunApprovedAt: null,
    });
    model.getProvisioningMode.mockResolvedValue(AiIdentityCreationMode.GUIDED);
    model.getRoleMappings.mockResolvedValue([]);
    model.getAiRoles.mockResolvedValue([]);
    model.getProvisioningIdentities.mockResolvedValue([]);
    model.listProvisioningDrops.mockResolvedValue([]);
    model.find.mockResolvedValue(identity);
});

describe('AiIdentityService', () => {
    it('records each executed provisioning statement', async () => {
        model.getJob.mockResolvedValueOnce({
            jobUuid: 'job',
            kind: AiIdentityJobKind.PROVISION,
            status: AiIdentityJobStatus.QUEUED,
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            createdByUserUuid: admin.user.id,
            createdAt: new Date(),
            total: 0,
            done: 0,
            fileUrl: null,
            error: null,
        });
        model.getProvisioningMode.mockResolvedValue(
            AiIdentityCreationMode.AUTOMATIC,
        );
        model.getProvisioner.mockResolvedValue({
            status: 'ready',
            firstRunApprovedAt: new Date(),
            userName: 'LIGHTDASH_PROVISIONER',
            roleName: 'LIGHTDASH_PROVISIONER_ROLE',
            privateKey: 'PRIVATE',
        });
        model.getRoleMappings.mockResolvedValue([
            {
                aiIdentityRoleMappingUuid: 'mapping',
                groupUuid: 'group',
                groupName: 'Group',
                aiRole: 'ANALYST_AI',
                priority: 1,
            },
        ]);
        model.getProvisioningIdentities.mockResolvedValue([
            {
                ...identity,
                publicKey: 'YWJj',
                groupUuids: ['group'],
                createdByProvisioner: false,
                provisionedRole: null,
                provisionedUserName: null,
                provisionedPublicKeyFingerprint: null,
            },
        ]);
        model.findByUuidWithPrivateKey.mockResolvedValue({
            ...identity,
            privateKey: null,
        });
        vi.spyOn(
            ProvisionerConnection.prototype,
            'currentIdentity',
        ).mockResolvedValue({
            user: 'LIGHTDASH_PROVISIONER',
            role: 'LIGHTDASH_PROVISIONER_ROLE',
        });
        vi.spyOn(
            ProvisionerConnection.prototype,
            'grantsToRole',
        ).mockResolvedValue([
            { privilege: 'CREATE USER', granted_on: 'ACCOUNT' },
            { privilege: 'OWNERSHIP', granted_on: 'ROLE', name: 'ANALYST_AI' },
        ]);
        vi.spyOn(ProvisionerConnection.prototype, 'users').mockResolvedValue(
            [],
        );
        const execute = vi
            .spyOn(ProvisionerConnection.prototype, 'execute')
            .mockResolvedValue('SQL');
        await service.runJob('job');
        expect(execute).toHaveBeenCalledTimes(2);
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'provision_statement',
                detail: expect.stringContaining('CREATE USER'),
                status: 'success',
                actorUserUuid: admin.user.id,
            }),
        );
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'provision_statement',
                detail: expect.stringContaining('GRANT ROLE'),
                status: 'success',
            }),
        );
    });
    it('tests an AI identity again after a new key is applied', async () => {
        model.getJob.mockResolvedValue({
            jobUuid: 'job',
            kind: AiIdentityJobKind.PROVISION,
            status: AiIdentityJobStatus.QUEUED,
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            createdByUserUuid: admin.user.id,
            createdAt: new Date(),
            total: 1,
            done: 1,
            fileUrl: null,
            error: null,
        });
        model.getProvisioningMode.mockResolvedValue(
            AiIdentityCreationMode.AUTOMATIC,
        );
        model.getProvisioner.mockResolvedValue({
            status: 'ready',
            firstRunApprovedAt: new Date(),
            userName: 'LIGHTDASH_PROVISIONER',
            roleName: 'LIGHTDASH_PROVISIONER_ROLE',
            privateKey: 'PRIVATE',
        });
        model.getRoleMappings.mockResolvedValue([
            {
                aiIdentityRoleMappingUuid: 'mapping',
                groupUuid: 'group',
                groupName: 'Group',
                aiRole: 'ANALYST_AI',
                priority: 1,
            },
        ]);
        model.getProvisioningIdentities.mockResolvedValue([
            {
                ...identity,
                publicKey: 'YWJj',
                publicKeyFingerprint: 'SHA256:NEW',
                groupUuids: ['group'],
                createdByProvisioner: true,
                provisionedRole: 'ANALYST_AI',
                provisionedUserName: 'PERSON_AI',
                provisionedPublicKeyFingerprint: 'SHA256:OLD',
            },
        ]);
        vi.spyOn(
            ProvisionerConnection.prototype,
            'currentIdentity',
        ).mockResolvedValue({
            user: 'LIGHTDASH_PROVISIONER',
            role: 'LIGHTDASH_PROVISIONER_ROLE',
        });
        vi.spyOn(
            ProvisionerConnection.prototype,
            'grantsToRole',
        ).mockResolvedValue([
            { privilege: 'CREATE USER', granted_on: 'ACCOUNT' },
            { privilege: 'OWNERSHIP', granted_on: 'ROLE', name: 'ANALYST_AI' },
        ]);
        vi.spyOn(ProvisionerConnection.prototype, 'users').mockResolvedValue(
            [],
        );
        const execute = vi
            .spyOn(ProvisionerConnection.prototype, 'execute')
            .mockResolvedValue('SQL');
        const testIdentity = vi
            .spyOn(
                service as unknown as {
                    testIdentityByUuid: (uuid: string) => Promise<unknown>;
                },
                'testIdentityByUuid',
            )
            .mockResolvedValue(identity);
        await service.runJob('job');
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'set_public_key' }),
        );
        expect(testIdentity).toHaveBeenCalledTimes(1);
        expect(testIdentity).toHaveBeenCalledWith(identity.aiIdentityUuid);
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                actorType: 'scheduler',
                action: AiIdentityJobKind.PROVISION,
                targetCount: 1,
            }),
        );
    });
    it('keeps a ready provisioner ready when a mapping uses a role it already has', async () => {
        model.getProvisioner.mockResolvedValue({
            aiIdentityAccountUuid: 'account',
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            publicKey: 'YWJj',
            privateKey: 'key',
            publicKeyFingerprint: 'fingerprint',
            status: AiIdentityProvisionerStatus.READY,
            statusMessage: null,
            checkedAt: null,
            firstRunApprovedAt: null,
            firstRunApprovedByName: null,
            findings: [],
        });
        model.getAiRoles.mockResolvedValue([
            {
                aiIdentityAiRoleUuid: 'role',
                roleName: 'ANALYST_AI',
                warehouse: 'COMPUTE_WH',
                schemas: ['ANALYTICS.PUBLIC'],
            },
        ]);
        await service.replaceProvisioningMappings(admin, 'account', [
            { groupUuid: 'group', aiRole: 'analyst_ai', priority: 1 },
        ]);
        expect(model.replaceRoleMappings).toHaveBeenCalled();
        expect(model.updateProvisioner).not.toHaveBeenCalled();
    });
    it('asks for the setup script again when a mapping adds a new role', async () => {
        model.getProvisioner.mockResolvedValue({
            aiIdentityAccountUuid: 'account',
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            publicKey: 'YWJj',
            privateKey: 'key',
            publicKeyFingerprint: 'fingerprint',
            status: AiIdentityProvisionerStatus.READY,
            statusMessage: null,
            checkedAt: null,
            firstRunApprovedAt: null,
            firstRunApprovedByName: null,
            findings: [],
        });
        model.getAiRoles.mockResolvedValue([]);
        model.getRoleMappings.mockResolvedValueOnce([]).mockResolvedValue([
            {
                aiIdentityRoleMappingUuid: 'mapping',
                groupUuid: 'group',
                groupName: 'Group',
                aiRole: 'FINANCE_AI',
                priority: 1,
            },
        ]);
        await service.replaceProvisioningMappings(admin, 'account', [
            { groupUuid: 'group', aiRole: 'FINANCE_AI', priority: 1 },
        ]);
        expect(model.updateProvisioner).toHaveBeenCalledWith(
            'account',
            expect.objectContaining({
                status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
            }),
        );
    });
    it('shows guided fallback when the provisioner is revoked', async () => {
        model.getProvisioningMode.mockResolvedValueOnce(
            AiIdentityCreationMode.AUTOMATIC,
        );
        model.getProvisioner.mockResolvedValueOnce({
            aiIdentityAccountUuid: 'account',
            userName: 'LIGHTDASH_PROVISIONER',
            roleName: 'LIGHTDASH_PROVISIONER_ROLE',
            publicKey: 'YWJj',
            publicKeyFingerprint: 'fingerprint',
            status: 'revoked',
            statusMessage: 'JWT token is invalid',
            checkedAt: new Date(),
            firstRunApprovedAt: new Date(),
            firstRunApprovedByName: 'Admin',
            findings: [],
        });
        const settings = await service.getProvisioningSettings(
            admin,
            'account',
        );
        expect(settings.effectiveMode).toBe(AiIdentityCreationMode.GUIDED);
        expect(settings.fallbackReason).toContain('JWT token is invalid');
    });
    it('reports a defined AI role missing from the provisioner grants', async () => {
        model.getAiRoles.mockResolvedValueOnce([
            {
                aiIdentityAiRoleUuid: 'role',
                roleName: 'ANALYST_AI',
                warehouse: 'COMPUTE_WH',
                schemas: ['ANALYTICS.PUBLIC'],
            },
        ]);
        model.getProvisioner.mockResolvedValue({
            aiIdentityAccountUuid: 'account',
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            publicKey: 'YWJj',
            privateKey: 'key',
            publicKeyFingerprint: 'fingerprint',
            status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
            statusMessage: null,
            checkedAt: null,
            firstRunApprovedAt: null,
            firstRunApprovedByName: null,
            findings: [],
        });
        vi.spyOn(
            ProvisionerConnection.prototype,
            'currentIdentity',
        ).mockResolvedValue({ user: 'PROVISIONER', role: 'PROVISIONER_ROLE' });
        vi.spyOn(
            ProvisionerConnection.prototype,
            'grantsToRole',
        ).mockResolvedValue([
            {
                privilege: 'CREATE USER',
                granted_on: 'ACCOUNT',
                name: 'ACCOUNT',
            },
        ]);
        vi.spyOn(ProvisionerConnection.prototype, 'users').mockResolvedValue(
            [],
        );
        await service.verifyProvisioner(admin, 'account');
        expect(model.updateProvisioner).toHaveBeenCalledWith(
            'account',
            expect.objectContaining({
                status: AiIdentityProvisionerStatus.FAILING,
                statusMessage:
                    'The provisioner is missing OWNERSHIP on AI role ANALYST_AI.',
            }),
        );
    });
    it('records approval before the first provisioning job', async () => {
        const result = await service.runProvisioning(admin, 'account', true);
        expect(result.jobUuid).toBe('job');
        expect(model.updateProvisioner).toHaveBeenCalledWith('account', {
            approvedBy: admin.user.id,
        });
        expect(model.createJob).toHaveBeenCalledWith(
            expect.objectContaining({ kind: AiIdentityJobKind.PROVISION }),
        );
    });

    it('requires approval on the first provisioning run', async () => {
        await expect(
            service.runProvisioning(admin, 'account', false),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(model.createJob).not.toHaveBeenCalled();
    });
    it('requires organization manage permission', async () => {
        await expect(service.getAccounts(viewer)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(projects.getAllByOrganizationUuid).not.toHaveBeenCalled();
    });

    it('requires the Snowflake AI twins flag', async () => {
        flags.get.mockResolvedValueOnce({
            enabled: false,
            id: FeatureFlags.SnowflakeAiTwins,
        });
        await expect(service.getAccounts(admin)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
    });

    it('creates one account for a normalized Snowflake connection and logs the list', async () => {
        await service.getAccounts(admin);
        expect(model.getOrCreateAccount).toHaveBeenCalledWith(
            organizationUuid,
            'ACCOUNT',
        );
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'list',
                organizationUuid,
                targetCount: 1,
            }),
        );
    });

    it('validates a template before updating checks', async () => {
        await expect(
            service.updateAccount(admin, 'account', 'BAD-NAME'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(model.updateAccountTemplate).not.toHaveBeenCalled();
        await service.updateAccount(admin, 'account', 'AI_{snowflake_login}');
        expect(model.updateAccountTemplate).toHaveBeenCalledWith(
            'account',
            'AI_{snowflake_login}',
            null,
        );
    });

    it('uses the SQL filtered list and logs the request', async () => {
        await service.list(
            admin,
            {
                aiIdentityAccountUuid: 'account',
                states: [AiIdentityState.PENDING],
                reasons: [],
                projectUuid: null,
                search: 'person',
                staleOnly: false,
            },
            AiIdentitySort.SEVERITY,
            'asc',
            1,
            50,
        );
        expect(model.list).toHaveBeenCalledWith(
            expect.objectContaining({
                states: [AiIdentityState.PENDING],
                search: 'person',
            }),
            AiIdentitySort.SEVERITY,
            'asc',
            1,
            50,
        );
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'list' }),
        );
    });

    it('classifies a failed connection check', async () => {
        vi.mocked(checkAiTwinConnection).mockResolvedValueOnce({
            ok: false,
            message: 'JWT token is invalid.',
        });
        await service.testIdentity(admin, 'identity');
        expect(model.updateStatus).toHaveBeenCalledWith(
            'identity',
            expect.objectContaining({
                failureReason: 'key_or_user_rejected',
                statusMessage: 'JWT token is invalid.',
            }),
        );
    });

    it('queues a bulk test with its filter and logs the action', async () => {
        const filter = {
            aiIdentityAccountUuid: 'account',
            states: [AiIdentityState.FAILED],
            reasons: [],
            projectUuid: null,
            search: null,
            staleOnly: false,
        };
        await service.bulkTest(admin, { filter });
        expect(model.createJob).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: AiIdentityJobKind.TEST,
                filter,
            }),
        );
        expect(scheduler.scheduleTask).toHaveBeenCalledWith('aiIdentityJob', {
            jobUuid: 'job',
        });
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'bulk_test',
                aiIdentityJobUuid: 'job',
                targetCount: 0,
            }),
        );
    });

    it('links a scheduler submission failure to the requested job', async () => {
        scheduler.scheduleTask.mockRejectedValueOnce(
            new Error('Queue unavailable'),
        );
        await expect(
            service.bulkTest(admin, {
                filter: {
                    aiIdentityAccountUuid: 'account',
                    states: [],
                    reasons: [],
                    projectUuid: null,
                    search: null,
                    staleOnly: false,
                },
            }),
        ).rejects.toThrow('Queue unavailable');
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                aiIdentityJobUuid: 'job',
                action: 'bulk_test',
                status: 'error',
                detail: 'Queue unavailable',
            }),
        );
    });

    it('links a failed background job outcome to the initiating job', async () => {
        model.getJob.mockResolvedValue({
            jobUuid: 'job',
            kind: AiIdentityJobKind.TEST,
            status: AiIdentityJobStatus.QUEUED,
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            filter: { aiIdentityAccountUuid: 'account' },
        });
        model.idsForFilter.mockRejectedValueOnce(
            new Error('Check unavailable'),
        );
        await expect(service.runJob('job')).rejects.toThrow(
            'Check unavailable',
        );
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                aiIdentityJobUuid: 'job',
                actorType: 'scheduler',
                status: 'error',
                detail: 'Check unavailable',
            }),
        );
    });

    it('runs a test job in batches and records progress', async () => {
        model.getJob.mockResolvedValue({
            jobUuid: 'job',
            kind: AiIdentityJobKind.TEST,
            status: AiIdentityJobStatus.QUEUED,
            total: 1,
            done: 1,
            fileUrl: null,
            error: null,
            createdAt: new Date(),
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            filter: {
                aiIdentityAccountUuid: 'account',
                states: [],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            format: null,
            roleForTwin: null,
        });
        model.idsForFilter
            .mockResolvedValueOnce(['identity'])
            .mockResolvedValueOnce([]);
        vi.mocked(checkAiTwinConnection).mockResolvedValueOnce({
            ok: true,
            currentUser: 'PERSON_AI',
            currentRole: null,
        });
        await service.runJob('job');
        expect(model.idsForFilter).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            'identity',
            20,
        );
        expect(model.updateJob).toHaveBeenCalledWith('job', { done: 1 });
        expect(model.addEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                actorType: 'scheduler',
                aiIdentityJobUuid: 'job',
                status: 'success',
                targetCount: 1,
            }),
        );
        expect(model.setLastFullCheck).toHaveBeenCalledWith('account');
        expect(model.updateJob).toHaveBeenCalledWith('job', {
            status: AiIdentityJobStatus.DONE,
        });
    });

    it.each([null, '{snowflake_login}_AI_ROLE', 'FIXED_ROLE'])(
        'exports provisioning SQL with role %s through file storage',
        async (roleForTwin) => {
            model.getJob.mockResolvedValue({
                jobUuid: 'job',
                kind: AiIdentityJobKind.EXPORT,
                status: AiIdentityJobStatus.QUEUED,
                total: 0,
                done: 0,
                fileUrl: null,
                error: null,
                createdAt: new Date(),
                organizationUuid,
                aiIdentityAccountUuid: 'account',
                filter: {
                    aiIdentityAccountUuid: 'account',
                    states: [],
                    reasons: [],
                    projectUuid: null,
                    search: null,
                    staleOnly: false,
                },
                format: 'sql',
                roleForTwin,
            });
            await service.runJob('job');
            expect(storage.uploadTextFile).toHaveBeenCalledWith(
                expect.any(Buffer),
                'job',
                'sql',
            );
            const sql = storage.uploadTextFile.mock.calls[0][0].toString();
            if (roleForTwin === null) {
                expect(sql).not.toContain('DEFAULT_ROLE');
                expect(sql).not.toContain('GRANT ROLE');
            } else {
                const role =
                    roleForTwin === 'FIXED_ROLE'
                        ? 'FIXED_ROLE'
                        : 'PERSON_AI_ROLE';
                expect(sql).toContain(`GRANT ROLE ${role} TO USER PERSON_AI;`);
            }
            expect(model.updateJob).toHaveBeenCalledWith(
                'job',
                expect.objectContaining({
                    done: 1,
                    fileUrl: 'https://storage.example/export',
                }),
            );
        },
    );

    it('uses the stored role template when an export omits an override', async () => {
        model.getAccount.mockResolvedValue({
            ...account,
            roleTemplate: '{ai_identity_name}_ROLE',
        });
        await service.export(admin, {
            filter: {
                aiIdentityAccountUuid: 'account',
                states: [],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            format: 'sql',
        });
        expect(model.createJob).toHaveBeenCalledWith(
            expect.objectContaining({ roleForTwin: '{ai_identity_name}_ROLE' }),
        );
    });

    it('exports runnable repair SQL for a rejected identity group', async () => {
        model.getJob.mockResolvedValue({
            jobUuid: 'job',
            kind: AiIdentityJobKind.EXPORT,
            status: AiIdentityJobStatus.QUEUED,
            total: 0,
            done: 0,
            fileUrl: null,
            error: null,
            createdAt: new Date(),
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            filter: {
                aiIdentityAccountUuid: 'account',
                states: [AiIdentityState.FAILED],
                reasons: [AiIdentityFailureReason.KEY_OR_USER_REJECTED],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            format: 'sql',
            roleForTwin: '{ai_identity_name}_ROLE',
        });
        await service.runJob('job');
        const sql = storage.uploadTextFile.mock.calls[0][0].toString();
        expect(sql).toContain(
            'ALTER USER PERSON_AI SET DEFAULT_ROLE = PERSON_AI_ROLE;',
        );
        expect(sql).toContain('GRANT ROLE PERSON_AI_ROLE TO USER PERSON_AI;');
    });

    it('lists people who need a Snowflake sign-in as skipped in a pending export', async () => {
        model.getJob.mockResolvedValue({
            jobUuid: 'job',
            kind: AiIdentityJobKind.EXPORT,
            status: AiIdentityJobStatus.QUEUED,
            total: 0,
            done: 0,
            fileUrl: null,
            error: null,
            skipped: [],
            createdAt: new Date(),
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            filter: {
                aiIdentityAccountUuid: 'account',
                states: [AiIdentityState.PENDING],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            format: 'sql',
            roleForTwin: null,
        });
        const page = (data: AiIdentity[]) => ({
            data,
            counts: account.counts,
            pagination: {
                page: 1,
                pageSize: 100,
                totalResults: data.length,
                totalPageCount: 1,
            },
            failureGroups: [],
        });
        model.list
            .mockResolvedValueOnce(page([identity]))
            .mockResolvedValueOnce(
                page([
                    {
                        ...identity,
                        aiIdentityUuid: 'unnamed',
                        email: 'unnamed@example.com',
                        snowflakeLogin: null,
                        twinName: null,
                    },
                ]),
            );
        await service.runJob('job');
        expect(model.list).toHaveBeenLastCalledWith(
            expect.objectContaining({
                states: [AiIdentityState.NEEDS_SIGN_IN],
            }),
            expect.anything(),
            expect.anything(),
            1,
            100,
        );
        const sql = storage.uploadTextFile.mock.calls[0][0].toString();
        expect(sql).toContain(
            '-- Skipped unnamed@example.com: no Snowflake login recorded; ask them to sign in to Snowflake or set an AI identity name',
        );
        expect(sql).toContain('CREATE USER IF NOT EXISTS PERSON_AI');
    });

    it('exports people with logins and reports those skipped by the role template', async () => {
        model.getJob.mockResolvedValue({
            jobUuid: 'job',
            kind: AiIdentityJobKind.EXPORT,
            status: AiIdentityJobStatus.QUEUED,
            total: 0,
            done: 0,
            fileUrl: null,
            error: null,
            skipped: [],
            createdAt: new Date(),
            organizationUuid,
            aiIdentityAccountUuid: 'account',
            filter: {
                aiIdentityAccountUuid: 'account',
                states: [],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            format: 'sql',
            roleForTwin: '{snowflake_login}_AI_ROLE',
        });
        model.list.mockResolvedValueOnce({
            data: [
                identity,
                {
                    ...identity,
                    aiIdentityUuid: 'missing',
                    email: 'missing@example.com',
                    snowflakeLogin: null,
                    twinName: 'OVERRIDE_AI',
                },
            ],
            counts: account.counts,
            pagination: {
                page: 1,
                pageSize: 100,
                totalResults: 2,
                totalPageCount: 1,
            },
            failureGroups: [],
        });
        await service.runJob('job');
        const sql = storage.uploadTextFile.mock.calls[0][0].toString();
        expect(sql).toContain(
            '-- Skipped missing@example.com: no Snowflake login recorded',
        );
        expect(sql).toContain('CREATE USER IF NOT EXISTS PERSON_AI');
        expect(sql).not.toContain('CREATE USER IF NOT EXISTS OVERRIDE_AI');
        expect(model.updateJob).toHaveBeenCalledWith(
            'job',
            expect.objectContaining({
                total: 2,
                done: 2,
                skipped: [
                    {
                        email: 'missing@example.com',
                        reason: 'no Snowflake login recorded, so the role template could not be filled; ask them to sign in to Snowflake or use {ai_identity_name} in the role template',
                    },
                ],
            }),
        );
    });

    it('enqueues a sign-in update without a request account', async () => {
        await service.scheduleSignIn(organizationUuid, 'user');
        expect(scheduler.scheduleTask).toHaveBeenCalledWith(
            'aiIdentitySignIn',
            {
                organizationUuid,
                userUuid: 'user',
            },
        );
    });

    it('uses the connection warehouse in commented repair SQL when the role is unknown', async () => {
        model.findByUuid.mockResolvedValueOnce({
            ...identity,
            failureReason: 'warehouse_access',
        });
        projects.getWarehouseCredentialsForProject.mockResolvedValueOnce({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'account',
            user: 'PROJECT',
            warehouse: 'REAL_WH',
        });
        await expect(
            service.getDetail(admin, 'identity'),
        ).resolves.toMatchObject({
            fixSql: expect.stringContaining(
                '-- GRANT USAGE ON WAREHOUSE REAL_WH TO ROLE AI_ROLE;',
            ),
        });
    });

    it('returns detail guidance and identity history', async () => {
        model.findByUuid.mockResolvedValueOnce({
            ...identity,
            failureReason: 'key_or_user_rejected',
        });
        await expect(
            service.getDetail(admin, 'identity'),
        ).resolves.toMatchObject({
            fixSql: expect.stringContaining(
                'ALTER USER PERSON_AI SET RSA_PUBLIC_KEY',
            ),
            sameReasonCount: 0,
            history: [],
        });
        expect(model.listEvents).toHaveBeenCalledWith(
            organizationUuid,
            1,
            20,
            'identity',
            false,
        );
    });

    it('creates a key when an override resolves a missing name', async () => {
        model.setTwinNameOverride.mockResolvedValueOnce({
            ...identity,
            publicKey: null,
        });
        await service.updateIdentity(admin, 'identity', 'PERSON_AI');
        expect(model.setKeys).toHaveBeenCalledWith(
            'identity',
            expect.objectContaining({
                publicKey: expect.any(String),
                privateKey: expect.any(String),
            }),
        );
    });

    it('rejects invalid role templates before queuing an export', async () => {
        await expect(
            service.export(admin, {
                filter: {
                    aiIdentityAccountUuid: 'account',
                    states: [],
                    reasons: [],
                    projectUuid: null,
                    search: null,
                    staleOnly: false,
                },
                format: 'sql',
                roleForTwin: '{unknown}_ROLE',
            }),
        ).rejects.toThrow('Invalid Snowflake role template');
        expect(scheduler.scheduleTask).not.toHaveBeenCalled();
    });

    it('queues export and sync jobs for an account', async () => {
        const filter = {
            aiIdentityAccountUuid: 'account',
            states: [AiIdentityState.PENDING],
            reasons: [],
            projectUuid: null,
            search: null,
            staleOnly: false,
        };
        await service.export(admin, {
            filter,
            format: 'sql',
            roleForTwin: null,
        });
        await service.sync(admin, 'account');
        expect(model.createJob).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: AiIdentityJobKind.EXPORT,
                format: 'sql',
            }),
        );
        expect(model.createJob).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: AiIdentityJobKind.SYNC,
            }),
        );
    });

    it('returns account jobs and request events to an admin', async () => {
        model.getJob.mockResolvedValueOnce({
            jobUuid: 'job',
            organizationUuid,
            aiIdentityAccountUuid: 'account',
        });
        await expect(service.getJob(admin, 'job')).resolves.toMatchObject({
            jobUuid: 'job',
        });
        await service.getRequestLog(admin, 2, 20);
        expect(model.listEvents).toHaveBeenCalledWith(
            organizationUuid,
            2,
            20,
            null,
            false,
        );
    });

    it('shows the person one sign-in action and blocks raw SQL until ready', async () => {
        model.find.mockResolvedValueOnce({
            ...identity,
            snowflakeLogin: null,
            twinName: null,
            state: AiIdentityState.NEEDS_SIGN_IN,
        });
        await expect(
            service.getAiAccessForUser({
                account: projectViewer,
                projectUuid: 'project',
            }),
        ).resolves.toMatchObject({
            aiIdentityRequired: true,
            state: AiIdentityState.NEEDS_SIGN_IN,
            action: 'sign_in',
            rawSqlAllowed: false,
        });
        model.find.mockResolvedValueOnce({
            ...identity,
            state: AiIdentityState.READY,
        });
        await expect(
            service.getAiAccessForUser({
                account: projectViewer,
                projectUuid: 'project',
            }),
        ).resolves.toMatchObject({
            state: AiIdentityState.READY,
            action: null,
            rawSqlAllowed: true,
        });
    });
});

describe('personal AI identities', () => {
    it('returns only the caller identity with person-facing fields', async () => {
        const result = await service.getMyAiIdentities(viewer);
        expect(model.listAccounts).toHaveBeenCalledWith(organizationUuid);
        expect(model.find).toHaveBeenCalledWith({
            aiIdentityAccountUuid: account.aiIdentityAccountUuid,
            userUuid: viewer.user.id,
        });
        expect(result).toEqual([
            {
                aiIdentityAccountUuid: 'account',
                accountLabel: 'ACCOUNT',
                aiIdentityName: 'PERSON_AI',
                state: AiIdentityState.PENDING,
                lastCheckedAt: null,
                action: 'ask_admin',
                message:
                    "Your AI identity isn't set up yet. Ask an admin to set it up.",
            },
        ]);
        expect(result[0]).not.toHaveProperty('publicKey');
        expect(result[0]).not.toHaveProperty('email');
    });

    it('returns no identities or account data when the flag is off', async () => {
        flags.get.mockResolvedValueOnce({
            enabled: false,
            id: FeatureFlags.SnowflakeAiTwins,
        });
        expect(await service.getMyAiIdentities(viewer)).toEqual([]);
        expect(model.listAccounts).not.toHaveBeenCalled();
    });

    it('offers sign-in when an account has no identity for the person', async () => {
        model.find.mockResolvedValueOnce(null);
        expect(await service.getMyAiIdentities(viewer)).toEqual([
            expect.objectContaining({
                state: AiIdentityState.NEEDS_SIGN_IN,
                aiIdentityName: null,
                action: 'sign_in',
            }),
        ]);
    });

    it('returns the last check and no action for ready identities', async () => {
        const checkedAt = new Date('2026-10-05T12:00:00Z');
        model.find.mockResolvedValueOnce({
            ...identity,
            state: AiIdentityState.READY,
            checkedAt,
        });
        expect(await service.getMyAiIdentities(viewer)).toEqual([
            expect.objectContaining({
                state: AiIdentityState.READY,
                lastCheckedAt: checkedAt,
                action: null,
                message: null,
            }),
        ]);
    });
});
