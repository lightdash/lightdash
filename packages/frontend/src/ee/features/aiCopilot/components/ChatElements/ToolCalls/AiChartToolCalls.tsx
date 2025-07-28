import {
    AgentToolCallArgsSchema,
    type AiAgentToolCall,
    AiResultType,
    type ApiCompiledQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    assertUnreachable,
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type ToolName,
    ToolNameSchema,
} from '@lightdash/common';
import {
    Badge,
    Collapse,
    Group,
    Paper,
    rem,
    Stack,
    Text,
    Timeline,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartDots3,
    IconChartHistogram,
    IconChartLine,
    IconDatabase,
    IconSearch,
    IconSelector,
    IconTable,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { type FC, type JSX } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../../hooks/useCompiledSql';
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

type ToolCallDisplayType = 'streaming' | 'finished-streaming' | 'persisted';
type ToolCallSummary = Omit<
    AiAgentToolCall,
    'createdAt' | 'uuid' | 'promptUuid'
>;

const ToolCallContainer = ({
    children,
    defaultOpened = true,
}: {
    children: React.ReactNode;
    defaultOpened?: boolean;
}) => {
    const [opened, { toggle }] = useDisclosure(defaultOpened);

    return (
        <Paper
            withBorder
            p="sm"
            radius="md"
            style={{ borderStyle: 'dashed' }}
            // default shadow is subtler than the ones we can set
            shadow={opened ? 'none' : undefined}
        >
            <UnstyledButton onClick={toggle} w="100%" h="22px">
                <Group justify="space-between" w="100%" h="100%">
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconChartDots3}
                            size={14}
                            color="gray"
                        />
                        <Title order={6} c="dimmed" tt="uppercase" size="xs">
                            How it is calculated
                        </Title>
                    </Group>
                    <MantineIcon icon={IconSelector} size={14} color="gray" />
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>{children}</Collapse>
        </Paper>
    );
};

const ToolCallDescription: FC<{
    toolCall: ToolCallSummary;
    compiledSql: ApiCompiledQueryResults | undefined;
}> = ({ toolCall, compiledSql }) => {
    const toolNameParsed = ToolNameSchema.safeParse(toolCall.toolName);
    const toolArgsParsed = AgentToolCallArgsSchema.safeParse(toolCall.toolArgs);

    if (!toolNameParsed.success || !toolArgsParsed.success) {
        console.error(
            `Failed to parse tool call ${toolCall.toolName} ${toolCall.toolCallId}`,
            toolNameParsed.error ?? toolArgsParsed.error,
        );
        return null;
    }

    const toolName = toolNameParsed.data;
    const toolArgs = toolArgsParsed.data;

    switch (toolArgs.type) {
        case 'find_explores':
            return (
                <Text c="dimmed" size="xs">
                    Searched relevant explores
                </Text>
            );
        case 'find_fields':
            return (
                <Text c="dimmed" size="xs">
                    Searched for fields{' '}
                    {toolArgs.fieldSearchQueries.map((query) => (
                        <Badge
                            key={query.label}
                            color="gray"
                            variant="light"
                            size="xs"
                            mx={rem(2)}
                            radius="sm"
                            style={{
                                textTransform: 'none',
                                fontWeight: 400,
                            }}
                        >
                            {query.label}
                        </Badge>
                    ))}
                </Text>
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
                    sql={compiledSql?.query}
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
                    sql={compiledSql?.query}
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
                    sql={compiledSql?.query}
                />
            );
        default:
            return assertUnreachable(toolArgs, `Unknown tool name ${toolName}`);
    }
};

type AiChartToolCallsProps = {
    toolCalls: ToolCallSummary[] | undefined;
    type: ToolCallDisplayType;
    compiledSql?: ApiCompiledQueryResults;
    metricQuery?: ApiExecuteAsyncMetricQueryResults['metricQuery'];
    projectUuid?: string;
};

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({
    toolCalls,
    type,
    metricQuery,
    projectUuid,
}) => {
    const { data: compiledSql } = useCompiledSqlFromMetricQuery({
        tableName: metricQuery?.exploreName,
        projectUuid,
        metricQuery: metricQuery,
    });

    const texts =
        type === 'streaming'
            ? TOOL_DISPLAY_MESSAGES
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL;

    if (!toolCalls || toolCalls.length === 0) return null;
    return (
        <ToolCallContainer defaultOpened={type !== 'persisted'}>
            <Stack pt="sm">
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
        </ToolCallContainer>
    );
};
