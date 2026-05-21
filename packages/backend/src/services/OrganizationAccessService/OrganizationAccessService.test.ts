import {
    FeatureFlags,
    ForbiddenError,
    OrganizationAccessStatus,
    type Account,
} from '@lightdash/common';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { OrganizationAccessService } from './OrganizationAccessService';

const account = {
    organization: {
        organizationUuid: 'org-uuid',
        name: 'Acme',
    },
    user: {
        id: 'user-uuid',
    },
    authentication: {
        type: 'session',
    },
} as Account;

const apiAccount = {
    ...account,
    authentication: {
        type: 'pat',
    },
} as Account;

const buildService = (enabledFlags: Set<string>) => {
    const featureFlagService = {
        get: jest.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: enabledFlags.has(featureFlagId),
        })),
    } as unknown as FeatureFlagService;

    return new OrganizationAccessService({
        featureFlagService,
        cacheTtlMs: 0,
    });
};

describe('OrganizationAccessService', () => {
    it('returns active when no trial flags are enabled', async () => {
        const service = buildService(new Set());

        await expect(service.getOrganizationAccess(account)).resolves.toEqual({
            status: OrganizationAccessStatus.ACTIVE,
        });
    });

    it('returns trial warning when the warning flag is enabled', async () => {
        const service = buildService(
            new Set([FeatureFlags.OrganizationTrialWarning]),
        );

        const access = await service.getOrganizationAccess(account);

        expect(access.status).toBe(OrganizationAccessStatus.TRIAL_WARNING);
    });

    it('gives blocked precedence over warning', async () => {
        const service = buildService(
            new Set([
                FeatureFlags.OrganizationTrialWarning,
                FeatureFlags.OrganizationTrialBlocked,
            ]),
        );

        const access = await service.getOrganizationAccess(account);

        expect(access.status).toBe(OrganizationAccessStatus.TRIAL_BLOCKED);
    });

    it('blocks query access for trial-blocked orgs', async () => {
        const service = buildService(
            new Set([FeatureFlags.OrganizationTrialBlocked]),
        );

        await expect(service.assertQueryAccess(account)).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('allows API/CLI query access during grace period', async () => {
        const service = buildService(
            new Set([FeatureFlags.OrganizationTrialBlocked]),
        );

        await expect(service.assertQueryAccess(apiAccount)).resolves.toEqual(
            expect.objectContaining({
                status: OrganizationAccessStatus.TRIAL_BLOCKED,
            }),
        );
    });

    it('blocks API/CLI query access after grace period flag is enabled', async () => {
        const service = buildService(
            new Set([
                FeatureFlags.OrganizationTrialBlocked,
                FeatureFlags.OrganizationTrialApiCliBlocked,
            ]),
        );

        await expect(service.assertQueryAccess(apiAccount)).rejects.toThrow(
            ForbiddenError,
        );
    });
});
