import {
    AgentToolCallArgsSchema,
    type AiAgentToolCall,
    AiResultType,
    type ApiCompiledQueryResults,
    assertUnreachable,
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type ToolName,
    ToolNameSchema,
} from '@lightdash/common';
import { Badge, Stack, Text, Timeline } from '@mantine-8/core';
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

type ToolCallDisplayType = 'streaming' | 'persisted';
type ToolCallSummary = Omit<
    AiAgentToolCall,
    'createdAt' | 'uuid' | 'promptUuid'
>;

const ToolCallDescription: FC<{
    toolCall: ToolCallSummary;
    compiledSql: ApiCompiledQueryResults | undefined;
}> = ({ toolCall, compiledSql }) => {
    const toolName = ToolNameSchema.parse(toolCall.toolName);
    const toolArgs = AgentToolCallArgsSchema.parse(toolCall.toolArgs);

    switch (toolArgs.type) {
        case 'find_explores':
            return null;
        case 'find_fields':
            const { exploreName } = toolArgs;

            return (
                <>
                    <Text c="dimmed" size="xs">
                        Found relevant fields in{' '}
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
                            {exploreName}
                        </Badge>
                    </Text>
                </>
            );
        case AiResultType.VERTICAL_BAR_RESULT:
            const barVizConfigToolArgs = toolArgs;

            return (
                <AiChartGenerationToolCallDescription
                    title={barVizConfigToolArgs.title}
                    dimensions={[barVizConfigToolArgs.vizConfig.xDimension]}
                    metrics={barVizConfigToolArgs.vizConfig.yMetrics}
                    breakdownByDimension={
                        barVizConfigToolArgs.vizConfig.breakdownByDimension
                    }
                    sql={compiledSql}
                />
            );

        case AiResultType.TABLE_RESULT:
            const tableVizConfigToolArgs = toolArgs;
            return (
                <AiChartGenerationToolCallDescription
                    title={tableVizConfigToolArgs.title}
                    dimensions={
                        tableVizConfigToolArgs.vizConfig.dimensions ?? []
                    }
                    metrics={tableVizConfigToolArgs.vizConfig.metrics}
                    sql={compiledSql}
                />
            );
        case AiResultType.TIME_SERIES_RESULT:
            const timeSeriesToolCallArgs = toolArgs;
            return (
                <AiChartGenerationToolCallDescription
                    title={timeSeriesToolCallArgs.title}
                    dimensions={[timeSeriesToolCallArgs.vizConfig.xDimension]}
                    metrics={timeSeriesToolCallArgs.vizConfig.yMetrics}
                    breakdownByDimension={
                        timeSeriesToolCallArgs.vizConfig.breakdownByDimension
                    }
                    sql={compiledSql}
                />
            );
        case AiResultType.ONE_LINE_RESULT:
            return null;
        default:
            return assertUnreachable(toolArgs, `Unknown tool name ${toolName}`);
    }
};

type AiChartToolCallsProps = {
    toolCalls: ToolCallSummary[] | undefined;
    compiledSql?: ApiCompiledQueryResults;
    type: ToolCallDisplayType;
};

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({
    toolCalls,
    compiledSql,
    type,
}) => {
    if (!toolCalls || toolCalls.length === 0) return null;

    const texts =
        type === 'streaming'
            ? TOOL_DISPLAY_MESSAGES
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL;

    return (
        <Stack>
            <Timeline
                active={toolCalls.length - 1}
                bulletSize={20}
                lineWidth={2}
                color="indigo.6"
            >
                {toolCalls.map((toolCall) => {
                    const toolNameParsed = ToolNameSchema.safeParse(
                        toolCall.toolName,
                    );
                    if (!toolNameParsed.success) {
                        return null;
                    }

                    const toolName = toolNameParsed.data;
                    const IconComponent = getToolIcon(toolName);

                    return (
                        <Timeline.Item
                            key={toolCall.toolCallId}
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
                                    {texts[toolName]}
                                </Text>
                            }
                            lineVariant={'solid'}
                        >
                            <ToolCallDescription
                                toolCall={toolCall}
                                compiledSql={
                                    type === 'persisted'
                                        ? compiledSql
                                        : undefined
                                }
                            />
                        </Timeline.Item>
                    );
                })}
            </Timeline>
        </Stack>
    );
};
