import { CommercialFeatureFlags, ForbiddenError } from '@lightdash/common';
import { type Request } from 'express';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import { SCIM_NOT_ENABLED_MESSAGE } from '../scim/scimFeatureFlag';
import { ScimOrganizationAccessTokenController } from './scimOrganizationAccessTokenController';

const database = knex({ client: MockClient, dialect: 'pg' });

const setup = (config: Partial<LightdashConfig> = {}) => {
    const lightdashConfig: LightdashConfig = {
        ...lightdashConfigMock,
        enabledFeatureFlags: new Set<string>(),
        disabledFeatureFlags: new Set<string>(),
        previewFeatureFlags: { enabled: false },
        ...config,
    };
    const featureFlagService = new FeatureFlagService({
        lightdashConfig,
        featureFlagModel: new CommercialFeatureFlagModel({
            database,
            lightdashConfig,
        }),
    });
    const serviceAccountService = {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
        rotate: vi.fn().mockResolvedValue({}),
    };
    const controller = new ScimOrganizationAccessTokenController({
        getFeatureFlagService: () => featureFlagService,
        getServiceAccountService: () => serviceAccountService,
    } as unknown as ServiceRepository);
    const req = { account: buildAccount() } as Request;
    return { controller, serviceAccountService, req };
};

type Setup = ReturnType<typeof setup>;

const endpoints: Array<
    [
        string,
        keyof Setup['serviceAccountService'],
        (
            controller: ScimOrganizationAccessTokenController,
            req: Request,
        ) => Promise<unknown>,
    ]
> = [
    ['list', 'list', (c, req) => c.getOrganizationAccessTokens(req)],
    [
        'create',
        'create',
        (c, req) =>
            c.createOrganizationAccessToken(req, {
                description: 'idp',
                expiresAt: null,
            }),
    ],
    [
        'delete',
        'delete',
        (c, req) => c.deleteOrganizationAccessToken(req, 'token-uuid'),
    ],
    ['get', 'get', (c, req) => c.getOrganizationAccessToken('token-uuid', req)],
    [
        'rotate',
        'rotate',
        (c, req) =>
            c.rotateOrganizationAccessToken('token-uuid', req, {
                expiresAt: new Date('2030-01-01'),
            }),
    ],
];

describe('ScimOrganizationAccessTokenController SCIM flag gate', () => {
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it.each(endpoints)(
        '%s is forbidden when SCIM is not enabled for the organization',
        async (_name, method, call) => {
            tracker.on.select('feature_flags').response({
                flag_id: CommercialFeatureFlags.Scim,
                default_enabled: null,
            });
            tracker.on.select('feature_flag_overrides').response(undefined);
            const { controller, serviceAccountService, req } = setup();

            const result = call(controller, req);
            await expect(result).rejects.toThrow(ForbiddenError);
            await expect(result).rejects.toThrow(SCIM_NOT_ENABLED_MESSAGE);
            expect(serviceAccountService[method]).not.toHaveBeenCalled();
        },
    );

    it.each(endpoints)(
        '%s works when the Console enabled SCIM for the organization',
        async (_name, method, call) => {
            tracker.on.select('feature_flags').response({
                flag_id: CommercialFeatureFlags.Scim,
                default_enabled: null,
            });
            tracker.on.select('feature_flag_overrides').response({
                flag_id: CommercialFeatureFlags.Scim,
                organization_uuid: 'test-org-uuid',
                user_uuid: null,
                enabled: true,
            });
            const { controller, serviceAccountService, req } = setup();

            await call(controller, req);
            expect(serviceAccountService[method]).toHaveBeenCalledTimes(1);
        },
    );

    it.each(endpoints)(
        '%s works when SCIM is enabled through the ENV allowlist',
        async (_name, method, call) => {
            const { controller, serviceAccountService, req } = setup({
                enabledFeatureFlags: new Set([CommercialFeatureFlags.Scim]),
            });

            await call(controller, req);
            expect(serviceAccountService[method]).toHaveBeenCalledTimes(1);
            expect(tracker.history.select).toHaveLength(0);
        },
    );
});
