import { lightdashConfig } from '../config/lightdashConfig';
import { slackAuthenticationModel } from '../models/models';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import EmailClient from './EmailClient/EmailClient';
import { SlackClient } from './Slack/SlackClient';

export const slackClient = new SlackClient({
    slackAuthenticationModel,
    lightdashConfig,
});

export const schedulerClient = new SchedulerClient({
    lightdashConfig,
});

export const emailClient = new EmailClient({
    lightdashConfig,
});
