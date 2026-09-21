import { UnauthorizedError as AiSdkUnauthorizedError } from '@ai-sdk/mcp';
/* eslint-disable import/extensions */
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
/* eslint-enable import/extensions */
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import {
    createUserFacingErrorResolver,
    getUserFacingErrorMessage,
} from './errorMessages';
import {
    getKnownMcpErrorMessage,
    getMcpHttpStatus,
    isMcpAuthorizationError,
    MCP_CONNECTION_MESSAGE,
    MCP_CREDENTIALS_MESSAGE,
    MCP_PERMISSION_MESSAGE,
    MCP_TIMEOUT_MESSAGE,
    McpAuthorizationRequiredError,
    McpPayloadTooLargeError,
    McpRuntimeError,
    McpTimeoutError,
} from './mcpErrors';

const setupResolver = () => {
    const request = vi.fn<typeof fetch>();
    const decisions = new AiDecisionClient(
        { apiKey: 'test', model: 'test', timeoutMs: 100 },
        request,
    );
    return { resolve: createUserFacingErrorResolver({ decisions }), request };
};

describe('MCP error facts', () => {
    it.each([
        new UnauthorizedError(),
        new AiSdkUnauthorizedError(),
        new StreamableHTTPError(401, 'Credentials expired'),
        new Error(
            'MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): no token',
        ),
        new Error('MCP HTTP Transport Error: GET SSE failed: 401 Unauthorized'),
        new Error('MCP HTTP Transport Error: HTTP 401 Unauthorized'),
        new McpAuthorizationRequiredError('Docs', 'server-1', 'user'),
    ])('recognizes actual authorization failures: %s', (error) => {
        expect(isMcpAuthorizationError(error)).toBe(true);
    });

    it.each([
        'Could not reach the authorization service',
        'Connection refused at port 4010',
        'Request 401 failed',
        'MCP HTTP Transport Error: HTTP 500 authorization service is unavailable',
        'MCP HTTP Transport Error: POSTing to endpoint (HTTP 403): retrying HTTP 401 cannot help',
        'MCP HTTP Transport Error: POSTing to endpoint (HTTP 500): {"example":"HTTP 401 Unauthorized"}',
        'MCP HTTP Transport Error: Unexpected content type: text/html; authorization=401',
    ])(
        'does not turn unrelated text into an OAuth reconnect: %s',
        (message) => {
            expect(isMcpAuthorizationError(new Error(message))).toBe(false);
        },
    );

    it.each([
        [401, MCP_CREDENTIALS_MESSAGE],
        [403, MCP_PERMISSION_MESSAGE],
        [408, MCP_TIMEOUT_MESSAGE],
        [504, MCP_TIMEOUT_MESSAGE],
        [500, MCP_CONNECTION_MESSAGE],
    ])(
        'uses structured HTTP %i copy only when decisions are enabled',
        async (status, expected) => {
            const { resolve, request } = setupResolver();
            const error = new StreamableHTTPError(
                status,
                'private response body',
            );
            expect(getMcpHttpStatus(error)).toBe(status);
            expect(getKnownMcpErrorMessage(error)).toBe(expected);
            expect(await resolve(error)).toBe(expected);
            expect(await resolve(new McpRuntimeError(error))).toBe(expected);
            expect(request).not.toHaveBeenCalled();
            expect(await createUserFacingErrorResolver({})(error)).toBe(
                'Something went wrong while processing your request. Please try again.',
            );
        },
    );

    it('keeps string-based transport errors compatible', () => {
        expect(
            getUserFacingErrorMessage(
                'MCP HTTP Transport Error: HTTP 403 Forbidden',
            ),
        ).toBe(MCP_PERMISSION_MESSAGE);
    });

    it('uses the structured status before misleading response prose', () => {
        const error = new StreamableHTTPError(500, 'HTTP 401 Unauthorized');
        expect(isMcpAuthorizationError(error)).toBe(false);
        expect(getKnownMcpErrorMessage(error)).toBe(MCP_CONNECTION_MESSAGE);
    });

    it('keeps typed timeouts and payload limits distinct from model context limits when enabled', async () => {
        const { resolve, request } = setupResolver();
        expect(await resolve(new McpTimeoutError(200))).toBe(
            MCP_TIMEOUT_MESSAGE,
        );
        expect(
            await resolve(new McpPayloadTooLargeError('too long')),
        ).toContain('reduce the MCP server response size');
        expect(request).not.toHaveBeenCalled();
    });
});
