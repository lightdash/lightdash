import type { AiAgentToolName } from '@lightdash/common';

const HIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set([
    'improveContext',
    'generateHashes',
    'generateUuids',
    'loadMcpTools',
] satisfies AiAgentToolName[]);

export const isHiddenToolName = (toolName: string): boolean =>
    HIDDEN_TOOL_NAMES.has(toolName);
