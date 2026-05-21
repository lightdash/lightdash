import {
    FeatureFlags,
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
});
