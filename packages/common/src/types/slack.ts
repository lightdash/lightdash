export type SlackChannel = {
    id: string;
    label: string;
};

export type ApiSlackChannelsResponse = {
    status: 'ok';
    results: SlackChannel[];
};
