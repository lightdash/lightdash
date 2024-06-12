export type SlackChannel = {
    id: string;
    name: string;
};

export type ApiSlackChannelsResponse = {
    status: 'ok';
    results: SlackChannel[];
};

export type ApiSlackCustomSettingsResponse = {
    status: 'ok';
    results: void;
};

export type SlackChannelProjectMapping = {
    projectUuid: string;
    slackChannelId: string;
};

export type SlackAppCustomSettings = {
    notificationChannel: string | null;
    appProfilePhotoUrl: string | null;
    slackChannelProjectMappings?: SlackChannelProjectMapping[];
};
