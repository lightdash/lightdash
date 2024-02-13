export type GitIntegrationConfiguration = {
    enabled: boolean;
};

export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
};

export type GitRepo = { name: string; fullName: string; ownerLogin: string };
