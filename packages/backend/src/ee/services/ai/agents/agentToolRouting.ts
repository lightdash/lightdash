import { toolSearch, type ModelMessage, type ToolSet } from 'ai';
import type { AiAgentArgs } from '../types/aiAgent';
import { getToolCalls } from './mcpToolGating';

export const TOOL_SEARCH_TOOL_NAME = 'searchTools';

/**
 * Tools every turn keeps in the provider tool list when tool search is on.
 * Everything else is registered with `deferLoading` and reached through
 * `searchTools`.
 */
export const ALWAYS_LOADED_TOOL_NAMES: ReadonlySet<string> = new Set([
    'grepFields',
    'getMetadata',
    'generateVisualization',
    'searchFieldValues',
    'findContent',
    'runSql',
    'runComposerQueries',
    'loadSkill',
    'loadProjectContext',
    'loadMcpTools',
]);

/** Tool search only applies to a full standard tool set. */
export const isToolRoutingEnabled = (
    execution: AiAgentArgs['execution'],
): boolean =>
    execution.mode === 'standard' && execution.toolAllowlist === undefined;

export const getCalledToolNames = (messages: ModelMessage[]): Set<string> =>
    new Set(getToolCalls(messages).map((toolCall) => toolCall.toolName));

/**
 * Registers every non-core tool with `deferLoading` and adds the search tool.
 * Tools the turn already relies on stay loaded: hinted tools (a hint can be
 * forced on the first step), tools called earlier in the thread, and MCP tools
 * (gated by `loadMcpTools`).
 */
export const withToolSearch = ({
    tools,
    toolHints,
    messageHistory,
    mcpToolNames,
}: {
    tools: ToolSet;
    toolHints: string[];
    messageHistory: ModelMessage[];
    mcpToolNames: string[];
}): ToolSet => {
    const loadedToolNames = new Set([
        ...ALWAYS_LOADED_TOOL_NAMES,
        ...toolHints,
        ...getCalledToolNames(messageHistory),
        ...mcpToolNames,
    ]);
    return {
        ...Object.fromEntries(
            Object.entries(tools).map(([name, tool]) => [
                name,
                loadedToolNames.has(name)
                    ? tool
                    : { ...tool, deferLoading: true },
            ]),
        ),
        [TOOL_SEARCH_TOOL_NAME]: toolSearch(),
    };
};
