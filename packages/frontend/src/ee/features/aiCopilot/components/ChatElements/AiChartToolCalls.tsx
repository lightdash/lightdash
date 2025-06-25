import {
    type AiAgentToolCall,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type ToolName,
    getTotalFilterRules,
    isFindFieldsToolArgs,
    isGenerateBarVizConfigToolArgs,
    isGenerateQueryFiltersToolArgs,
    isGenerateTimeSeriesVizConfigToolArgs,
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
import MantineIcon from '../../../../../components/common/MantineIcon';

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
    const { toolName, toolArgs } = toolCall;

    // Type guard to ensure toolArgs exists
    if (!toolArgs) {
        return (
            <Text c="dimmed" size="sm">
                {TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[
                    toolCall.toolName as ToolName
                ] || `Executed ${toolCall.toolName}`}
            </Text>
        );
    }

    switch (toolName) {
        case 'findFields':
            if (isFindFieldsToolArgs(toolArgs)) {
                const fields = toolArgs.embeddingSearchQueries || [];
                const exploreName = toolArgs.exploreName;

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
            }
            break;

        case 'generateBarVizConfig':
        case 'generateTimeSeriesVizConfig':
            const isBarChart = toolName === 'generateBarVizConfig';
            const isTimeSeriesChart =
                toolName === 'generateTimeSeriesVizConfig';

            if (
                (isBarChart && isGenerateBarVizConfigToolArgs(toolArgs)) ||
                (isTimeSeriesChart &&
                    isGenerateTimeSeriesVizConfigToolArgs(toolArgs))
            ) {
                const title = toolArgs.vizConfig.title;
                const metrics = toolArgs.vizConfig.yMetrics || [];
                const dimension = toolArgs.vizConfig.xDimension;
                const chartType = isBarChart
                    ? 'bar chart'
                    : 'time series chart';

                return (
                    <>
                        <Text c="dimmed" size="xs">
                            Generated a {chartType}
                            {title && (
                                <>
                                    {' '}
                                    <Text
                                        size="xs"
                                        variant="link"
                                        component="span"
                                        inherit
                                        c="dark.6"
                                    >
                                        "{title}"
                                    </Text>
                                </>
                            )}
                        </Text>
                        <Group gap="xs">
                            {dimension && (
                                <Group gap="xs">
                                    <Text c="dimmed" size="xs">
                                        X-axis:
                                    </Text>
                                    <Badge
                                        color="gray"
                                        variant="light"
                                        size="xs"
                                        radius="sm"
                                        style={{
                                            textTransform: 'none',
                                            fontWeight: 400,
                                        }}
                                    >
                                        {dimension}
                                    </Badge>
                                </Group>
                            )}
                            {metrics.length > 0 && (
                                <Group gap="xs">
                                    <Text c="dimmed" size="xs">
                                        Y-axis:
                                    </Text>
                                    <Badge
                                        color="gray"
                                        variant="light"
                                        size="xs"
                                        radius="sm"
                                        style={{
                                            textTransform: 'none',
                                            fontWeight: 400,
                                        }}
                                    >
                                        {metrics.join(', ')}
                                    </Badge>
                                </Group>
                            )}
                        </Group>
                    </>
                );
            }
            break;

        case 'generateQueryFilters':
            if (isGenerateQueryFiltersToolArgs(toolArgs)) {
                const filters = toolArgs.filters;

                const totalFilterRules = getTotalFilterRules(filters);
                const filterCount = totalFilterRules.length;

                return (
                    <Group gap="xs">
                        <Text c="dimmed" size="xs">
                            Applied {filterCount} filter
                            {filterCount !== 1 ? 's' : ''} to refine the data:
                        </Text>
                        {filterCount > 0 && (
                            <Group gap="xs" mt={4}>
                                {totalFilterRules.map((filterRule) => {
                                    const displayText = `${
                                        filterRule.target.fieldId
                                    } ${filterRule.operator}${
                                        filterRule.values &&
                                        filterRule.values.length > 0
                                            ? ` ${filterRule.values.join(', ')}`
                                            : ''
                                    }${
                                        filterRule.settings?.unitOfTime
                                            ? ` ${filterRule.settings.unitOfTime}`
                                            : ''
                                    }`;
                                    return (
                                        <Badge
                                            key={filterRule.id}
                                            color="gray"
                                            variant="light"
                                            size="xs"
                                            radius="sm"
                                            style={{
                                                textTransform: 'none',
                                                fontWeight: 400,
                                            }}
                                        >
                                            {displayText}
                                        </Badge>
                                    );
                                })}
                            </Group>
                        )}
                    </Group>
                );
            }
            break;

        case 'generateCsv':
            return (
                <>
                    <Text c="dimmed" size="sm">
                        Generated CSV export for data analysis
                    </Text>
                    <Text size="xs" mt={4} c="dimmed">
                        Ready for download
                    </Text>
                </>
            );

        default:
            break;
    }

    // Fallback
    return null;
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
                                    {TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[
                                        toolCall.toolName as ToolName
                                    ] || toolCall.toolName}
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
