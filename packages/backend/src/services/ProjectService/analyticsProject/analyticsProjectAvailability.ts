import type { LightdashConfig } from '../../../config/parseConfig';
import type { LicenseService } from '../../LicenseService/LicenseService';

/** Instance availability; organization and project authorization remain separate. */
export const isAnalyticsProjectAvailable = (
    config: Pick<LightdashConfig, 'analyticsProject' | 'usageEvents'>,
    licenseService: Pick<LicenseService, 'getLicenseStatus'>,
): boolean =>
    !config.analyticsProject.disabled &&
    config.usageEvents.s3 !== null &&
    licenseService.getLicenseStatus().valid;
