export type GitIntegrationConfiguration = {
    enabled: boolean;
};

export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
};
