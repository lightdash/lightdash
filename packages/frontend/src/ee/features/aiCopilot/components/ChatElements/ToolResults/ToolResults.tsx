import type { AiAgentToolCall, AiAgentToolResult } from '@lightdash/common';
import { Code, Divider, Stack, Text } from '@mantine/core';
import { RankingDisplay } from './RankingDisplay';
import { parseToolResultMetadata } from './utils';

export const ToolResults: React.FC<{
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | undefined;
}> = ({ toolCall, toolResult }) => {
    if (toolResult?.metadata?.status === 'error') {
        return (
            <Stack gap="xs">
                <Divider />
                <Text fw={500} size="xs" c="red.7">
                    Error
                </Text>
                <Code
                    block
                    c="red.9"
                    bg="red.0"
                    style={{
                        fontSize: '11px',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {toolResult.result}
                </Code>
            </Stack>
        );
    }

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
