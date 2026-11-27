import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
    ServerNotification,
    ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { McpToolCallErrorKind } from '../../database/entities/mcpToolCall';

export type McpToolCallRejection = Exclude<McpToolCallErrorKind, 'tool_error'>;

export type RejectedMcpToolCall = {
    kind: McpToolCallRejection;
    toolName: string;
    toolArgs: Record<string, unknown>;
    errorMessage: string | null;
    durationMs: number;
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>;
};

const MAX_REJECTED_TOOL_NAME_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 500;

const handlerStarts = new AsyncLocalStorage<{ started: boolean }>();

/** Called by tracked tool handlers, which record their own calls. */
export const markToolHandlerStarted = (): void => {
    const trace = handlerStarts.getStore();
    if (trace) trace.started = true;
};

const toolCallRequestSchema = z.object({
    params: z.object({
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()).optional(),
    }),
});

const toolErrorResultSchema = z.object({
    isError: z.literal(true),
    content: z.array(z.unknown()),
});

const toolCallMethodSchema = z.object({ method: z.literal('tools/call') });

const textContentSchema = z.object({
    type: z.literal('text'),
    text: z.string(),
});

const getErrorText = (content: unknown[]): string | null => {
    const text = content
        .map((item) => textContentSchema.safeParse(item))
        .find((item) => item.success);
    return text?.success
        ? text.data.text.slice(0, MAX_ERROR_MESSAGE_LENGTH)
        : null;
};

const getRejection = (
    name: string,
    isToolServed: (name: string) => boolean,
    isToolKnown: (name: string) => boolean,
): McpToolCallRejection => {
    // A served tool whose handler never started failed input validation
    if (isToolServed(name)) return 'invalid_arguments';
    return isToolKnown(name) ? 'unavailable_tool' : 'unknown_tool';
};

type RequestHandler = (
    request: unknown,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
) => unknown;

/**
 * Reports tools/call requests the SDK answers with an error before any
 * tracked handler runs: unknown or unavailable tool names and arguments that
 * fail the tool's input schema. Must be installed before tools are registered.
 */
export const observeRejectedToolCalls = (
    server: McpServer,
    {
        isToolServed,
        isToolKnown,
        onRejected,
    }: {
        isToolServed: (name: string) => boolean;
        isToolKnown: (name: string) => boolean;
        onRejected: (call: RejectedMcpToolCall) => void;
    },
): void => {
    const protocol = server.server;
    const setRequestHandler = protocol.setRequestHandler.bind(protocol) as (
        schema: unknown,
        handler: RequestHandler,
    ) => void;
    const observe =
        (handler: RequestHandler): RequestHandler =>
        async (request, extra) => {
            const startedAt = Date.now();
            const trace = { started: false };
            const result = await handlerStarts.run(trace, () =>
                handler(request, extra),
            );
            if (trace.started) return result;
            try {
                const call = toolCallRequestSchema.safeParse(request);
                const error = toolErrorResultSchema.safeParse(result);
                if (call.success && error.success) {
                    const { name } = call.data.params;
                    onRejected({
                        kind: getRejection(name, isToolServed, isToolKnown),
                        toolName: name.slice(0, MAX_REJECTED_TOOL_NAME_LENGTH),
                        toolArgs: call.data.params.arguments ?? {},
                        errorMessage: getErrorText(error.data.content),
                        durationMs: Date.now() - startedAt,
                        extra,
                    });
                }
            } catch {
                // Observability must never change the reply
            }
            return result;
        };
    protocol.setRequestHandler = ((schema: unknown, handler: RequestHandler) =>
        setRequestHandler(schema, (request, extra) =>
            toolCallMethodSchema.safeParse(request).success
                ? observe(handler)(request, extra)
                : handler(request, extra),
        )) as typeof protocol.setRequestHandler;
};
