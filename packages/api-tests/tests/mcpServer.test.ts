import { login } from '../helpers/auth';

const mcpHeaders = {
    Accept: 'application/json, text/event-stream',
};

// JSON-RPC 2.0 error codes — see https://www.jsonrpc.org/specification#error_object
const JSON_RPC_INVALID_PARAMS = -32602;

type McpResponse<T = Record<string, unknown>> = {
    jsonrpc: string;
    id: number;
    result: T;
};

describe('MCP server', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('should initialize MCP server', async () => {
        const response = await admin.post<
            McpResponse<{
                protocolVersion: string;
                capabilities: unknown;
                serverInfo: { name: string; version: string };
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' },
                },
            },
            { headers: mcpHeaders },
        );
        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.result).toHaveProperty('protocolVersion');
        expect(response.body.result).toHaveProperty('capabilities');
        expect(response.body.result).toHaveProperty('serverInfo');
        expect(response.body.result.serverInfo.name).toBe(
            'Lightdash MCP Server',
        );
        expect(response.body.result.serverInfo).toHaveProperty('version');
        expect(response.body.result.capabilities).toMatchObject({
            resources: { listChanged: false },
        });
    });

    it('should list available tools', async () => {
        const response = await admin.post<
            McpResponse<{
                tools: Array<{
                    name: string;
                    description: string;
                    inputSchema: unknown;
                }>;
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
            },
            { headers: mcpHeaders },
        );
        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(2);
        expect(response.body.result).toHaveProperty('tools');
        expect(response.body.result.tools).toBeInstanceOf(Array);

        const { tools } = response.body.result;
        const versionTool = tools.find(
            (tool: { name: string }) => tool.name === 'get_lightdash_version',
        );
        expect(versionTool?.description).toBe(
            'Get the current Lightdash version',
        );
        expect(versionTool).toHaveProperty('inputSchema');
    });

    it('should list the analyst prompt without skill prompts', async () => {
        const response = await admin.post<
            McpResponse<{
                prompts: Array<{
                    name: string;
                }>;
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 3,
                method: 'prompts/list',
                params: {},
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(3);

        const promptNames = response.body.result.prompts.map(
            (prompt) => prompt.name,
        );
        expect(promptNames).toContain('lightdash-analyst');
        expect(
            promptNames.some((name) => name.startsWith('lightdash-skill-')),
        ).toBe(false);
    });

    it('should list built-in skill resources', async () => {
        const response = await admin.post<
            McpResponse<{
                resources: Array<{
                    uri: string;
                    name: string;
                    title: string;
                    mimeType?: string;
                }>;
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 4,
                method: 'resources/list',
                params: {},
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(4);

        const overviewResource = response.body.result.resources.find(
            (resource) =>
                resource.uri === 'lightdash://skills/developing-in-lightdash',
        );
        const nestedResource = response.body.result.resources.find((resource) =>
            resource.uri.startsWith(
                'lightdash://skills/developing-in-lightdash/resources/',
            ),
        );

        expect(overviewResource).toMatchObject({
            uri: 'lightdash://skills/developing-in-lightdash',
            name: 'developing-in-lightdash',
            title: 'Developing in Lightdash',
            mimeType: 'text/markdown',
        });
        expect(nestedResource).toMatchObject({
            mimeType: 'text/markdown',
        });
        expect(nestedResource?.name).toMatch(
            /^developing-in-lightdash\/[^/]+$/,
        );
        expect(nestedResource?.title).toMatch(/^Developing in Lightdash \/ /);
    });

    it('should read a listed skill resource', async () => {
        const listResponse = await admin.post<
            McpResponse<{
                resources: Array<{
                    uri: string;
                }>;
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 5,
                method: 'resources/list',
                params: {},
            },
            { headers: mcpHeaders },
        );

        const nestedResource = listResponse.body.result.resources.find(
            (resource) =>
                resource.uri.startsWith(
                    'lightdash://skills/developing-in-lightdash/resources/',
                ),
        );

        if (!nestedResource) {
            throw new Error(
                'Expected at least one nested skill resource in listing',
            );
        }

        const readResponse = await admin.post<
            McpResponse<{
                contents: Array<{
                    uri: string;
                    mimeType?: string;
                    text: string;
                }>;
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 6,
                method: 'resources/read',
                params: {
                    uri: nestedResource.uri,
                },
            },
            { headers: mcpHeaders },
        );

        expect(readResponse.status).toBe(200);
        expect(readResponse.body.result.contents).toHaveLength(1);
        expect(readResponse.body.result.contents[0]).toMatchObject({
            uri: nestedResource.uri,
            mimeType: 'text/markdown',
        });
        expect(
            readResponse.body.result.contents[0].text.length,
        ).toBeGreaterThan(0);
    });

    it('should return an MCP error for an unknown skill resource', async () => {
        const response = await admin.post<{
            jsonrpc: string;
            id: number;
            error?: { code?: number };
        }>(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 7,
                method: 'resources/read',
                params: {
                    uri: 'lightdash://skills/developing-in-lightdash/resources/does-not-exist',
                },
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(7);
        expect(response.body.error?.code).toBe(JSON_RPC_INVALID_PARAMS);
    });

    it('should handle ping request', async () => {
        const response = await admin.post<McpResponse>(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 8,
                method: 'ping',
                params: {},
            },
            { headers: mcpHeaders },
        );
        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(8);
        expect(response.body.result).toEqual({});
    });
});
