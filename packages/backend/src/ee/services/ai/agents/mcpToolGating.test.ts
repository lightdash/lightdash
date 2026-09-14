import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { getMcpActiveTools } from './mcpToolGating';

const assistantToolCall = (toolName: string, input: unknown): ModelMessage =>
    ({
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: `call-${toolName}`,
                toolName,
                input,
            },
        ],
    }) as ModelMessage;

describe('MCP tool gating', () => {
    const allToolNames = [
        'findContent',
        'runSql',
        'loadMcpTools',
        'mcp_linear__search_issues',
        'mcp_slack__search',
        'mcp_github__search',
    ];

    it('leaves agents without MCP tools unchanged', () => {
        expect(getMcpActiveTools([], allToolNames, [])).toBeUndefined();
    });

    it('starts with built-ins and the loader in their registered order', () => {
        expect(
            getMcpActiveTools(
                [],
                allToolNames,
                allToolNames.filter((name) => name.startsWith('mcp_')),
            ),
        ).toEqual(['findContent', 'runSql', 'loadMcpTools']);
    });

    it('loads requested tools and tools already called in deterministic order', () => {
        const messages = [
            assistantToolCall('loadMcpTools', {
                names: [
                    'mcp_slack__search',
                    'mcp_linear__search_issues',
                    'mcp_missing__tool',
                ],
            }),
            assistantToolCall('mcp_github__search', { query: 'lightdash' }),
        ];

        expect(
            getMcpActiveTools(
                messages,
                allToolNames,
                allToolNames.filter((name) => name.startsWith('mcp_')),
            ),
        ).toEqual([
            'findContent',
            'runSql',
            'loadMcpTools',
            'mcp_github__search',
            'mcp_linear__search_issues',
            'mcp_slack__search',
        ]);
    });

    it('intersects loaded names with the current tool set after compaction or config changes', () => {
        expect(
            getMcpActiveTools(
                [
                    assistantToolCall('loadMcpTools', {
                        names: ['mcp_removed__tool'],
                    }),
                ],
                [
                    'findContent',
                    'runSql',
                    'loadMcpTools',
                    'mcp_linear__search_issues',
                ],
                ['mcp_linear__search_issues'],
            ),
        ).toEqual(['findContent', 'runSql', 'loadMcpTools']);
    });
});
