import { type OrganizationSettings } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { createAppThumbnailSettings } from './appThumbnailSettings';

const NOTHING_STORED: OrganizationSettings = {
    oidcLinkingEnabled: null,
    oidcToEmailLinkingEnabled: null,
    supportImpersonationEnabled: null,
    semanticLayerPgwireEnabled: null,
    inviteLinkExpirationDays: null,
    scheduledDeliveryExpirationSeconds: null,
    scheduledDeliveryExpirationSecondsEmail: null,
    scheduledDeliveryExpirationSecondsSlack: null,
    scheduledDeliveryExpirationSecondsMsTeams: null,
    scheduledDeliveryExpirationSecondsGoogleChat: null,
    queryLimit: null,
    csvCellsLimit: null,
    corsAllowedDomains: null,
    dataAppAutomaticThumbnailsEnabled: null,
};

/** An organization settings store holding one org's stored choice. */
const settingsFor = (stored: Record<string, boolean>) =>
    createAppThumbnailSettings({
        lightdashConfig: lightdashConfigMock,
        organizationSettingsModel: {
            get: async (organizationUuid) => ({
                ...NOTHING_STORED,
                dataAppAutomaticThumbnailsEnabled:
                    stored[organizationUuid] ?? null,
            }),
        },
    });

describe('createAppThumbnailSettings', () => {
    it('is on for an organization that has never changed the setting', async () => {
        const settings = settingsFor({});

        expect(await settings.isAutomaticCaptureEnabled('org-1')).toBe(true);
    });

    it('is off only for the organization that turned it off', async () => {
        const settings = settingsFor({ 'org-1': false, 'org-2': true });

        expect(await settings.isAutomaticCaptureEnabled('org-1')).toBe(false);
        expect(await settings.isAutomaticCaptureEnabled('org-2')).toBe(true);
        expect(await settings.isAutomaticCaptureEnabled('org-3')).toBe(true);
    });
});
