import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    PossibleAbilities,
    type CreateExternalConnection,
    type SessionAccount,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import { ExternalConnectionService } from './ExternalConnectionService';

const PROJECT_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_UUID = 'aaaaaaaa-0000-0000-0000-000000000002';
const USER_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_UUID = 'aaaaaaaa-0000-0000-0000-000000000003';

const mockAccount: SessionAccount = {
    organization: {
        organizationUuid: ORG_UUID,
        name: 'Test Org',
        createdAt: new Date(),
    },
    authentication: {
        type: 'session',
        source: 'mock-session',
    },
    user: {
        type: 'registered',
        id: USER_UUID,
        userUuid: USER_UUID,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        timezone: null,
        isSetupComplete: true,
        userId: 1,
        role: OrganizationMemberRole.ADMIN,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        abilityRules: [],
        ability: new Ability<PossibleAbilities>([
            {
                subject: 'ExternalConnection',
                action: ['manage'],
            },
            {
                subject: 'DataApp',
                action: ['manage'],
            },
        ]),
    },
    isAuthenticated: jest.fn().mockReturnValue(true),
    isRegisteredUser: jest.fn().mockReturnValue(true),
    isAnonymousUser: jest.fn().mockReturnValue(false),
    isSessionUser: jest.fn().mockReturnValue(true),
    isJwtUser: jest.fn().mockReturnValue(false),
    isServiceAccount: jest.fn().mockReturnValue(false),
    isPatUser: jest.fn().mockReturnValue(false),
    isOauthUser: jest.fn().mockReturnValue(false),
};

const makeFeatureFlagModel = (enabled: boolean) =>
    ({
        get: jest.fn().mockResolvedValue({ enabled }),
    }) as unknown as FeatureFlagModel;

const makeExternalConnectionModel = () =>
    ({
        create: jest.fn(),
        list: jest.fn().mockResolvedValue([]),
        getProjectOrganizationUuid: jest.fn().mockResolvedValue(ORG_UUID),
        findByUuid: jest.fn(),
        update: jest.fn(),
        softDelete: jest.fn(),
        rotateSecret: jest.fn(),
        findApp: jest.fn(),
        listAppLinks: jest.fn(),
        linkToApp: jest.fn(),
        unlinkFromApp: jest.fn(),
    }) as unknown as ExternalConnectionModel;

const makeSpacePermissionService = () =>
    ({
        getSpaceAccessContext: jest.fn(),
    }) as unknown as SpacePermissionService;

const makeAnalytics = () =>
    ({
        track: jest.fn(),
    }) as unknown as LightdashAnalytics;

const makeAppModel = () =>
    ({
        getApp: jest.fn(),
    }) as unknown as import('../../../models/AppModel').AppModel;

const buildService = (enabled: boolean) => {
    const featureFlagModel = makeFeatureFlagModel(enabled);
    const externalConnectionModel = makeExternalConnectionModel();
    const spacePermissionService = makeSpacePermissionService();
    const analytics = makeAnalytics();
    const appModel = makeAppModel();
    const service = new ExternalConnectionService({
        analytics,
        externalConnectionModel,
        featureFlagModel,
        appModel,
        spacePermissionService,
    });
    return { service, featureFlagModel, externalConnectionModel };
};

