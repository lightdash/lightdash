import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    AuthTokenPrefix,
    CommercialFeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    ServiceAccountScope,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { parseConfig } from '../../../config/parseConfig';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { ServiceAccountService } from './ServiceAccountService';

const ORG = 'org-1';
const DISABLED_MESSAGE =
    'Service accounts are not enabled for this organization';

const database = knex({ client: MockClient, dialect: 'pg' });

const adminUser = (): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can('manage', 'Organization', { organizationUuid: ORG });
    return {
        userUuid: 'admin-user',
        organizationUuid: ORG,
        role: OrganizationMemberRole.ADMIN,
        ability: build(),
    } as AnyType;
};

const token = (scopes: ServiceAccountScope[]) => ({
    uuid: 'sa-1',
    userUuid: 'sa-user',
    organizationUuid: ORG,
    description: 'ci',
    expiresAt: new Date(Date.now() + 86_400_000),
    rotatedAt: null,
    lastUsedAt: null,
    scopes,
    roleUuid: null,
});

const serviceAccountToken = () => token([ServiceAccountScope.ORG_ADMIN]);
const scimToken = () => token([ServiceAccountScope.SCIM_MANAGE]);

// Builds the instance config the same way the server does, from env vars.
const configFromEnv = (env: Record<string, string>) => {
    const previousEnv = process.env;
    process.env = {
        LIGHTDASH_SECRET: 'not very secret',
        S3_ENDPOINT: 'mock_endpoint',
        S3_BUCKET: 'mock_bucket',
        S3_REGION: 'mock_region',
        ...env,
    };
    try {
        const { enabledFeatureFlags, disabledFeatureFlags } = parseConfig();
        return {
            ...lightdashConfigMock,
            enabledFeatureFlags,
            disabledFeatureFlags,
        };
    } finally {
        process.env = previousEnv;
    }
};

