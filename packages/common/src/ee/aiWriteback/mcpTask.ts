import assertUnreachable from '../../utils/assertUnreachable';
import { type McpTaskStatus } from '../mcp/tasks';
import { type AiWritebackRunStatus } from './types';

/** Suggested tasks/get polling interval for AI writeback task handles. */
export const MCP_AI_WRITEBACK_TASK_POLL_INTERVAL_MS = 5000;

/**
 * Maps an AI writeback run status onto the MCP Tasks extension status
 * vocabulary: pending and every pipeline stage are `working`; `ready` AND
 * `error` are both `completed` — a run error is a tool-level failure, which
 * the extension requires to surface as a completed task whose result has
 * `isError: true` (`failed` is reserved for JSON-RPC protocol faults);
 * `cancelled` maps directly.
 */
export const aiWritebackRunStatusToMcpTaskStatus = (
    status: AiWritebackRunStatus,
): McpTaskStatus => {
    switch (status) {
        case 'pending':
        case 'install':
        case 'sandbox':
        case 'clone':
        case 'agent':
        case 'commit':
        case 'push':
        case 'pull_request':
            return 'working';
        case 'ready':
        case 'error':
            return 'completed';
        case 'cancelled':
            return 'cancelled';
        default:
            return assertUnreachable(
                status,
                `Unknown AI writeback run status: ${status}`,
            );
    }
};

/** Human-readable task statusMessage for each AI writeback run status. */
export const getAiWritebackTaskStatusMessage = (
    status: AiWritebackRunStatus,
): string => {
    switch (status) {
        case 'pending':
            return 'Queued — waiting to be picked up by a worker.';
        case 'install':
            return 'Installing tooling in the sandbox.';
        case 'sandbox':
            return 'Preparing the sandbox environment.';
        case 'clone':
            return 'Cloning the project repository.';
        case 'agent':
            return 'Running the coding agent against the dbt project.';
        case 'commit':
            return 'Committing the agent changes.';
        case 'push':
            return 'Pushing the branch to the repository.';
        case 'pull_request':
            return 'Opening the pull request.';
        case 'ready':
            return 'AI writeback finished.';
        case 'error':
            return 'AI writeback failed.';
        case 'cancelled':
            return 'AI writeback cancelled.';
        default:
            return assertUnreachable(
                status,
                `Unknown AI writeback run status: ${status}`,
            );
    }
};
