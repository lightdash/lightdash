export type GitIntegrationConfiguration = {
    enabled: boolean;
    installationId?: string;
};

export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
};

export type ApiGitFileContent = {
    content: string;
    sha: string;
    filePath: string;
};

export type GitRepo = {
    name: string;
    fullName: string;
    ownerLogin: string;
    defaultBranch: string;
};

export type GitFileEntry = {
    name: string;
    path: string;
    type: 'file' | 'dir';
    size: number;
    sha: string;
};

export type GitBranch = {
    name: string;
    protected: boolean;
    isDefault: boolean; // TRUE = this is the project's protected branch, cannot write directly
};

// Discriminated union for file/directory responses
export type GitFileOrDirectory =
    | { type: 'directory'; entries: GitFileEntry[] }
    | { type: 'file'; content: string; sha: string; path: string };

export type ApiGitBranchesResponse = { status: 'ok'; results: GitBranch[] };
export type ApiGitFileOrDirectoryResponse = {
    status: 'ok';
    results: GitFileOrDirectory;
};
export type ApiGitFileSavedResponse = {
    status: 'ok';
    results: { sha: string; path: string };
};
export type ApiGitFileDeletedResponse = {
    status: 'ok';
    results: { deleted: true };
};
