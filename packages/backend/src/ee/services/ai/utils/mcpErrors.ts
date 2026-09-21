import { UnauthorizedError as AiSdkUnauthorizedError } from '@ai-sdk/mcp';
import type { AiMcpCredentialScope } from '@lightdash/common';
/* eslint-disable import/extensions */
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
/* eslint-enable import/extensions */

export class McpAuthorizationRequiredError extends Error {
    constructor(
        readonly mcpServerName: string,
        readonly mcpServerUuid: string,
        readonly credentialScope: AiMcpCredentialScope,
    ) {
        super(
            `MCP server "${mcpServerName}" requires authorization before this agent can use it.`,
        );
        this.name = 'McpAuthorizationRequiredError';
    }
}

export class McpTimeoutError extends Error {
    constructor(
        timeoutMs: number,
        options?: { operation?: string; cause?: unknown },
    ) {
        super(
            `MCP ${options?.operation ?? 'request'} timed out after ${timeoutMs}ms`,
        );
        this.name = 'McpTimeoutError';
        this.cause = options?.cause;
    }
}

export class McpPayloadTooLargeError extends Error {}

// Preserve the origin without copying remote text into user-facing messages.
export class McpRuntimeError extends Error {
    constructor(error: unknown) {
        super(error instanceof Error ? error.message : String(error));
        this.name = 'McpRuntimeError';
        this.cause = error;
    }
}

export const getMcpHttpStatus = (error: unknown): number | undefined => {
    const source = error instanceof McpRuntimeError ? error.cause : error;
    if (source instanceof StreamableHTTPError) return source.code;
    const message = source instanceof Error ? source.message : source;
    if (typeof message !== 'string') return undefined;
    // These prefixes are emitted by the installed AI SDK. Match the status
    // slot, never arbitrary numbers or words in the remote response body.
    const match = message.match(
        /^MCP HTTP Transport Error: (?:POSTing to endpoint \(HTTP (\d{3})\)|HTTP (\d{3})\b|GET SSE failed: (\d{3})\b)/,
    );
    return match ? Number(match[1] ?? match[2] ?? match[3]) : undefined;
};

export const isMcpAuthorizationError = (error: unknown): boolean =>
    error instanceof McpAuthorizationRequiredError ||
    error instanceof UnauthorizedError ||
    error instanceof AiSdkUnauthorizedError ||
    getMcpHttpStatus(error) === 401;

export const isMcpError = (error: unknown): boolean =>
    error instanceof McpRuntimeError ||
    error instanceof McpAuthorizationRequiredError ||
    error instanceof McpTimeoutError ||
    error instanceof McpPayloadTooLargeError ||
    error instanceof StreamableHTTPError ||
    error instanceof UnauthorizedError ||
    error instanceof AiSdkUnauthorizedError ||
    (error instanceof Error &&
        error.message.startsWith('MCP HTTP Transport Error:')) ||
    (typeof error === 'string' &&
        error.startsWith('MCP HTTP Transport Error:'));

export const MCP_CONNECTION_MESSAGE =
    'We could not connect to the MCP server. Check that it is available and try again.';
export const MCP_CREDENTIALS_MESSAGE =
    'The MCP server rejected the saved credentials. Check the MCP server authentication settings, then try again.';
export const MCP_PERMISSION_MESSAGE =
    'The MCP server refused access. Check that the connected account has permission to use this MCP server.';
export const MCP_TIMEOUT_MESSAGE =
    'The MCP server took too long to respond and was disconnected. Check that it is available, then try again.';

export const getKnownMcpErrorMessage = (error: unknown): string | undefined => {
    const source = error instanceof McpRuntimeError ? error.cause : error;
    if (source instanceof McpAuthorizationRequiredError) return source.message;
    if (source instanceof McpTimeoutError) return MCP_TIMEOUT_MESSAGE;
    if (source instanceof McpPayloadTooLargeError)
        return 'The MCP server returned more data than this agent can accept. Try a narrower request or reduce the MCP server response size.';
    if (isMcpAuthorizationError(source)) return MCP_CREDENTIALS_MESSAGE;
    const status = getMcpHttpStatus(source);
    if (status === 403) return MCP_PERMISSION_MESSAGE;
    if (status === 408 || status === 504) return MCP_TIMEOUT_MESSAGE;
    if (status === 429)
        return 'The MCP server is receiving too many requests. Please try again in a few moments.';
    if (status !== undefined) return MCP_CONNECTION_MESSAGE;
    return undefined;
};

export const getLegacyMcpErrorMessage = (error: Error): string => {
    if (error instanceof McpAuthorizationRequiredError) {
        return error.message;
    }

    if (error instanceof McpTimeoutError) {
        return 'The MCP server took too long to respond and was disconnected. Check that it is available, then try again.';
    }

    if (error.message.includes('MCP HTTP Transport Error')) {
        if (
            error.message.includes('HTTP 401') ||
            error.message.includes('Unauthorized')
        ) {
            return 'The MCP server rejected the saved credentials. Check the MCP server authentication settings, then try again.';
        }

        if (
            error.message.includes('HTTP 403') ||
            error.message.includes('Forbidden')
        ) {
            return 'The MCP server refused access. Check that the connected account has permission to use this MCP server.';
        }
    }

    return 'We could not connect to the MCP server. Check that it is available and try again.';
};
