import {
    experimental_codeModeTool as codeModeTool,
    DIRECT_TOOL_CALL,
} from '@ai-sdk/code-mode';
import {
    toolSearch,
    type Experimental_ToolCallers,
    type ModelMessage,
    type ToolSet,
} from 'ai';
import type { AiAgentArgs } from '../types/aiAgent';
import { getToolCalls } from './mcpToolGating';

export const TOOL_SEARCH_TOOL_NAME = 'searchTools';
export const CODE_MODE_TOOL_NAME = 'runCode';

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

/**
 * Read-only tools a code-mode program may call. Tools that create artifacts,
 * post to Slack, edit content, run sub-agents, or wait for approval stay
 * direct-only: nested calls cannot surface approvals or UI tool cards.
 */
export const CODE_MODE_TOOL_NAMES: ReadonlySet<string> = new Set([
    'analyzeFieldImpact',
    'describeWarehouseTable',
    'discoverRepos',
    'findContent',
    'findCustomChartTypes',
    'generateHashes',
    'generateUuids',
    'getDashboardCharts',
    'getKnowledgeDocumentContent',
    'getMetadata',
    'getProjectInfo',
    'getPullRequestDiff',
    'grepFields',
    'listContent',
    'listKnowledgeDocuments',
    'listProjects',
    'listWarehouseTables',
    'listWorkstreams',
    'readContent',
    'readPinnedThread',
    'resolveUrl',
    'runContentQuery',
    'runSavedChart',
    'searchFieldValues',
    'searchSemanticLayer',
]);

// Long enough for a handful of warehouse queries awaited from one program.
const CODE_MODE_TIMEOUT_MS = 5 * 60_000;

/** Tool search and code mode only apply to a full standard tool set. */
export const isToolRoutingEnabled = (
    execution: AiAgentArgs['execution'],
): boolean =>
    execution.mode === 'standard' && execution.toolAllowlist === undefined;

const TOOL_CALLER_PROPERTY = 'experimental_toolCaller';

/**
 * The AI SDK marks a tool caller (the code-mode tool) with a non-enumerable
 * property that object spread drops; carry it over to a derived tool.
 */
export const copyToolCaller = <T extends object>(
    from: ToolSet[string],
    to: T,
): T => {
    const descriptor = Object.getOwnPropertyDescriptor(
        from,
        TOOL_CALLER_PROPERTY,
    );
    return descriptor
        ? Object.defineProperty(to, TOOL_CALLER_PROPERTY, descriptor)
        : to;
};

export const isToolCallerTool = (tool: ToolSet[string]): boolean =>
    Object.getOwnPropertyDescriptor(tool, TOOL_CALLER_PROPERTY) !== undefined;

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
                    : copyToolCaller(tool, { ...tool, deferLoading: true }),
            ]),
        ),
        [TOOL_SEARCH_TOOL_NAME]: toolSearch(),
    };
};

export type AgentToolRouting = {
    tools: ToolSet;
    toolCallers: Experimental_ToolCallers<ToolSet> | undefined;
};

/**
 * Adds the code-mode tool and routes the read-only tools (and `searchTools`,
 * so discovery can happen inside a program) through it. Every routed tool
 * stays directly callable as well.
 */
export const getAgentToolRouting = (
    tools: ToolSet,
    args: Pick<AiAgentArgs, 'enableCodeMode' | 'execution'>,
): AgentToolRouting => {
    if (!args.enableCodeMode || !isToolRoutingEnabled(args.execution)) {
        return { tools, toolCallers: undefined };
    }
    const callers: ReadonlyArray<
        typeof CODE_MODE_TOOL_NAME | typeof DIRECT_TOOL_CALL
    > = [CODE_MODE_TOOL_NAME, DIRECT_TOOL_CALL];
    const routedToolNames = Object.keys(tools).filter(
        (name) =>
            CODE_MODE_TOOL_NAMES.has(name) || name === TOOL_SEARCH_TOOL_NAME,
    );
    return {
        tools: {
            ...tools,
            // 'conversation' keeps the provider-visible tool definition stable
            // (and the prompt cache warm) as tools are discovered mid-run.
            [CODE_MODE_TOOL_NAME]: codeModeTool({
                toolDiscovery: 'conversation',
                executionPolicy: { timeoutMs: CODE_MODE_TIMEOUT_MS },
            }),
        },
        // The SDK types callers against a literal tool map, so a dynamic
        // ToolSet can never name one; at runtime it only checks that the
        // caller exists in `tools`.
        toolCallers: Object.fromEntries(
            routedToolNames.map((name) => [name, callers]),
        ) as Experimental_ToolCallers<ToolSet>,
    };
};
