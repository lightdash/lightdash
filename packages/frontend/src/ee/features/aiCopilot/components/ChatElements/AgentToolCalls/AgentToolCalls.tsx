import { Box, List, Text, ThemeIcon } from '@mantine-8/core';
import { IconTool } from '@tabler/icons-react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useAiAgentThreadStreamToolCalls } from '../../../streaming/useAiAgentThreadStreamQuery';
import { getToolCallDescription } from './ToolCallDescriptions';

const TOOL_NAMES = [
    'findFields',
    'generateBarVizConfig',
    'generateCsv',
    'generateQueryFilters',
    'generateTimeSeriesVizConfig',
];

const AgentToolCalls = () => {
    const { threadUuid } = useParams();
    const toolCalls = useAiAgentThreadStreamToolCalls(threadUuid!);
    if (!toolCalls || toolCalls.length === 0) return null;

    return (
        <Box bg="gray.0" p="xs" mb="sm">
            <List
                spacing="xs"
                size="xs"
                icon={
                    <ThemeIcon
                        size={14}
                        radius="xl"
                        variant="light"
                        color="gray"
                    >
                        <MantineIcon icon={IconTool} size={8} />
                    </ThemeIcon>
                }
            >
                {toolCalls
                    .filter((toolCall) =>
                        TOOL_NAMES.includes(toolCall.toolName),
                    )
                    .map((toolCall) => {
                        const toolDescription =
                            getToolCallDescription(toolCall);

                        if (!toolDescription) return null;

                        return (
                            <List.Item key={toolCall.toolCallId}>
                                <Text size="xs" c="dimmed">
                                    {toolDescription}
                                </Text>
                            </List.Item>
                        );
                    })}
            </List>
        </Box>
    );
};

export default AgentToolCalls;
