import {
    AgentToolCallArgsSchema,
    type AiAgentToolCall,
    AiResultType,
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
    IconDashboard,
    IconDatabase,
    IconSchool,
    IconSearch,
    IconSelector,
    IconTable,
    IconTools,
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
            generateDashboard: IconDashboard,
            findDashboards: IconDashboard,
            findCharts: IconChartDots3,
            improveContext: IconSchool,
        };

    return iconMap[toolName];
};

type ToolCallDisplayType = 'streaming' | 'finished-streaming' | 'persisted';
type ToolCallSummary = Omit<
    AiAgentToolCall,
    'createdAt' | 'uuid' | 'promptUuid'
>;

const ImproveContextToolCall: FC<{
    toolCall: ToolCallSummary;
}> = ({ toolCall }) => {
    const toolNameParsed = ToolNameSchema.safeParse(toolCall.toolName);
    const toolArgsParsed = AgentToolCallArgsSchema.safeParse(toolCall.toolArgs);

    if (!toolNameParsed.success || !toolArgsParsed.success) {
        console.error(
            `Failed to parse tool call ${toolCall.toolName} ${toolCall.toolCallId}`,
            toolNameParsed.error ?? toolArgsParsed.error,
        );
        return null;
    }

    const toolArgs = toolArgsParsed.data;

    if (toolArgs.type === 'improve_context') {
        return (
            <Paper bg="white" p="xs" mb="xs">
                <Group gap="xs" align="flex-start" wrap="nowrap">
                    <MantineIcon icon={IconSchool} size="md" color="violet.6" />
                    <Stack gap="two">
                        <Text fz="xs" fw={500} c="gray.7" lh="normal" m={0}>
                            Saved instruction
                        </Text>
                        <Text
                            fz="xs"
                            fw={400}
                            c="gray.6"
                            lh="normal"
                            m={0}
                            fs="italic"
                        >
                            {toolArgs.suggestedInstruction}
                        </Text>
                    </Stack>
                </Group>
            </Paper>
        );
    }

    return null;
};

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
            p="xs"
            radius="md"
            style={{ borderStyle: 'dashed' }}
            // default shadow is subtler than the ones we can set
            shadow={opened ? 'none' : undefined}
        >
            <UnstyledButton onClick={toggle} w="100%" h="18px">
                <Group justify="space-between" w="100%" h="100%">
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconTools}
                            size="sm"
                            strokeWidth={1.2}
                            color="gray.6"
                        />
                        <Title order={6} c="gray.6" size="xs">
                            How it is calculated
                        </Title>
                    </Group>
                    <MantineIcon icon={IconSelector} size={12} color="gray.6" />
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>{children}</Collapse>
        </Paper>
    );
};

const ToolCallDescription: FC<{
    toolCall: ToolCallSummary;
}> = ({ toolCall }) => {
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
                />
            );
        case 'find_dashboards':
            const findDashboardsToolArgs = toolArgs;
            return (
                <Text c="dimmed" size="xs">
                    Searched for dashboards{' '}
                    {findDashboardsToolArgs.dashboardSearchQueries.map(
                        (query) => (
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
                        ),
                    )}
                </Text>
            );
        case 'find_charts':
            const findChartsToolArgs = toolArgs;
            return (
                <Text c="dimmed" size="xs">
                    Searched for charts{' '}
                    {findChartsToolArgs.chartSearchQueries.map((query) => (
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
        case AiResultType.DASHBOARD_RESULT:
            const dashboardToolArgs = toolArgs;
            return (
                <Text c="dimmed" size="xs">
                    Generated dashboard: "{dashboardToolArgs.title}" with{' '}
                    {dashboardToolArgs.visualizations.length} visualization
                    {dashboardToolArgs.visualizations.length !== 1 ? 's' : ''}
                </Text>
            );
        case AiResultType.IMPROVE_CONTEXT:
            return <> </>;
        default:
            return assertUnreachable(toolArgs, `Unknown tool name ${toolName}`);
    }
};

type AiChartToolCallsProps = {
    toolCalls: ToolCallSummary[] | undefined;
    type: ToolCallDisplayType;
};

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({
    toolCalls,
    type,
}) => {
    const texts =
        type === 'streaming'
            ? TOOL_DISPLAY_MESSAGES
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL;

    const improveContextToolCall = toolCalls?.find(
        (toolCall) => toolCall.toolName === 'improveContext',
    );
    const calculationToolCalls = toolCalls?.filter(
        (toolCall) => toolCall.toolName !== 'improveContext',
    );

    if (!toolCalls || toolCalls.length === 0) return null;
    return (
        <Stack gap="xs">
            {calculationToolCalls && calculationToolCalls.length > 0 && (
                <ToolCallContainer defaultOpened={type !== 'persisted'}>
                    <Stack pt="xs">
                        <Timeline
                            active={calculationToolCalls.length - 1}
                            bulletSize={16}
                            lineWidth={1}
                            color="gray"
                        >
                            {calculationToolCalls.map((toolCall) => {
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
                                        radius="sm"
                                        bullet={
                                            <Paper
                                                bg="white"
                                                p="two"
                                                radius="sm"
                                                shadow="subtle"
                                            >
                                                <MantineIcon
                                                    icon={IconComponent}
                                                    size={12}
                                                    stroke={1.8}
                                                    color="indigo.3"
                                                />
                                            </Paper>
                                        }
                                        mt="xs"
                                        title={
                                            <Text fw={400} size="xs" c="gray.7">
                                                {texts[toolName]}
                                            </Text>
                                        }
                                        lineVariant={'dashed'}
                                    >
                                        <ToolCallDescription
                                            toolCall={toolCall}
                                        />
                                    </Timeline.Item>
                                );
                            })}
                        </Timeline>
                    </Stack>
                </ToolCallContainer>
            )}
            {!!improveContextToolCall && (
                <ImproveContextToolCall toolCall={improveContextToolCall} />
            )}
        </Stack>
    );
};
