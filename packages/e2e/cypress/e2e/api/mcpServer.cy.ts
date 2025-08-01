describe('MCP server', () => {
    beforeEach(() => {
        cy.login();
    });

    it('should initialize MCP server', () => {
        cy.request({
            method: 'POST',
            url: '/api/v1/mcp',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: {
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
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.jsonrpc).to.eq('2.0');
            expect(response.body.id).to.eq(1);
            expect(response.body.result).to.have.property('protocolVersion');
            expect(response.body.result).to.have.property('capabilities');
            expect(response.body.result).to.have.property('serverInfo');
            expect(response.body.result.serverInfo.name).to.eq(
                'Lightdash MCP Server',
            );
            expect(response.body.result.serverInfo).to.have.property('version');
        });
    });

    it('should list available tools', () => {
        cy.request({
            method: 'POST',
            url: '/api/v1/mcp',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.jsonrpc).to.eq('2.0');
            expect(response.body.id).to.eq(2);
            expect(response.body.result).to.have.property('tools');
            expect(response.body.result.tools).to.be.an('array');

            // Check for the get_lightdash_version tool
            const { tools } = response.body.result;
            const versionTool = tools.find(
                (tool: { name: string }) =>
                    tool.name === 'get_lightdash_version',
            );
            expect(versionTool?.description).to.eq(
                'Get the current Lightdash version',
            );
            expect(versionTool).to.have.property('inputSchema');
        });
    });

    // FIXME
    // This endpoint now requires an oauth valid token
    // with at least an mcp:read scope
    // To do this, we'll have to replicate the flow from MCP validator
    // - create a client with mcp:read scope
    // - authenticate using oauth (see oauthLogin.cy.ts)
    // - attach bearer token
    it.skip('should call get_lightdash_version tool', () => {
        cy.request({
            method: 'POST',
            url: '/api/v1/mcp',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'get_lightdash_version',
                    arguments: {},
                },
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.jsonrpc).to.eq('2.0');
            expect(response.body.id).to.eq(3);
            expect(response.body.result).to.have.property('content');
            expect(response.body.result.content).to.be.an('array');
            expect(response.body.result.content[0]).to.have.property(
                'type',
                'text',
            );
            expect(response.body.result.content[0]).to.have.property('text');
            expect(response.body.result.content[0].text).to.match(
                /^\d+\.\d+\.\d+$/,
            );
        });
    });

    it('should handle ping request', () => {
        cy.request({
            method: 'POST',
            url: '/api/v1/mcp',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: {
                jsonrpc: '2.0',
                id: 4,
                method: 'ping',
                params: {},
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.jsonrpc).to.eq('2.0');
            expect(response.body.id).to.eq(4);
            expect(response.body.result).to.deep.eq({});
        });
    });

    it('should handle unknown tool gracefully', () => {
        cy.request({
            method: 'POST',
            url: '/api/v1/mcp',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: {
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/call',
                params: {
                    name: 'unknown_tool',
                    arguments: {},
                },
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.jsonrpc).to.eq('2.0');
            expect(response.body.id).to.eq(5);
            expect(response.body.error.code).to.eq(-32602);
            expect(response.body.error.message).to.contain('not found');
        });
    });
});
