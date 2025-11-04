import type { AiAgentEvaluationRunResult } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Center,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconPoint, IconPointFilled, IconTarget } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentEvaluationRunResults,
    useEvaluationRunPolling,
} from '../../hooks/useAiAgentEvaluations';
import { useEvalSectionContext } from '../../hooks/useEvalSectionContext';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { getAssessmentConfig, isRunning, statusConfig } from './utils';

type Props = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    runUuid: string;
};

type PromptRowProps = {
    projectUuid: string;
    agentUuid: string;
    result: AiAgentEvaluationRunResult;
    index: number;
    onViewThread: (result: AiAgentEvaluationRunResult) => void;
};

const PromptRow: FC<PromptRowProps> = ({
    projectUuid,
    agentUuid,
    result,
    index,
    onViewThread,
}) => {
    const statusStyle = statusConfig[result.status];
    // Fetch the thread to get the actual prompt text
    const { data: thread } = useAiAgentThread(
        projectUuid,
        agentUuid,
        result.threadUuid,
        {
            enabled: !!result.threadUuid,
        },
    );

    // Get the latest user message from the thread
    const promptText = useMemo(() => {
        if (!thread?.messages) return `Prompt ${index + 1}`;

        // Find the last user message in the thread
        const userMessages = thread.messages.filter(
            (msg) => msg.role === 'user',
        );
        const lastUserMessage = userMessages[userMessages.length - 1];

        return lastUserMessage?.message || `Prompt ${index + 1}`;
    }, [thread?.messages, index]);

    const isEvalRunning = isRunning(result.status);

    const handleRowClick = () => {
        if (!isEvalRunning && result.threadUuid) {
            onViewThread(result);
        }
    };

    const isClickable = !isEvalRunning && result.threadUuid;
    const assessmentConfig = getAssessmentConfig(result.assessment?.passed);
    return (
        <Table.Tr
            style={{
                cursor: isClickable ? 'pointer' : 'default',
            }}
            onClick={handleRowClick}
        >
            <Table.Td>
                <Text size="sm" fw={500} c="dimmed">
                    {index + 1}
                </Text>
            </Table.Td>
            <Table.Td maw="300px">
                <Text size="sm" title={promptText} truncate>
                    {promptText}
                </Text>
            </Table.Td>
            <Table.Td>
                <Tooltip
                    label={result.errorMessage}
                    disabled={result.status !== 'failed'}
                >
                    <Text c={statusStyle.color}>
                        <MantineIcon
                            icon={isEvalRunning ? IconPoint : IconPointFilled}
                        />
                    </Text>
                </Tooltip>
            </Table.Td>

            <Table.Td>
                {isEvalRunning ? (
                    <Badge w={68} variant="white" color="gray">
                        {result.status === 'assessing' ? (
                            <Loader size={12} color="gray" />
                        ) : (
                            <>...</>
                        )}
                    </Badge>
                ) : (
                    <Badge color={assessmentConfig.color} variant="white">
                        {assessmentConfig.label}
                    </Badge>
                )}
            </Table.Td>
        </Table.Tr>
    );
};

