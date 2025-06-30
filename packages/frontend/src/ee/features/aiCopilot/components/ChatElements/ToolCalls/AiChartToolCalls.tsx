import {
    type AiAgentToolCall,
    assertUnreachable,
    CsvFileVizConfigToolArgsSchemaTransformed,
    generateQueryFiltersToolArgsSchemaTransformed,
    isCsvFileVizConfigToolArgs,
    isFindFieldsToolArgs,
    isGenerateQueryFiltersToolArgs,
    isTimeSeriesMetricVizConfigToolArgs,
    isVerticalBarMetricVizConfigToolArgs,
    timeSeriesMetricVizConfigToolArgsSchemaTransformed,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    ToolNameSchema,
    verticalBarMetricVizConfigToolArgsSchemaTransformed,
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
import AgentVisualizationFilters from '../AgentVisualizationFilters';
import { AiChartGenerationToolCallDescription } from './AiChartGenerationToolCallDescription';

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

const ToolCallDescription: FC<{ toolCall: AiAgentToolCall }> = ({
    toolCall,
}) => {
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
        case 'generateQueryFilters':
            if (!isGenerateQueryFiltersToolArgs(toolCall.toolArgs)) {
                return null;
            }

            const toolArgs =
                generateQueryFiltersToolArgsSchemaTransformed.parse(
                    toolCall.toolArgs,
                );

            return (
                <Group gap="xs">
                    <Text c="dimmed" size="xs">
                        Generated filters for the query
                    </Text>
                    <AgentVisualizationFilters
                        compact
                        filters={toolArgs.filters}
                    />
                </Group>
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
                    // TODO: VizConfig is not a metric query, it's a viz config as the name suggests
                    // We need to change the name of the field to something more appropriate
                    metricQuery={barVizConfigToolArgs.vizConfig}
                />
            );
        case 'generateCsv':
            if (!isCsvFileVizConfigToolArgs(toolCall.toolArgs)) {
                return null;
            }
            const csvFileVizConfigToolArgs =
                CsvFileVizConfigToolArgsSchemaTransformed.parse(
                    toolCall.toolArgs,
                );

            return (
                <AiChartGenerationToolCallDescription
                    title={csvFileVizConfigToolArgs.vizConfig.title}
                    dimensions={
                        csvFileVizConfigToolArgs.vizConfig.dimensions ?? []
                    }
                    metrics={csvFileVizConfigToolArgs.vizConfig.metrics}
                    // TODO: VizConfig is not a metric query, it's a viz config as the name suggests
                    // We need to change the name of the field to something more appropriate
                    metricQuery={csvFileVizConfigToolArgs.vizConfig}
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
                    // TODO: VizConfig is not a metric query, it's a viz config as the name suggests
                    // We need to change the name of the field to something more appropriate
                    metricQuery={timeSeriesToolCallArgs.vizConfig}
                />
            );

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
                            <ToolCallDescription toolCall={toolCall} />
                        </Timeline.Item>
                    );
                })}
            </Timeline>
        </Stack>
    );
};
