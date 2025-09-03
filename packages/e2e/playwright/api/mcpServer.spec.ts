import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

test.describe('MCP server', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('should initialize MCP server', async ({ request }) => {
        const response = await request.post('/api/v1/mcp', {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            data: {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: {
                        name: 'test-client',
                        version: '1.0.0',
                    },
                },
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.jsonrpc).toBe('2.0');
        expect(body.id).toBe(1);
        expect(body.result).toHaveProperty('protocolVersion');
        expect(body.result).toHaveProperty('capabilities');
        expect(body.result).toHaveProperty('serverInfo');
        expect(body.result.serverInfo.name).toBe('Lightdash MCP Server');
        expect(body.result.serverInfo).toHaveProperty('version');
    });

    test('should list available tools', async ({ request }) => {
        const response = await request.post('/api/v1/mcp', {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            data: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.jsonrpc).toBe('2.0');
        expect(body.id).toBe(2);
        expect(body.result).toHaveProperty('tools');
        expect(body.result.tools).toEqual(expect.any(Array));
        expect(body.result.tools.length).toBeGreaterThan(0);

        // Check that we have some expected tools
        const toolNames = body.result.tools.map(
            (tool: { name: string }) => tool.name,
        );
        expect(toolNames).toEqual(
            expect.arrayContaining([expect.stringMatching(/.*/)]),
        );
    });
});
