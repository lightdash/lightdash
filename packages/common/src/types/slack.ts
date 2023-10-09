export type SlackChannel = {
    id: string;
    name: string;
};

export type ApiSlackChannelsResponse = {
    status: 'ok';
    results: SlackChannel[];
};
