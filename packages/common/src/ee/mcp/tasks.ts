import { z } from 'zod';

/**
 * MCP Tasks extension (io.modelcontextprotocol/tasks, SEP-2663, MCP spec
 * 2026-07-28). Wire shapes for the server-directed long-running-task pattern:
 * a tools/call may return a task handle (CreateTaskResult) instead of the
 * synchronous result, which the client then polls via tasks/get and may
 * cancel via tasks/cancel.
 */
export const MCP_TASKS_EXTENSION_NAME = 'io.modelcontextprotocol/tasks';

/**
 * Per-request client capabilities are declared under this `_meta` key. A
 * server must never return a task to a client that did not declare the tasks
 * extension there.
 */
export const MCP_CLIENT_CAPABILITIES_META_KEY =
    'io.modelcontextprotocol/clientCapabilities';

export const MCP_TASK_STATUSES = [
    'working',
    'input_required',
    'completed',
    'failed',
    'cancelled',
] as const;

export type McpTaskStatus = (typeof MCP_TASK_STATUSES)[number];

export const MCP_TASK_TERMINAL_STATUSES = [
    'completed',
    'failed',
    'cancelled',
] as const;

export const isMcpTaskStatusTerminal = (status: McpTaskStatus): boolean =>
    (MCP_TASK_TERMINAL_STATUSES as readonly string[]).includes(status);

/**
 * The Task object carried by CreateTaskResult and tasks/get responses.
 * Timestamps are ISO 8601 strings; `ttlMs` is null for unlimited retention.
 */
export type McpTask = {
    taskId: string;
    status: McpTaskStatus;
    statusMessage?: string;
    createdAt: string;
    lastUpdatedAt: string;
    ttlMs: number | null;
    pollIntervalMs?: number;
};

/** JSON-RPC error carried by a failed task's `error` field. */
export type McpTaskError = {
    code: number;
    message: string;
};

/**
 * Returned from tools/call instead of the synchronous result when the server
 * decides to run the request as a task. `resultType: 'task'` is the
 * discriminator clients use to tell it apart from a normal tool result.
 */
export type McpCreateTaskResult = McpTask & {
    resultType: 'task';
};

/**
 * Returned from tasks/get. On `completed` the `result` field contains what
 * the original request would have returned synchronously; on `failed` the
 * `error` field carries the JSON-RPC error.
 */
export type McpGetTaskResult = McpTask & {
    resultType: 'complete';
    result?: Record<string, unknown>;
    error?: McpTaskError;
};

/**
 * JSON-RPC error code the extension mandates for tasks/* requests from
 * clients that did not declare the tasks capability in the request's _meta.
 */
export const MCP_ERROR_CODE_MISSING_REQUIRED_CAPABILITY = -32003;

/** tasks/cancel acknowledges with an empty result. */
export type McpCancelTaskResult = {
    resultType: 'complete';
};

const mcpClientCapabilitiesSchema = z.object({
    extensions: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Whether the request's `_meta` declares the tasks extension in its
 * per-request client capabilities. Malformed metadata counts as not opted in.
 */
export const clientSupportsMcpTasks = (meta: unknown): boolean => {
    if (typeof meta !== 'object' || meta === null) {
        return false;
    }
    const capabilities = (meta as Record<string, unknown>)[
        MCP_CLIENT_CAPABILITIES_META_KEY
    ];
    const parsed = mcpClientCapabilitiesSchema.safeParse(capabilities);
    if (!parsed.success || parsed.data.extensions === undefined) {
        return false;
    }
    return MCP_TASKS_EXTENSION_NAME in parsed.data.extensions;
};
