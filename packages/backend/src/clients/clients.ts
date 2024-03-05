import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { lightdashConfig } from '../config/lightdashConfig';
import { schedulerModel, slackAuthenticationModel } from '../models/models';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import { S3Client } from './Aws/s3';
import { S3CacheClient } from './Aws/S3CacheClient';
import DbtCloudGraphqlClient from './dbtCloud/DbtCloudGraphqlClient';
import EmailClient from './EmailClient/EmailClient';
import { GoogleDriveClient } from './Google/GoogleDriveClient';
import { SlackClient } from './Slack/SlackClient';

// TODO: to be removed once this is inside App class. https://github.com/lightdash/lightdash/issues/9099
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

export const slackClient = new SlackClient({
    slackAuthenticationModel,
    lightdashConfig,
});

export const schedulerClient = new SchedulerClient({
    lightdashConfig,
    analytics,
    schedulerModel,
});

export const emailClient = new EmailClient({
    lightdashConfig,
});

export const googleDriveClient = new GoogleDriveClient({
    lightdashConfig,
});

export const dbtCloudGraphqlClient = new DbtCloudGraphqlClient();

export const s3Client = new S3Client({
    lightdashConfig,
});

export const s3CacheClient = new S3CacheClient({
    lightdashConfig,
});
