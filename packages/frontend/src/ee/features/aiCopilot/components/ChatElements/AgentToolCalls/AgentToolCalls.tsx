import { Box, List, Text, ThemeIcon } from '@mantine-8/core';
import { IconTool } from '@tabler/icons-react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useAiAgentThreadStreamToolCalls } from '../../../streaming/useAiAgentThreadStreamQuery';

// TODO :: should be based on schemas
const TOOL_DISPLAY_MESSAGES = {
    findFields: 'Finding relevant fields',
    generateBarVizConfig: 'Generating a bar chart',
    generateCsv: 'Generating CSV file',
    generateQueryFilters: 'Applying filters to the query',
    generateTimeSeriesVizConfig: 'Generating a line chart',
} as const;

const TOOL_NAMES = Object.keys(TOOL_DISPLAY_MESSAGES);

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
                            TOOL_DISPLAY_MESSAGES[
                                toolCall.toolName as keyof typeof TOOL_DISPLAY_MESSAGES
                            ];

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
