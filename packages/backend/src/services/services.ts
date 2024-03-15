import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { S3Client } from '../clients/Aws/s3';
import { S3CacheClient } from '../clients/Aws/S3CacheClient';
import DbtCloudGraphqlClient from '../clients/dbtCloud/DbtCloudGraphqlClient';
import EmailClient from '../clients/EmailClient/EmailClient';
import { GoogleDriveClient } from '../clients/Google/GoogleDriveClient';
import { SlackClient } from '../clients/Slack/SlackClient';
import { lightdashConfig } from '../config/lightdashConfig';
import { schedulerModel, slackAuthenticationModel } from '../models/models';
import { SchedulerClient } from '../scheduler/SchedulerClient';
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
    clients: {
        dbtCloudGraphqlClient: new DbtCloudGraphqlClient(),
        emailClient: new EmailClient({
            lightdashConfig,
        }),
        googleDriveClient: new GoogleDriveClient({
            lightdashConfig,
        }),
        s3CacheClient: new S3CacheClient({
            lightdashConfig,
        }),
        s3Client: new S3Client({
            lightdashConfig,
        }),
        schedulerClient: new SchedulerClient({
            lightdashConfig,
            analytics,
            schedulerModel,
        }),
        slackClient: new SlackClient({
            slackAuthenticationModel,
            lightdashConfig,
        }),
    },
});
