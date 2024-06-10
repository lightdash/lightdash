export type SlackChannel = {
    id: string;
    name: string;
};

export type ApiSlackChannelsResponse = {
    status: 'ok';
    results: SlackChannel[];
};

export type ApiSlackNotificationChannelResponse = {
    status: 'ok';
    results: void;
};

export type SlackAppCustomSettings = {
    notificationChannel: string | null;
    appProfilePhotoUrl: string | null;
};
