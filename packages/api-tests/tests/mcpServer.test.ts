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

    it('should advertise the skills extension capability', async () => {
        const response = await admin.post<
            McpResponse<{
                capabilities: {
                    resources?: { subscribe?: boolean; listChanged?: boolean };
                    extensions?: Record<string, unknown>;
                };
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 5,
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
        expect(response.body.result.capabilities).toMatchObject({
            resources: { subscribe: false, listChanged: false },
            experimental: {
                'io.modelcontextprotocol/skills': {},
            },
            extensions: {
                'io.modelcontextprotocol/skills': {},
            },
        });
    });

    it('should list built-in skill resources', async () => {
        const response = await admin.post<
            McpResponse<{
                resources: Array<{
                    uri: string;
                    name: string;
                    mimeType?: string;
                }>;
            }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 6,
                method: 'resources/list',
                params: {},
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        const uris = response.body.result.resources.map((r) => r.uri);
        expect(uris).toContain('skill://index.json');
        expect(uris).toContain(
            'skill://lightdash/developing-in-lightdash/SKILL.md',
        );

        const skillMd = response.body.result.resources.find(
            (r) =>
                r.uri === 'skill://lightdash/developing-in-lightdash/SKILL.md',
        );
        expect(skillMd?.name).toBe('developing-in-lightdash');
        expect(skillMd?.mimeType).toBe('text/markdown');
    });

    it('should read a built-in skill resource', async () => {
        const response = await admin.post<
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
                id: 7,
                method: 'resources/read',
                params: {
                    uri: 'skill://lightdash/developing-in-lightdash/SKILL.md',
                },
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        expect(response.body.result.contents).toHaveLength(1);
        expect(response.body.result.contents[0].uri).toBe(
            'skill://lightdash/developing-in-lightdash/SKILL.md',
        );
        expect(response.body.result.contents[0].text).toContain(
            '# Developing in Lightdash',
        );
    });

    it('should read the skills index resource', async () => {
        const response = await admin.post<
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
                id: 8,
                method: 'resources/read',
                params: { uri: 'skill://index.json' },
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        const content = response.body.result.contents[0];
        expect(content.mimeType).toBe('application/json');

        const index = JSON.parse(content.text) as {
            skills: Array<{
                name: string;
                type: string;
                url: string;
                digest: string;
            }>;
        };
        expect(index.skills).toContainEqual(
            expect.objectContaining({
                name: 'developing-in-lightdash',
                type: 'skill-md',
                url: 'skill://lightdash/developing-in-lightdash/SKILL.md',
                digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            }),
        );
    });

    it('should expose the skill fallback tools', async () => {
        const response = await admin.post<
            McpResponse<{ tools: Array<{ name: string }> }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 9,
                method: 'tools/list',
                params: {},
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        const names = response.body.result.tools.map((tool) => tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'list_skills',
                'read_skill',
                'read_skill_resource',
            ]),
        );
    });

    it('should call the list_skills tool', async () => {
        const response = await admin.post<
            McpResponse<{ content: Array<{ type: string; text: string }> }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 10,
                method: 'tools/call',
                params: { name: 'list_skills', arguments: {} },
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        const parsed = JSON.parse(response.body.result.content[0].text) as {
            skills: Array<{
                name: string;
                uri: string;
                resources: Array<{ path: string }>;
            }>;
        };
        const skill = parsed.skills.find(
            (s) => s.name === 'developing-in-lightdash',
        );
        expect(skill?.uri).toBe(
            'skill://lightdash/developing-in-lightdash/SKILL.md',
        );
        expect(skill?.resources.length).toBeGreaterThan(0);
        expect(
            skill?.resources.every((r) => r.path.startsWith('resources/')),
        ).toBe(true);
    });

    it('should call the read_skill tool', async () => {
        const response = await admin.post<
            McpResponse<{ content: Array<{ type: string; text: string }> }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 11,
                method: 'tools/call',
                params: {
                    name: 'read_skill',
                    arguments: { name: 'developing-in-lightdash' },
                },
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(
            '# Developing in Lightdash',
        );
    });

    it('should call the read_skill_resource tool', async () => {
        const response = await admin.post<
            McpResponse<{ content: Array<{ type: string; text: string }> }>
        >(
            '/api/v1/mcp',
            {
                jsonrpc: '2.0',
                id: 12,
                method: 'tools/call',
                params: {
                    name: 'read_skill_resource',
                    arguments: {
                        name: 'developing-in-lightdash',
                        path: 'resources/dashboard-reference.md',
                    },
                },
            },
            { headers: mcpHeaders },
        );

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(
            '# Dashboard Reference',
        );
    });
});