export const EvalRunDetails: FC<Props> = ({
    projectUuid,
    agentUuid,
    evalUuid,
    runUuid,
}) => {
    const navigate = useNavigate();
    const { setSelectedThreadUuid } = useEvalSectionContext();

    const { data: runData, isLoading } = useAiAgentEvaluationRunResults(
        projectUuid,
        agentUuid,
        evalUuid,
        runUuid,
    );

    useEvaluationRunPolling(
        projectUuid,
        agentUuid,
        evalUuid,
        runData
            ? {
                  runUuid: runData.runUuid,
                  status: runData.status,
              }
            : undefined,
    );

    const handleBack = () => {
        void navigate(
            `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evalUuid}`,
        );
    };

    const handleViewThread = (result: AiAgentEvaluationRunResult) => {
        if (result.threadUuid) {
            setSelectedThreadUuid(result.threadUuid);
        }
    };

    // Calculate summary stats
    const summaryStats = useMemo(() => {
        if (!runData?.results) return null;

        const completed = runData.results.filter(
            (r) => r.status === 'completed',
        ).length;
        const failed = runData.results.filter(
            (r) => r.status === 'failed',
        ).length;
        const running = runData.results.filter(
            (r) => r.status === 'running',
        ).length;
        const pending = runData.results.filter(
            (r) => r.status === 'pending',
        ).length;

        return {
            completed,
            failed,
            running,
            pending,
            total: runData.results.length,
        };
    }, [runData?.results]);

    if (isLoading) {
        return (
            <Center p="md">
                <Loader />
            </Center>
        );
    }

    if (!runData) {
        return (
            <Stack gap="md">
                <Button variant="subtle" onClick={handleBack} size="sm">
                    ← Back to Evaluation
                </Button>
                <Text>Evaluation run not found</Text>
            </Stack>
        );
    }

    const runDuration = dayjs
        .utc(
            dayjs
                .duration(
                    dayjs(runData.completedAt).diff(dayjs(runData.createdAt)),
                )
                .asMilliseconds(),
        )
        .format('mm[m]ss[s]');

    const evalStatus = statusConfig[runData.status];
    return (
        <Stack gap="sm" pr="sm">
            <Paper>
                <Group
                    justify="space-between"
                    align="center"
                    gap="xs"
                    py="sm"
                    px="sm"
                >
                    <Group gap="xs">
                        <Paper p="xxs" withBorder radius="sm">
                            <MantineIcon icon={IconTarget} size="md" />
                        </Paper>
                        <Title order={5} c="gray.9" fw={700}>
                            Run Overview
                        </Title>
                    </Group>

                    <Group>
                        {!isRunning(runData.status) && (
                            <Tooltip
                                label={
                                    <Text size="xs">
                                        Started{' '}
                                        {new Date(
                                            runData.createdAt,
                                        ).toLocaleString()}
                                        {runData.completedAt && (
                                            <>
                                                {' '}
                                                • Completed{' '}
                                                {new Date(
                                                    runData.completedAt,
                                                ).toLocaleString()}
                                            </>
                                        )}
                                    </Text>
                                }
                            >
                                <Text size="xs" c="dimmed">
                                    Duration: {runDuration}
                                </Text>
                            </Tooltip>
                        )}
                        <Badge
                            color={evalStatus.color}
                            variant="dot"
                            size="lg"
                            radius="sm"
                            c="gray.7"
                        >
                            {evalStatus.label}
                        </Badge>
                    </Group>
                </Group>

                <Divider />
                <Box>
                    <Table highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th miw={30}>#</Table.Th>
                                <Table.Th>Prompt</Table.Th>
                                <Table.Th miw={115}>Eval Status</Table.Th>
                                <Table.Th miw={120}>Assessment</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {runData.results.map((result, index) => (
                                <PromptRow
                                    key={result.resultUuid}
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                    result={result}
                                    index={index}
                                    onViewThread={handleViewThread}
                                />
                            ))}
                        </Table.Tbody>
                    </Table>
                    <Divider />

                    <Group justify="flex-end" pr="sm" py="sm">
                        {summaryStats && (
                            <Text size="xs" fw={500} fs="italic" c="dimmed">
                                {summaryStats.completed + summaryStats.failed} /{' '}
                                {summaryStats.total} completed
                            </Text>
                        )}
                    </Group>
                </Box>
            </Paper>

            {(!runData.results || runData.results.length === 0) && (
                <Paper
                    p="xl"
                    withBorder
                    style={{
                        borderStyle: 'dashed',
                        backgroundColor: 'transparent',
                    }}
                >
                    <Text size="sm" c="dimmed" ta="center">
                        No results available for this run.
                    </Text>
                </Paper>
            )}
        </Stack>
    );
};