const buildService = (lightdashConfig = lightdashConfigMock) => {
    const serviceAccountModel = {
        create: vi.fn().mockResolvedValue({
            ...serviceAccountToken(),
            token: 'ldsvc_new',
        }),
        delete: vi.fn().mockResolvedValue(undefined),
        getTokenbyUuid: vi.fn().mockResolvedValue(serviceAccountToken()),
        getAllForOrganization: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(serviceAccountToken()),
        rotate: vi.fn().mockResolvedValue({
            ...serviceAccountToken(),
            token: 'ldsvc_rotated',
        }),
        findByToken: vi.fn().mockResolvedValue(serviceAccountToken()),
        updateUsedDate: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ServiceAccountService({
        lightdashConfig,
        analytics: { track: vi.fn() } as AnyType,
        serviceAccountModel: serviceAccountModel as AnyType,
        commercialFeatureFlagModel: new CommercialFeatureFlagModel({
            database,
            lightdashConfig,
        }),
        projectModel: {
            getProjectAccessCountsByServiceAccountUserUuids: vi
                .fn()
                .mockResolvedValue(new Map()),
            getServiceAccountProjectGrants: vi.fn().mockResolvedValue([]),
        } as AnyType,
        rolesModel: {
            getOrganizationUserRoleSet: vi.fn().mockResolvedValue({
                systemRole: OrganizationMemberRole.ADMIN,
                customRoleUuids: [],
            }),
        } as AnyType,
    });
    return { service, serviceAccountModel };
};

const mockFlagRow = (
    tracker: Tracker,
    {
        defaultEnabled,
        orgOverride,
    }: { defaultEnabled: boolean | null; orgOverride?: boolean },
) => {
    tracker.on.select('feature_flags').response({
        flag_id: CommercialFeatureFlags.ServiceAccounts,
        default_enabled: defaultEnabled,
    });
    tracker.on.select('feature_flag_overrides').response(
        orgOverride === undefined
            ? undefined
            : {
                  flag_id: CommercialFeatureFlags.ServiceAccounts,
                  organization_uuid: ORG,
                  user_uuid: null,
                  enabled: orgOverride,
              },
    );
};

const futureExpiry = () => ({ expiresAt: new Date(Date.now() + 86_400_000) });
const listScopes = Object.values(ServiceAccountScope).filter(
    (scope) => scope !== ServiceAccountScope.SCIM_MANAGE,
);

describe('ServiceAccountService service-accounts flag', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe.each([
        [
            'DB organization override',
            () => {
                mockFlagRow(tracker, {
                    defaultEnabled: false,
                    orgOverride: true,
                });
                return lightdashConfigMock;
            },
        ],
        [
            'DB flag default',
            () => {
                mockFlagRow(tracker, { defaultEnabled: true });
                return lightdashConfigMock;
            },
        ],
        [
            'LIGHTDASH_ENABLE_FEATURE_FLAGS',
            () =>
                configFromEnv({
                    LIGHTDASH_ENABLE_FEATURE_FLAGS: 'service-accounts',
                }),
        ],
        [
            'legacy SERVICE_ACCOUNT_ENABLED',
            () => configFromEnv({ SERVICE_ACCOUNT_ENABLED: 'true' }),
        ],
    ])('enabled through %s', (_label, setup) => {
        it('allows every entry point', async () => {
            const { service } = buildService(setup());
            const user = adminUser();

            await expect(
                service.create({
                    user,
                    tokenDetails: {
                        organizationUuid: ORG,
                        expiresAt: null,
                        description: 'ci',
                        scopes: [ServiceAccountScope.ORG_ADMIN],
                    },
                    prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
                }),
            ).resolves.toMatchObject({ token: 'ldsvc_new' });
            await expect(service.list(user, listScopes)).resolves.toEqual([]);
            await expect(
                service.update({
                    user,
                    tokenUuid: 'sa-1',
                    update: { description: 'renamed' },
                }),
            ).resolves.toMatchObject({ uuid: 'sa-1' });
            await expect(
                service.rotate({
                    user,
                    tokenUuid: 'sa-1',
                    update: futureExpiry(),
                    prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
                }),
            ).resolves.toMatchObject({ token: 'ldsvc_rotated' });
            await expect(
                service.getProjectGrants(user, 'sa-1'),
            ).resolves.toEqual([]);
            await expect(
                service.delete({ user, tokenUuid: 'sa-1' }),
            ).resolves.toBeUndefined();
        });

        it('authenticates an existing service-account token', async () => {
            const { service } = buildService(setup());

            await expect(
                service.authenticateServiceAccount('ldsvc_token'),
            ).resolves.toMatchObject({ uuid: 'sa-1' });
        });
    });

    describe.each([
        ['no flag row', () => lightdashConfigMock],
        [
            'DB organization override off',
            () => {
                mockFlagRow(tracker, {
                    defaultEnabled: true,
                    orgOverride: false,
                });
                return lightdashConfigMock;
            },
        ],
        [
            'LIGHTDASH_DISABLE_FEATURE_FLAGS',
            () => {
                mockFlagRow(tracker, { defaultEnabled: true });
                return configFromEnv({
                    LIGHTDASH_DISABLE_FEATURE_FLAGS: 'service-accounts',
                });
            },
        ],
    ])('disabled (%s)', (_label, setup) => {
        it.each([
            [
                'create',
                (service: ServiceAccountService) =>
                    service.create({
                        user: adminUser(),
                        tokenDetails: {
                            organizationUuid: ORG,
                            expiresAt: null,
                            description: 'ci',
                            scopes: [ServiceAccountScope.ORG_ADMIN],
                        },
                        prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
                    }),
            ],
            [
                'list',
                (service: ServiceAccountService) =>
                    service.list(adminUser(), listScopes),
            ],
            [
                'update',
                (service: ServiceAccountService) =>
                    service.update({
                        user: adminUser(),
                        tokenUuid: 'sa-1',
                        update: { description: 'renamed' },
                    }),
            ],
            [
                'rotate',
                (service: ServiceAccountService) =>
                    service.rotate({
                        user: adminUser(),
                        tokenUuid: 'sa-1',
                        update: futureExpiry(),
                        prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
                    }),
            ],
            [
                'getProjectGrants',
                (service: ServiceAccountService) =>
                    service.getProjectGrants(adminUser(), 'sa-1'),
            ],
            [
                'delete',
                (service: ServiceAccountService) =>
                    service.delete({ user: adminUser(), tokenUuid: 'sa-1' }),
            ],
        ])('rejects %s', async (_method, call) => {
            const { service, serviceAccountModel } = buildService(setup());

            const result = call(service);
            await expect(result).rejects.toBeInstanceOf(ForbiddenError);
            await expect(result).rejects.toThrow(DISABLED_MESSAGE);
            expect(serviceAccountModel.create).not.toHaveBeenCalled();
            expect(serviceAccountModel.update).not.toHaveBeenCalled();
            expect(serviceAccountModel.rotate).not.toHaveBeenCalled();
            expect(serviceAccountModel.delete).not.toHaveBeenCalled();
            expect(
                serviceAccountModel.getAllForOrganization,
            ).not.toHaveBeenCalled();
        });

        it('rejects an existing service-account token', async () => {
            const { service, serviceAccountModel } = buildService(setup());

            await expect(
                service.authenticateServiceAccount('ldsvc_token'),
            ).resolves.toBeNull();
            expect(serviceAccountModel.updateUsedDate).not.toHaveBeenCalled();
        });

        it('leaves SCIM tokens alone', async () => {
            const { service, serviceAccountModel } = buildService(setup());
            serviceAccountModel.getTokenbyUuid.mockResolvedValue(scimToken());
            serviceAccountModel.findByToken.mockResolvedValue(scimToken());
            const user = adminUser();

            await expect(
                service.create({
                    user,
                    tokenDetails: {
                        organizationUuid: ORG,
                        expiresAt: null,
                        description: 'scim',
                        scopes: [ServiceAccountScope.SCIM_MANAGE],
                    },
                    prefix: AuthTokenPrefix.SCIM,
                }),
            ).resolves.toBeDefined();
            await expect(
                service.list(user, [ServiceAccountScope.SCIM_MANAGE]),
            ).resolves.toEqual([]);
            await expect(
                service.get({ user, tokenUuid: 'sa-1' }),
            ).resolves.toMatchObject({ uuid: 'sa-1' });
            await expect(
                service.rotate({
                    user,
                    tokenUuid: 'sa-1',
                    update: futureExpiry(),
                    prefix: AuthTokenPrefix.SCIM,
                }),
            ).resolves.toBeDefined();
            await expect(
                service.delete({ user, tokenUuid: 'sa-1' }),
            ).resolves.toBeUndefined();
            // The auth middleware rejects SCIM-only tokens with its own reason.
            await expect(
                service.authenticateServiceAccount('scim_token'),
            ).resolves.toMatchObject({ uuid: 'sa-1' });
        });

        it('blocks the SCIM endpoints from minting a non-SCIM token', async () => {
            const { service } = buildService(setup());

            await expect(
                service.create({
                    user: adminUser(),
                    tokenDetails: {
                        organizationUuid: ORG,
                        expiresAt: null,
                        description: 'sneaky',
                        scopes: [ServiceAccountScope.ORG_ADMIN],
                    },
                    prefix: AuthTokenPrefix.SCIM,
                }),
            ).rejects.toThrow(DISABLED_MESSAGE);
        });
    });
});
