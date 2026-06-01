import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    type PossibleAbilities,
    type RegisteredAccount,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { OrganizationSettingsService } from './OrganizationSettingsService';

const account = {
    organization: { organizationUuid: 'org-uuid', name: 'Acme' },
    user: {
        id: 'user-uuid',
        userUuid: 'user-uuid',
        ability: new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'manage' },
        ]),
    },
    authentication: { type: 'session' },
    isAnonymousUser: () => false,
    isServiceAccount: () => false,
} as unknown as RegisteredAccount;

// Raw row with no overrides — the resolver fills the rest with instance defaults.
const rawSettings = { queryLimit: null, csvCellsLimit: null };

const buildService = (proLimitsEnabled: boolean) => {
    const featureFlagModel = {
        get: jest.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled:
                proLimitsEnabled && featureFlagId === FeatureFlags.ProLimits,
        })),
    } as unknown as FeatureFlagModel;

    const organizationSettingsModel = {
        get: jest.fn(async () => rawSettings),
        update: jest.fn(async () => rawSettings),
    } as unknown as OrganizationSettingsModel;

    const service = new OrganizationSettingsService({
        lightdashConfig: lightdashConfigMock,
        organizationSettingsModel,
        featureFlagModel,
    });
    return { service, organizationSettingsModel };
};

describe('OrganizationSettingsService — pro-limits gate', () => {
    it('rejects a csvCellsLimit update when pro-limits is disabled', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await expect(
            service.updateOrganizationSettings(account, { csvCellsLimit: 50 }),
        ).rejects.toThrow(ForbiddenError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('rejects a queryLimit update when pro-limits is disabled', async () => {
        const { service } = buildService(false);
        await expect(
            service.updateOrganizationSettings(account, { queryLimit: 50 }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('allows a non-limit update (scheduled delivery) when pro-limits is disabled', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await service.updateOrganizationSettings(account, {
            scheduledDeliveryExpirationSeconds: 3600,
        });
        expect(organizationSettingsModel.update).toHaveBeenCalled();
    });

    it('allows a limit update when pro-limits is enabled', async () => {
        const { service, organizationSettingsModel } = buildService(true);
        await service.updateOrganizationSettings(account, {
            csvCellsLimit: 50,
        });
        expect(organizationSettingsModel.update).toHaveBeenCalled();
    });
});
