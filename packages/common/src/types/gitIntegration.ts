export type GitIntegrationConfiguration = {
    enabled: boolean;
};
export type FileChanges = {
    file: string;
    yml: string;
    diff: string;
};
export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
    files?: FileChanges[];
};

export type GitRepo = { name: string; fullName: string; ownerLogin: string };
