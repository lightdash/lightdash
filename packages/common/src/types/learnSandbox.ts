export type LearnWorkspaceFileSummary = { path: string; editable: boolean };
export type LearnWorkspaceFile = {
    path: string;
    content: string;
    editable: boolean;
};
export type LearnSandboxTool = 'lightdash' | 'dbt';
export type LearnSandboxCommandRequest = {
    tool: LearnSandboxTool;
    subcommand: string;
    args: string[];
};
export type LearnCommandStatus =
    | 'queued'
    | 'running'
    | 'done'
    | 'error'
    | 'timeout';
export type LearnCommandOutputChunk = {
    seq: number;
    stream: 'stdout' | 'stderr';
    text: string;
};
export type LearnCommandOutput = {
    commandUuid: string;
    status: LearnCommandStatus;
    exitCode: number | null;
    argv: string[];
    chunks: LearnCommandOutputChunk[];
};
export type ApiLearnWorkspaceFilesResponse = {
    status: 'ok';
    results: LearnWorkspaceFileSummary[];
};
export type ApiLearnWorkspaceFileResponse = {
    status: 'ok';
    results: LearnWorkspaceFile;
};
export type ApiLearnCommandCreatedResponse = {
    status: 'ok';
    results: { commandUuid: string };
};
export type ApiLearnCommandOutputResponse = {
    status: 'ok';
    results: LearnCommandOutput;
};
