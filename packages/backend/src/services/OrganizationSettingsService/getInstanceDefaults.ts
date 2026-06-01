import { type OrganizationSettingsInstanceDefaults } from '@lightdash/common';
import { type LightdashConfig } from '../../config/parseConfig';

/**
 * Builds the instance-wide fallback values that `resolveEffectiveOrganizationSettings`
 * uses when an org hasn't overridden a setting. Centralises the env → setting
 * mapping in one place so every caller (the settings API, the login flow, the
 * scheduler) resolves the same defaults.
 */
export const getOrganizationSettingsInstanceDefaults = (
    lightdashConfig: LightdashConfig,
): OrganizationSettingsInstanceDefaults => ({
    enableOidcLinking: lightdashConfig.auth.enableOidcLinking,
    enableOidcToEmailLinking: lightdashConfig.auth.enableOidcToEmailLinking,
    scheduledDeliveryExpirationSeconds:
        lightdashConfig.persistentDownloadUrls.expirationSeconds,
    queryLimit: lightdashConfig.query.maxLimit,
    csvCellsLimit: lightdashConfig.query.csvCellsLimit,
});
