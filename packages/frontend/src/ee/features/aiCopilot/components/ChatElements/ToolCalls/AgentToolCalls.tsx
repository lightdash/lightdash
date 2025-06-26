import { TOOL_DISPLAY_MESSAGES, ToolNameSchema } from '@lightdash/common';
import { Box, List, Text, ThemeIcon } from '@mantine-8/core';
import { IconTool } from '@tabler/icons-react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useAiAgentThreadStreamToolCalls } from '../../../streaming/useAiAgentThreadStreamQuery';

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
                    .filter(
                        (toolCall) =>
                            ToolNameSchema.safeParse(toolCall.toolName).success,
                    )
                    .map((toolCall) => {
                        const toolName = ToolNameSchema.safeParse(
                            toolCall.toolName,
                        );
                        if (toolName.success) {
                            const toolDescription =
                                TOOL_DISPLAY_MESSAGES[toolName.data];

                            if (!toolDescription) return null;

                            return (
                                <List.Item key={toolCall.toolCallId}>
                                    <Text size="xs" c="dimmed">
                                        {toolDescription}
                                    </Text>
                                </List.Item>
                            );
                        }
                    })}
            </List>
        </Box>
    );
};

export default AgentToolCalls;
