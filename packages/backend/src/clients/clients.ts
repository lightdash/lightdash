import { lightdashConfig } from '../config/lightdashConfig';
import { schedulerModel, slackAuthenticationModel } from '../models/models';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import DbtCloudGraphqlClient from './dbtCloud/DbtCloudGraphqlClient';
import EmailClient from './EmailClient/EmailClient';
import { GoogleDriveClient } from './Google/GoogleDriveClient';
import { SlackClient } from './Slack/SlackClient';

export const slackClient = new SlackClient({
    slackAuthenticationModel,
    lightdashConfig,
});

export const schedulerClient = new SchedulerClient({
    lightdashConfig,
    schedulerModel,
});

export const emailClient = new EmailClient({
    lightdashConfig,
});

export const googleDriveClient = new GoogleDriveClient();

export const dbtCloudGraphqlClient = new DbtCloudGraphqlClient();
