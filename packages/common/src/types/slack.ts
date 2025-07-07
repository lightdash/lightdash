import { type ApiSuccess, type ApiSuccessEmpty } from './api/success';
import { type SlackSettings } from './slackSettings';

export type SlackChannel = {
    id: string;
    name: string;
};

export type ApiSlackChannelsResponse = ApiSuccess<SlackChannel[] | undefined>;

export type ApiSlackCustomSettingsResponse = ApiSuccessEmpty;

export type SlackChannelProjectMapping = {
    projectUuid: string;
    slackChannelId: string;
    availableTags: string[] | null;
};

export type SlackAppCustomSettings = {
    notificationChannel: string | null;
    appProfilePhotoUrl: string | null;
    slackChannelProjectMappings?: SlackChannelProjectMapping[];
    aiThreadAccessConsent?: boolean;
};

export type ApiSlackGetInstallationResponse = ApiSuccess<
    SlackSettings | undefined
>;
