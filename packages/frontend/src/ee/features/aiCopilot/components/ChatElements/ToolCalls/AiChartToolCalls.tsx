import {
    type AiAgentToolCall,
    type ApiCompiledQueryResults,
    assertUnreachable,
    isFindFieldsToolArgs,
    isTableVizConfigToolArgs,
    isTimeSeriesMetricVizConfigToolArgs,
    isVerticalBarMetricVizConfigToolArgs,
    TableVizConfigToolArgsSchemaTransformed,
    timeSeriesMetricVizConfigToolArgsSchemaTransformed,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type ToolName,
    ToolNameSchema,
    verticalBarMetricVizConfigToolArgsSchemaTransformed,
} from '@lightdash/common';
import { Badge, Group, Stack, Text, Timeline } from '@mantine-8/core';
import {
    IconChartHistogram,
    IconChartLine,
    IconDatabase,
    IconSearch,
    IconTable,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { type FC, type JSX } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { AiChartGenerationToolCallDescription } from './AiChartGenerationToolCallDescription';

const getToolIcon = (toolName: ToolName) => {
    const iconMap: Record<ToolName, (props: TablerIconsProps) => JSX.Element> =
        {
            findExplores: IconDatabase,
            findFields: IconSearch,
            generateBarVizConfig: IconChartHistogram,
            generateTimeSeriesVizConfig: IconChartLine,
            generateTableVizConfig: IconTable,
        };

    return iconMap[toolName];
};

const ToolCallDescription: FC<{
    toolCall: AiAgentToolCall;
    compiledSql: ApiCompiledQueryResults | undefined;
}> = ({ toolCall, compiledSql }) => {
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
            if (!isVerticalBarMetricVizConfigToolArgs(toolCall.toolArgs)) {
                return null;
            }
            const barVizConfigToolArgs =
                verticalBarMetricVizConfigToolArgsSchemaTransformed.parse(
                    toolCall.toolArgs,
                );

            return (
                <AiChartGenerationToolCallDescription
                    title={barVizConfigToolArgs.vizConfig.title}
                    dimensions={[barVizConfigToolArgs.vizConfig.xDimension]}
                    metrics={barVizConfigToolArgs.vizConfig.yMetrics}
                    breakdownByDimension={
                        barVizConfigToolArgs.vizConfig.breakdownByDimension
                    }
                    sql={compiledSql}
                />
            );
        case 'generateTableVizConfig':
            if (!isTableVizConfigToolArgs(toolCall.toolArgs)) {
                return null;
            }
            const tableVizConfigToolArgs =
                TableVizConfigToolArgsSchemaTransformed.parse(
                    toolCall.toolArgs,
                );

            return (
                <AiChartGenerationToolCallDescription
                    title={tableVizConfigToolArgs.vizConfig.title}
                    dimensions={
                        tableVizConfigToolArgs.vizConfig.dimensions ?? []
                    }
                    metrics={tableVizConfigToolArgs.vizConfig.metrics}
                    sql={compiledSql}
                />
            );
        case 'generateTimeSeriesVizConfig':
            if (!isTimeSeriesMetricVizConfigToolArgs(toolCall.toolArgs)) {
                return null;
            }
            const timeSeriesToolCallArgs =
                timeSeriesMetricVizConfigToolArgsSchemaTransformed.parse(
                    toolCall.toolArgs,
                );

            return (
                <AiChartGenerationToolCallDescription
                    title={timeSeriesToolCallArgs.vizConfig.title}
                    dimensions={[timeSeriesToolCallArgs.vizConfig.xDimension]}
                    metrics={timeSeriesToolCallArgs.vizConfig.yMetrics}
                    breakdownByDimension={
                        timeSeriesToolCallArgs.vizConfig.breakdownByDimension
                    }
                    sql={compiledSql}
                />
            );
        case 'findExplores':
            // TODO: Implement findExplores tool call description
            return null;
        default:
            return assertUnreachable(toolName, `Unknown tool name ${toolName}`);
    }
};

type AiChartToolCallsProps = {
    toolCalls: AiAgentToolCall[] | undefined;
    compiledSql: ApiCompiledQueryResults | undefined;
};

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({
    toolCalls,
    compiledSql,
}) => {
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
                    const IconComponent = getToolIcon(
                        // TODO: Fix this type cast
                        toolCall.toolName as ToolName,
                    );
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
                            <ToolCallDescription
                                toolCall={toolCall}
                                compiledSql={compiledSql}
                            />
                        </Timeline.Item>
                    );
                })}
            </Timeline>
        </Stack>
    );
};
