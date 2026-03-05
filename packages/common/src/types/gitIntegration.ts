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
    /** TRUE if direct writes are blocked (GitHub protection OR project's configured branch) */
    isProtected: boolean;
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

// Request body for creating a new branch
export type CreateGitBranchRequest = {
    name: string;
    sourceBranch: string;
};

// Response for created branch
export type ApiGitBranchCreatedResponse = {
    status: 'ok';
    results: GitBranch;
};

// Request body for creating a pull request
export type CreateGitPullRequestRequest = {
    title: string;
    description: string;
};

// Response for created pull request
export type ApiGitPullRequestCreatedResponse = {
    status: 'ok';
    results: PullRequestCreated;
};
