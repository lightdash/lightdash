import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { lightdashConfig } from '../config/lightdashConfig';
import { OperationContext, ServiceRepository } from './ServiceRepository';

const analytics = new LightdashAnalytics({
    lightdashConfig,
    writeKey: lightdashConfig.rudder.writeKey || 'notrack',
    dataPlaneUrl: lightdashConfig.rudder.dataPlaneUrl
        ? `${lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
        : 'notrack',
    options: {
        enable:
            lightdashConfig.rudder.writeKey &&
            lightdashConfig.rudder.dataPlaneUrl,
    },
});

/**
 * See ./ServiceRepository for how this will work.
 *
 * @deprecated Avoid using this singleton instance, it will not be here for long.
 */
export const serviceRepository = new ServiceRepository({
    context: new OperationContext({
        // Placeholder, this will at some point be a request or worker ID
        operationId: 'services',
        lightdashAnalytics: analytics,
        lightdashConfig,
    }),
});
