import {
    toolLoadMcpToolsOutputSchema,
    toolLoadMcpToolsStructuredContentSchema,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import { describe, expect, it } from 'vitest';
import { getLoadMcpTools } from './loadMcpTools';

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

const execute = async (names: string[]) => {
    const tool = getLoadMcpTools([
        'mcp_github__search_repositories',
        'mcp_linear__search_issues',
        'mcp_slack__search_messages',
    ]);
    if (!tool.execute) throw new Error('loadMcpTools has no execute');
    return tool.execute({ names }, options);
};

describe('loadMcpTools', () => {
    it('confirms matched names and echoes unmatched names with near matches', async () => {
        const output = await execute([
            'mcp_linear__search_issues',
            'mcp_linear__search_issue',
        ]);

        expect(output).toEqual({
            result: [
                'Loaded MCP tools: mcp_linear__search_issues.',
                'Unmatched names:',
                '- mcp_linear__search_issue (near matches: mcp_linear__search_issues)',
            ].join('\n'),
            metadata: { status: 'success' },
            structuredContent: {
                loaded: ['mcp_linear__search_issues'],
                unmatched: [
                    {
                        name: 'mcp_linear__search_issue',
                        nearMatches: ['mcp_linear__search_issues'],
                    },
                ],
            },
        });
        expect(toolLoadMcpToolsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('does not expose schemas or descriptions in its result', async () => {
        const output = await execute(['mcp_github__search_repositories']);

        expect(output).toEqual({
            result: 'Loaded MCP tools: mcp_github__search_repositories.',
            metadata: { status: 'success' },
            structuredContent: {
                loaded: ['mcp_github__search_repositories'],
                unmatched: [],
            },
        });
    });

    it('reports nothing loaded and empty near matches as structured content', async () => {
        const output = await execute([
            'totally_unrelated',
            'totally_unrelated',
        ]);

        expect(output).toEqual({
            result: [
                'No MCP tools loaded.',
                'Unmatched names:',
                '- totally_unrelated (near matches: none)',
            ].join('\n'),
            metadata: { status: 'success' },
            structuredContent: {
                loaded: [],
                unmatched: [{ name: 'totally_unrelated', nearMatches: [] }],
            },
        });
        expect(toolLoadMcpToolsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('structured content carries the same facts as the result text', async () => {
        const output = await execute([
            'mcp_slack__search_messages',
            'mcp_github__search_repositories',
            'mcp_slack__search_message',
        ]);
        const { result, structuredContent } =
            toolLoadMcpToolsOutputSchema.parse(output);
        const parsed =
            toolLoadMcpToolsStructuredContentSchema.parse(structuredContent);

        expect(result).toContain(
            `Loaded MCP tools: ${parsed.loaded.join(', ')}.`,
        );
        parsed.unmatched.forEach(({ name, nearMatches }) => {
            expect(result).toContain(
                `- ${name} (near matches: ${nearMatches.join(', ')})`,
            );
        });
    });

    it('accepts the shared error envelope', () => {
        const result = 'Something failed';

        expect(
            toolLoadMcpToolsOutputSchema.safeParse({
                result,
                metadata: { status: 'error' },
                structuredContent: { error: result },
            }).success,
        ).toBe(true);
    });
});
