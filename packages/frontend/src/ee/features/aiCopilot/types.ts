import { type AiAgentToolName } from '@lightdash/common';

export type AiAgentToolOutput = {
    toolName: AiAgentToolName;
    toolArgs: unknown;
    toolOutput: unknown;
    isPreliminary?: boolean;
};
