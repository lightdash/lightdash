import { describe, expect, it } from 'vitest';
import { getLoadMcpTools } from './loadMcpTools';

const execute = async (names: string[]) => {
    const tool = getLoadMcpTools([
        'mcp_github__search_repositories',
        'mcp_linear__search_issues',
        'mcp_slack__search_messages',
    ]);
    return tool.execute!(
        { names },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
};

describe('loadMcpTools', () => {
    it('confirms matched names and echoes unmatched names with near matches', async () => {
        await expect(
            execute(['mcp_linear__search_issues', 'mcp_linear__search_issue']),
        ).resolves.toEqual({
            result: [
                'Loaded MCP tools: mcp_linear__search_issues.',
                'Unmatched names:',
                '- mcp_linear__search_issue (near matches: mcp_linear__search_issues)',
            ].join('\n'),
            metadata: { status: 'success' },
        });
    });

    it('does not expose schemas or descriptions in its result', async () => {
        const result = await execute(['mcp_github__search_repositories']);

        expect(result).toEqual({
            result: 'Loaded MCP tools: mcp_github__search_repositories.',
            metadata: { status: 'success' },
        });
    });
});
