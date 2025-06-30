import {
    type AiAgentToolCall,
    assertUnreachable,
    isFindFieldsToolArgs,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    ToolNameSchema,
} from '@lightdash/common';
import { Badge, Group, Stack, Text, Timeline } from '@mantine-8/core';
import {
    IconChartHistogram,
    IconChartLine,
    IconFileText,
    IconFilter,
    IconSearch,
    IconSparkles,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';

const getToolIcon = (toolName: string) => {
    const iconMap = {
        findFields: IconSearch,
        generateBarVizConfig: IconChartHistogram,
        generateTimeSeriesVizConfig: IconChartLine,
        generateQueryFilters: IconFilter,
        generateCsv: IconFileText,
    } as const;

    return iconMap[toolName as keyof typeof iconMap] || IconSparkles;
};

const getToolDescription = (toolCall: AiAgentToolCall) => {
    const toolName = ToolNameSchema.parse(toolCall.toolName);

    switch (toolName) {
        case 'findFields':
            if (!isFindFieldsToolArgs(toolCall.toolArgs)) {
                return null;
            }
            const fields = toolCall.toolArgs.embeddingSearchQueries || [];
            const exploreName = toolCall.toolArgs.exploreName;

            return (
                <>
                    <Text c="dimmed" size="xs">
                        Found {fields.length} relevant field
                        {fields.length !== 1 ? 's' : ''} in{' '}
                        <Text
                            variant="link"
                            component="span"
                            inherit
                            c="dark.6"
                            fw={500}
                        >
                            {exploreName}
                        </Text>{' '}
                        table
                    </Text>
                    {fields.length > 0 && (
                        <Text size="xs" mt={4} c="dimmed">
                            <Group gap="xs">
                                Fields:
                                {fields.map((field) => (
                                    <Badge
                                        key={field.name}
                                        color="gray"
                                        variant="light"
                                        size="xs"
                                        radius="sm"
                                        style={{
                                            textTransform: 'none',
                                            fontWeight: 400,
                                        }}
                                    >
                                        {field.name}
                                    </Badge>
                                ))}
                            </Group>
                        </Text>
                    )}
                </>
            );
        case 'generateBarVizConfig':
        case 'generateCsv':
        case 'generateQueryFilters':
        case 'generateTimeSeriesVizConfig':
            return null;

        default:
            return assertUnreachable(toolName, `Unknown tool name ${toolName}`);
    }
};

type AiChartToolCallsProps = {
    toolCalls: AiAgentToolCall[] | undefined;
};

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({ toolCalls }) => {
    if (!toolCalls || toolCalls.length === 0) return null;

    return (
        <Stack>
            <Timeline
                active={toolCalls.length - 1}
                bulletSize={20}
                lineWidth={2}
                color="indigo.6"
            >
                {toolCalls.map((toolCall) => {
                    const IconComponent = getToolIcon(toolCall.toolName);
                    const toolName = ToolNameSchema.parse(toolCall.toolName);

                    return (
                        <Timeline.Item
                            key={toolCall.uuid}
                            radius="md"
                            bullet={
                                <MantineIcon
                                    icon={IconComponent}
                                    size={12}
                                    stroke={1.5}
                                />
                            }
                            title={
                                <Text fw={500} size="sm">
                                    {
                                        TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[
                                            toolName
                                        ]
                                    }
                                </Text>
                            }
                            lineVariant={'solid'}
                        >
                            {getToolDescription(toolCall)}
                        </Timeline.Item>
                    );
                })}
            </Timeline>
        </Stack>
    );
};
