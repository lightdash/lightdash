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
    Button,
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
    IconPencil,
    IconSchool,
    IconSearch,
    IconSelector,
    IconTable,
    IconTools,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { type FC, type JSX } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useAppendInstructionMutation } from '../../../hooks/useProjectAiAgents';
import { clearImproveContextNotification } from '../../../store/aiAgentThreadStreamSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../../store/hooks';
import { AiChartGenerationToolCallDescription } from './AiChartGenerationToolCallDescription';

const getToolIcon = (toolName: ToolName) => {
    const iconMap: Record<ToolName, (props: TablerIconsProps) => JSX.Element> =
        {
            findExplores: IconDatabase,
            findFields: IconSearch,
            searchFieldValues: IconSelector,
            generateBarVizConfig: IconChartHistogram,
            generateTimeSeriesVizConfig: IconChartLine,
            generateTableVizConfig: IconTable,
            generateDashboard: IconDashboard,
            findDashboards: IconDashboard,
            findCharts: IconChartDots3,
            improveContext: IconSchool,
            proposeChange: IconPencil,
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
        case 'search_field_values':
            const searchFieldValuesArgs = toolArgs as any;
            return (
                <Text c="dimmed" size="xs">
                    Searched for values in field{' '}
                    <Badge
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
                        {searchFieldValuesArgs.fieldId}
                    </Badge>
                    {searchFieldValuesArgs.query && (
                        <>
                            {' '}
                            matching{' '}
                            <Badge
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
                                "{searchFieldValuesArgs.query}"
                            </Badge>
                        </>
                    )}
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
        case AiResultType.PROPOSE_CHANGE:
            return (
                <Text c="dimmed" size="xs">
                    Proposed change to{' '}
                    <Badge
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
                        {toolArgs.change.entityType === 'table'
                            ? toolArgs.entityTableName
                            : toolArgs.change.fieldId}
                    </Badge>
                </Text>
            );
        default:
            return assertUnreachable(toolArgs, `Unknown tool name ${toolName}`);
    }
};

const ImproveContextToolCall: FC<{
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
}> = ({ projectUuid, agentUuid, threadUuid, promptUuid }) => {
    const improveContextNotification = useAiAgentStoreSelector((state) => {
        const thread = state.aiAgentThreadStream[threadUuid];
        if (thread?.messageUuid === promptUuid) {
            return thread.improveContextNotification;
        }
        return null;
    });
    const dispatch = useAiAgentStoreDispatch();

    const appendInstructionMutation = useAppendInstructionMutation(
        projectUuid,
        agentUuid,
    );

    if (!improveContextNotification) {
        return null;
    }

    const handleSave = async () => {
        if (!improveContextNotification) return;

        await appendInstructionMutation.mutateAsync({
            instruction: improveContextNotification.suggestedInstruction,
        });

        dispatch(
            clearImproveContextNotification({
                threadUuid,
            }),
        );
    };

    const handleDismiss = () => {
        dispatch(
            clearImproveContextNotification({
                threadUuid,
            }),
        );
    };

    return (
        <Paper bg="white" p="xs" mb="xs" withBorder>
            <Group gap="xs" align="flex-start" wrap="nowrap">
                <MantineIcon icon={IconSchool} size="md" color="indigo.6" />
                <Stack gap="xs" style={{ flex: 1 }}>
                    <Text fz="xs" fw={500} c="gray.9" lh="normal" m={0}>
                        Save instruction to memory?
                    </Text>

                    <Text
                        fz="xs"
                        c="gray.7"
                        bg="gray.0"
                        p="xs"
                        style={{
                            borderRadius: '4px',
                            fontStyle: 'italic',
                        }}
                    >
                        {improveContextNotification.suggestedInstruction}
                    </Text>
                    <Group justify="flex-end" gap="xs">
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={handleDismiss}
                            disabled={appendInstructionMutation.isLoading}
                        >
                            Dismiss
                        </Button>
                        <Button
                            size="compact-xs"
                            color="indigo"
                            onClick={handleSave}
                            loading={appendInstructionMutation.isLoading}
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Group>
        </Paper>
    );
};

type AiChartToolCallsProps = {
    toolCalls: ToolCallSummary[] | undefined;
    type: ToolCallDisplayType;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({
    toolCalls,
    type,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
}) => {
    const texts =
        type === 'streaming'
            ? TOOL_DISPLAY_MESSAGES
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL;

    const calculationToolCalls = toolCalls?.filter(
        (toolCall) => toolCall.toolName !== 'improveContext',
    );

    if (!toolCalls || toolCalls.length === 0) return null;

    return (
        <>
            {projectUuid && agentUuid && threadUuid && (
                <ImproveContextToolCall
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={threadUuid}
                    promptUuid={promptUuid}
                />
            )}
            {!!calculationToolCalls?.length && (
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
        </>
    );
};
