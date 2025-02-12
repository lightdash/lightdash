export type GitIntegrationConfiguration = {
    enabled: boolean;
};

export type DiffChange = {
    type: 'added' | 'removed';
    value: string;
};

export type FileChanges = {
    file: string;
    yml: string;
    diff: DiffChange[];
};
export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
};
export type PreviewPullRequest = {
    files: FileChanges[];
};

export type GitRepo = { name: string; fullName: string; ownerLogin: string };
