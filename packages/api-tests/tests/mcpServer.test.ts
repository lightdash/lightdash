import { login } from '../helpers/auth';

const mcpHeaders = {
    Accept: 'application/json, text/event-stream',
};

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

    it('should handle ping request', async () => {
        const response = await admin.post<McpResponse>(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 4,
                method: 'ping',
                params: {},
            },
            { headers: mcpHeaders },
        );
        expect(response.status).toBe(200);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(4);
        expect(response.body.result).toEqual({});
    });
});
