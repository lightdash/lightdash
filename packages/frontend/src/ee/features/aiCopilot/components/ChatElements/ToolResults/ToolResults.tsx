import type { AiAgentToolCall, AiAgentToolResult } from '@lightdash/common';
import { Divider, Stack } from '@mantine-8/core';
import { RankingDisplay } from './RankingDisplay';
import { parseToolResultMetadata } from './utils';

export const ToolResults: React.FC<{
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | undefined;
}> = ({ toolCall, toolResult }) => {
    const toolResultMetadata = parseToolResultMetadata(
        toolResult,
        toolCall.toolName,
    );

    if (!toolResultMetadata) {
        return null;
    }

    if (toolCall.toolName === 'findFields') {
        return (
            <Stack>
                <Divider />
                <RankingDisplay
                    ranking={toolResultMetadata.metadata.ranking}
                    type="findFields"
                />
            </Stack>
        );
    }

    if (toolCall.toolName === 'findExplores') {
        return (
            <Stack>
                <Divider />
                <RankingDisplay
                    ranking={toolResultMetadata.metadata.ranking}
                    type="findExplores"
                />
            </Stack>
        );
    }

    return null;
};
