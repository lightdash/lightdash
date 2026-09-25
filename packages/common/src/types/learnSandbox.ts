/**
 * Ids of the developer lessons (docs-page modules in the Learn library).
 * Progress is kept per id on the instance, which only accepts names it
 * knows, so the list lives here; the frontend's lesson declarations are
 * pinned to it by a test.
 */
export const LEARN_LESSON_IDS = [
    'docs:semantic-layer/metrics',
    'docs:semantic-layer/dimensions',
] as const;

export type LearnWorkspaceFileSummary = { path: string; editable: boolean };
export type LearnWorkspaceFile = {
    path: string;
    content: string;
    editable: boolean;
};
export type LearnSandboxTool = 'lightdash' | 'dbt';
/**
 * Subcommands the Learn terminal runs. The server enforces the list (with
 * its flag rules); the browser refuses anything else before asking, so a
 * mistyped command is caught where it is typed.
 */
export const LEARN_TERMINAL_SUBCOMMANDS: Record<
    LearnSandboxTool,
    readonly string[]
> = {
    lightdash: ['compile', 'deploy', 'validate', 'lint', 'download', 'upload'],
    dbt: ['parse', 'compile', 'ls'],
};
export const LEARN_TERMINAL_REJECTION =
    'That command is not available in the Learn terminal';
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
    startedAt: string | null;
    finishedAt: string | null;
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
