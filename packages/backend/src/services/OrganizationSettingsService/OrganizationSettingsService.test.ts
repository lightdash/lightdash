import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    type PossibleAbilities,
    type RegisteredAccount,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
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

const buildService = () => {
    const organizationSettingsModel = {
        get: vi.fn(async () => rawSettings),
        update: vi.fn(async () => rawSettings),
    } as unknown as OrganizationSettingsModel;

    const service = new OrganizationSettingsService({
        lightdashConfig: lightdashConfigMock,
        organizationSettingsModel,
    });
    return { service, organizationSettingsModel };
};

describe('OrganizationSettingsService — updates', () => {
    it('allows a csvCellsLimit update', async () => {
        const { service, organizationSettingsModel } = buildService();
        await service.updateOrganizationSettings(account, {
            csvCellsLimit: 50,
        });
        expect(organizationSettingsModel.update).toHaveBeenCalled();
    });

    it('allows a queryLimit update', async () => {
        const { service, organizationSettingsModel } = buildService();
        await service.updateOrganizationSettings(account, { queryLimit: 50 });
        expect(organizationSettingsModel.update).toHaveBeenCalled();
    });

    it('allows a non-limit update (scheduled delivery)', async () => {
        const { service, organizationSettingsModel } = buildService();
        await service.updateOrganizationSettings(account, {
            scheduledDeliveryExpirationSeconds: 3600,
        });
        expect(organizationSettingsModel.update).toHaveBeenCalled();
    });

    it('allows an invite link expiration from one to seven whole days', async () => {
        const { service, organizationSettingsModel } = buildService();
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
            const { service, organizationSettingsModel } = buildService();
            await expect(
                service.updateOrganizationSettings(account, {
                    inviteLinkExpirationDays:
                        inviteLinkExpirationDays as number,
                }),
            ).rejects.toThrow(ParameterError);
            expect(organizationSettingsModel.update).not.toHaveBeenCalled();
        },
    );

    it('allows valid CORS settings', async () => {
        const { service, organizationSettingsModel } = buildService();
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
        const { service, organizationSettingsModel } = buildService();
        await expect(
            service.updateOrganizationSettings(account, {
                corsAllowedDomains: ['/unterminated[/'],
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('rejects broad CORS regex patterns', async () => {
        const { service, organizationSettingsModel } = buildService();
        await expect(
            service.updateOrganizationSettings(account, {
                corsAllowedDomains: ['/^https?:\\/\\/.*$/'],
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });

    it('rejects invalid CORS origins', async () => {
        const { service, organizationSettingsModel } = buildService();
        await expect(
            service.updateOrganizationSettings(account, {
                corsAllowedDomains: ['https://app.example.com/path'],
            }),
        ).rejects.toThrow(ParameterError);
        expect(organizationSettingsModel.update).not.toHaveBeenCalled();
    });
});

describe('OrganizationSettingsService — automatic data app thumbnails', () => {
    const member = {
        ...account,
        user: {
            ...account.user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Organization', action: 'view' },
            ]),
        },
    } as unknown as RegisteredAccount;

    // A store that keeps what was written, so reads reflect earlier updates.
    const buildStatefulService = () => {
        let stored: UpdateOrganizationSettings = {};
        const organizationSettingsModel = {
            get: async () => stored,
            update: async (
                _orgUuid: string,
                patch: UpdateOrganizationSettings,
            ) => {
                stored = { ...stored, ...patch };
                return stored;
            },
        } as unknown as OrganizationSettingsModel;
        return new OrganizationSettingsService({
            lightdashConfig: lightdashConfigMock,
            organizationSettingsModel,
        });
    };

    it('is on for an organization that has never changed it', async () => {
        const service = buildStatefulService();

        const settings = await service.getOrganizationSettings(account);

        expect(settings.dataAppAutomaticThumbnailsEnabled).toBe(true);
    });

    it('lets an organization manager turn it off and back on', async () => {
        const service = buildStatefulService();

        await service.updateOrganizationSettings(account, {
            dataAppAutomaticThumbnailsEnabled: false,
        });
        expect(
            (await service.getOrganizationSettings(account))
                .dataAppAutomaticThumbnailsEnabled,
        ).toBe(false);

        await service.updateOrganizationSettings(account, {
            dataAppAutomaticThumbnailsEnabled: true,
        });
        expect(
            (await service.getOrganizationSettings(account))
                .dataAppAutomaticThumbnailsEnabled,
        ).toBe(true);
    });

    it('refuses a change from a user who cannot manage the organization', async () => {
        const service = buildStatefulService();

        await expect(
            service.updateOrganizationSettings(member, {
                dataAppAutomaticThumbnailsEnabled: false,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(
            (await service.getOrganizationSettings(account))
                .dataAppAutomaticThumbnailsEnabled,
        ).toBe(true);
    });
});

describe('OrganizationSettingsService — data app captures', () => {
    const buildStatefulService = (capturesEnabledOnInstance = true) => {
        let stored: UpdateOrganizationSettings = {};
        const organizationSettingsModel = {
            get: async () => stored,
            update: async (
                _orgUuid: string,
                patch: UpdateOrganizationSettings,
            ) => {
                stored = { ...stored, ...patch };
                return stored;
            },
        } as unknown as OrganizationSettingsModel;
        return new OrganizationSettingsService({
            lightdashConfig: {
                ...lightdashConfigMock,
                appRuntime: {
                    ...lightdashConfigMock.appRuntime,
                    capturesEnabled: capturesEnabledOnInstance,
                },
            },
            organizationSettingsModel,
        });
    };

    it('is on for an organization that has never changed it', async () => {
        const settings =
            await buildStatefulService().getOrganizationSettings(account);

        expect(settings.dataAppCapturesEnabled).toBe(true);
    });

    it('turns automatic thumbnails off with it, and restores them when turned back on', async () => {
        const service = buildStatefulService();

        await service.updateOrganizationSettings(account, {
            dataAppCapturesEnabled: false,
        });
        let settings = await service.getOrganizationSettings(account);
        expect(settings.dataAppCapturesEnabled).toBe(false);
        expect(settings.dataAppAutomaticThumbnailsEnabled).toBe(false);

        await service.updateOrganizationSettings(account, {
            dataAppCapturesEnabled: true,
        });
        settings = await service.getOrganizationSettings(account);
        expect(settings.dataAppCapturesEnabled).toBe(true);
        expect(settings.dataAppAutomaticThumbnailsEnabled).toBe(true);
    });

    it('stays off when the instance env turns captures off, whatever the org sets', async () => {
        const service = buildStatefulService(false);

        await service.updateOrganizationSettings(account, {
            dataAppCapturesEnabled: true,
            dataAppAutomaticThumbnailsEnabled: true,
        });
        const settings = await service.getOrganizationSettings(account);

        expect(settings.dataAppCapturesEnabled).toBe(false);
        expect(settings.dataAppAutomaticThumbnailsEnabled).toBe(false);
    });
});
