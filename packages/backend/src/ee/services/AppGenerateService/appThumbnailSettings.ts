import { resolveEffectiveOrganizationSettings } from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type OrganizationSettingsModel } from '../../../models/OrganizationSettingsModel';
import { getOrganizationSettingsInstanceDefaults } from '../../../services/OrganizationSettingsService/getInstanceDefaults';
import { type AppThumbnailSettings } from './appThumbnails';

/** Reads the organization setting that turns automatic thumbnail capture off. */
export const createAppThumbnailSettings = ({
    organizationSettingsModel,
    lightdashConfig,
}: {
    organizationSettingsModel: Pick<OrganizationSettingsModel, 'get'>;
    lightdashConfig: LightdashConfig;
}): AppThumbnailSettings => ({
    isAutomaticCaptureEnabled: async (organizationUuid) => {
        const settings = resolveEffectiveOrganizationSettings(
            await organizationSettingsModel.get(organizationUuid),
            getOrganizationSettingsInstanceDefaults(lightdashConfig),
        );
        return settings.dataAppAutomaticThumbnailsEnabled !== false;
    },
});
