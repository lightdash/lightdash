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
