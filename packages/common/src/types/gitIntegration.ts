export type GitIntegrationConfiguration = {
    enabled: boolean;
    installationId?: string;
};

export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
};

export type GitRepo = { name: string; fullName: string; ownerLogin: string };
