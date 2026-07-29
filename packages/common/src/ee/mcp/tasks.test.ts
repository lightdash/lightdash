import {
    clientSupportsMcpTasks,
    isMcpTaskStatusTerminal,
    MCP_CLIENT_CAPABILITIES_META_KEY,
    MCP_TASKS_EXTENSION_NAME,
} from './tasks';

describe('clientSupportsMcpTasks', () => {
    it('detects the tasks extension declared in per-request capabilities', () => {
        expect(
            clientSupportsMcpTasks({
                [MCP_CLIENT_CAPABILITIES_META_KEY]: {
                    extensions: {
                        [MCP_TASKS_EXTENSION_NAME]: {},
                    },
                },
            }),
        ).toBe(true);
    });

    it('ignores other extensions', () => {
        expect(
            clientSupportsMcpTasks({
                [MCP_CLIENT_CAPABILITIES_META_KEY]: {
                    extensions: {
                        'io.modelcontextprotocol/skills': {},
                    },
                },
            }),
        ).toBe(false);
    });

    it('returns false when _meta is missing or has no capabilities key', () => {
        expect(clientSupportsMcpTasks(undefined)).toBe(false);
        expect(clientSupportsMcpTasks({})).toBe(false);
        expect(clientSupportsMcpTasks({ progressToken: 'abc' })).toBe(false);
    });

    it('returns false for malformed capability metadata', () => {
        expect(
            clientSupportsMcpTasks({
                [MCP_CLIENT_CAPABILITIES_META_KEY]: 'not-an-object',
            }),
        ).toBe(false);
        expect(
            clientSupportsMcpTasks({
                [MCP_CLIENT_CAPABILITIES_META_KEY]: {
                    extensions: 'not-an-object',
                },
            }),
        ).toBe(false);
        expect(clientSupportsMcpTasks('not-an-object')).toBe(false);
        expect(clientSupportsMcpTasks(null)).toBe(false);
    });
});

describe('isMcpTaskStatusTerminal', () => {
    it('treats completed, failed and cancelled as terminal', () => {
        expect(isMcpTaskStatusTerminal('completed')).toBe(true);
        expect(isMcpTaskStatusTerminal('failed')).toBe(true);
        expect(isMcpTaskStatusTerminal('cancelled')).toBe(true);
    });

    it('treats working and input_required as non-terminal', () => {
        expect(isMcpTaskStatusTerminal('working')).toBe(false);
        expect(isMcpTaskStatusTerminal('input_required')).toBe(false);
    });
});
