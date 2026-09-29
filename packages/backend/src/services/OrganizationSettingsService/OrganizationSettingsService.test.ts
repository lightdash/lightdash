import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    type PossibleAbilities,
    type RegisteredAccount,
    type UpdateOrganizationSettings,
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

const chartBuilderAccount = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'OrganizationChartType', action: 'view' },
        ]),
    },
} as RegisteredAccount;

const chartAdminAccount = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'manage' },
            { subject: 'OrganizationChartType', action: 'manage' },
        ]),
    },
} as RegisteredAccount;

// Raw row with no overrides — the resolver fills the rest with instance defaults.
const rawSettings = {
    queryLimit: null,
    csvCellsLimit: null,
    oidcLinkingEnabled: true,
};

const buildService = (
    proLimitsEnabled: boolean,
    organizationChartTypesEnabled = false,
) => {
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled:
                (proLimitsEnabled &&
                    featureFlagId === FeatureFlags.ProLimits) ||
                (organizationChartTypesEnabled &&
                    featureFlagId === FeatureFlags.OrganizationChartTypes),
        })),
    } as unknown as FeatureFlagModel;

    const organizationSettingsModel = {
        get: vi.fn(async () => rawSettings),
        update: vi.fn(async (_organizationUuid: string, patch: object) => ({
            ...rawSettings,
            ...patch,
        })),
    } as unknown as OrganizationSettingsModel;

    const service = new OrganizationSettingsService({
        lightdashConfig: lightdashConfigMock,
        organizationSettingsModel,
        featureFlagModel,
    });
    return { service, organizationSettingsModel, featureFlagModel };
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

    it('allows an invite link expiration from one to seven whole days', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await service.updateOrganizationSettings(account, {
            inviteLinkExpirationDays: 7,
        });
        expect(organizationSettingsModel.update).toHaveBeenCalledWith(
            'org-uuid',
            { inviteLinkExpirationDays: 7 },
        );
    });

    it.each([0, 1.5, 8, '7'])(
        'rejects invalid invite link expiration %s',
        async (inviteLinkExpirationDays) => {
            const { service, organizationSettingsModel } = buildService(false);
            await expect(
                service.updateOrganizationSettings(account, {
                    inviteLinkExpirationDays:
                        inviteLinkExpirationDays as number,
                }),
            ).rejects.toThrow(ParameterError);
            expect(organizationSettingsModel.update).not.toHaveBeenCalled();
        },
    );

    it('allows a limit update when pro-limits is enabled', async () => {
        const { service, organizationSettingsModel } = buildService(true);
        await service.updateOrganizationSettings(account, {
            csvCellsLimit: 50,
        });
        expect(organizationSettingsModel.update).toHaveBeenCalled();
    });

    it('allows valid CORS settings when pro-limits is disabled', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await service.updateOrganizationSettings(account, {
            corsAllowedDomains: [
                'https://app.example.com',
                '/^https:\\/\\/.*\\.example\\.com$/',
            ],
        });
        expect(organizationSettingsModel.update).toHaveBeenCalledWith(
            'org-uuid',
            {
                corsAllowedDomains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            },
        );
    });

    it('rejects invalid CORS regex patterns', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await expect(
            service.updateOrganizationSettings(account, {
                corsAllowedDomains: ['/unterminated[/'],
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('rejects broad CORS regex patterns', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await expect(
            service.updateOrganizationSettings(account, {
                corsAllowedDomains: ['/^https?:\\/\\/.*$/'],
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('rejects invalid CORS origins', async () => {
        const { service, organizationSettingsModel } = buildService(false);
        await expect(
            service.updateOrganizationSettings(account, {
                corsAllowedDomains: ['https://app.example.com/path'],
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });
});

describe('OrganizationSettingsService — organization chart types', () => {
    it('rejects reads and updates while the feature flag is off', async () => {
        const { service, organizationSettingsModel, featureFlagModel } =
            buildService(false, false);
        await expect(
            service.getOrganizationChartTypesSetting(chartAdminAccount),
        ).rejects.toThrow(
            'Organization chart types are not enabled for this organization.',
        );
        await expect(
            service.updateOrganizationChartTypesSetting(chartAdminAccount, {
                enabled: true,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            user: { userUuid: 'user-uuid', organizationUuid: 'org-uuid' },
            featureFlagId: FeatureFlags.OrganizationChartTypes,
        });
        expect(organizationSettingsModel.get).not.toHaveBeenCalled();
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('returns only the resolved enablement to chart builders', async () => {
        const { service, organizationSettingsModel } = buildService(
            false,
            true,
        );
        await expect(
            service.getOrganizationChartTypesSetting(chartBuilderAccount),
        ).resolves.toEqual({ enabled: false });
        expect(organizationSettingsModel.get).toHaveBeenCalledWith('org-uuid');
    });

    it('denies the dedicated read without view permission', async () => {
        const { service } = buildService(false, true);
        await expect(
            service.getOrganizationChartTypesSetting(account),
        ).rejects.toThrow(ForbiddenError);
    });

    it('denies a non-admin update', async () => {
        const { service, organizationSettingsModel } = buildService(
            false,
            true,
        );
        await expect(
            service.updateOrganizationChartTypesSetting(chartBuilderAccount, {
                enabled: true,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('allows an admin to update the dedicated setting', async () => {
        const { service, organizationSettingsModel } = buildService(
            false,
            true,
        );
        await expect(
            service.updateOrganizationChartTypesSetting(chartAdminAccount, {
                enabled: true,
            }),
        ).resolves.toEqual({ enabled: true });
        expect(organizationSettingsModel.update).toHaveBeenCalledWith(
            'org-uuid',
            { organizationChartTypesEnabled: true },
        );
    });

    it('rejects the setting on the generic settings route', async () => {
        const { service, organizationSettingsModel } = buildService(
            false,
            true,
        );
        await expect(
            service.updateOrganizationSettings(chartAdminAccount, {
                organizationChartTypesEnabled: true,
            } as UpdateOrganizationSettings),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean dedicated chart types patch', async () => {
        const { service, organizationSettingsModel } = buildService(
            false,
            true,
        );
        await expect(
            service.updateOrganizationChartTypesSetting(chartAdminAccount, {
                enabled: 'yes' as unknown as boolean,
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });
});