const minimalCreate: CreateExternalConnection = {
    name: 'Test Connection',
    type: 'bearer_token',
    origin: 'https://api.example.com',
    allowedPathPrefixes: ['/v1/'],
    allowedMethods: ['GET'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1048576,
    requestMaxBytes: 262144,
    timeoutMs: 10000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    secret: 'tok_secret',
};

describe('ExternalConnectionService feature flag gate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('flag OFF — all public methods reject with ForbiddenError', () => {
        it('create rejects with ForbiddenError and does not call the model', async () => {
            const { service, externalConnectionModel } = buildService(false);

            await expect(
                service.create(mockAccount, PROJECT_UUID, minimalCreate),
            ).rejects.toThrow(ForbiddenError);

            expect(externalConnectionModel.create).not.toHaveBeenCalled();
        });

        it('list rejects with ForbiddenError and does not call the model', async () => {
            const { service, externalConnectionModel } = buildService(false);

            await expect(
                service.list(mockAccount, PROJECT_UUID),
            ).rejects.toThrow(ForbiddenError);

            expect(externalConnectionModel.list).not.toHaveBeenCalled();
        });

        it('linkToApp rejects with ForbiddenError and does not call the model', async () => {
            const { service, externalConnectionModel } = buildService(false);

            await expect(
                service.linkToApp(
                    mockAccount,
                    PROJECT_UUID,
                    APP_UUID,
                    'conn-uuid',
                    'my-alias',
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(externalConnectionModel.findApp).not.toHaveBeenCalled();
            expect(externalConnectionModel.linkToApp).not.toHaveBeenCalled();
        });

        it('featureFlagModel.get is called with correct args when flag is OFF', async () => {
            const { service, featureFlagModel } = buildService(false);

            await expect(
                service.list(mockAccount, PROJECT_UUID),
            ).rejects.toThrow(ForbiddenError);

            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: {
                    userUuid: USER_UUID,
                    organizationUuid: ORG_UUID,
                    organizationName: 'Test Org',
                },
                featureFlagId: FeatureFlags.EnableDataAppExternalAccess,
            });
        });
    });

    describe('flag ON — list proceeds past the guard', () => {
        it('list resolves when the flag is enabled', async () => {
            const { service, externalConnectionModel } = buildService(true);

            const result = await service.list(mockAccount, PROJECT_UUID);

            expect(result).toEqual([]);
            expect(externalConnectionModel.list).toHaveBeenCalledWith(
                PROJECT_UUID,
                ORG_UUID,
            );
        });
    });
});

describe('ExternalConnectionService — org is derived from the project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('create rejects with NotFoundError when the project has no org', async () => {
        const { service, externalConnectionModel } = buildService(true);
        (
            externalConnectionModel.getProjectOrganizationUuid as jest.Mock
        ).mockResolvedValue(null);

        await expect(
            service.create(mockAccount, PROJECT_UUID, minimalCreate),
        ).rejects.toThrow(NotFoundError);

        expect(externalConnectionModel.create).not.toHaveBeenCalled();
    });

    it('list derives the org from the project and filters by it', async () => {
        const { service, externalConnectionModel } = buildService(true);

        await service.list(mockAccount, PROJECT_UUID);

        expect(
            externalConnectionModel.getProjectOrganizationUuid,
        ).toHaveBeenCalledWith(PROJECT_UUID);
        expect(externalConnectionModel.list).toHaveBeenCalledWith(
            PROJECT_UUID,
            ORG_UUID,
        );
    });
});

describe('ExternalConnectionService — cross-project link is rejected', () => {
    const OTHER_PROJECT_UUID = 'bbbbbbbb-0000-0000-0000-000000000099';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('linkToApp rejects when the connection belongs to a different project', async () => {
        const { service, externalConnectionModel } = buildService(true);
        (externalConnectionModel.findApp as jest.Mock).mockResolvedValue({
            app_id: APP_UUID,
            project_uuid: PROJECT_UUID,
            space_uuid: null,
            created_by_user_uuid: USER_UUID,
            organization_uuid: ORG_UUID,
        });
        // Connection lives in another project → getOwnedConnection must reject.
        (externalConnectionModel.findByUuid as jest.Mock).mockResolvedValue({
            externalConnectionUuid: 'conn-uuid',
            projectUuid: OTHER_PROJECT_UUID,
            organizationUuid: ORG_UUID,
        });

        await expect(
            service.linkToApp(
                mockAccount,
                PROJECT_UUID,
                APP_UUID,
                'conn-uuid',
                'my-alias',
            ),
        ).rejects.toThrow(NotFoundError);

        expect(externalConnectionModel.linkToApp).not.toHaveBeenCalled();
    });
});
