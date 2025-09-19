import type { AiAgentEvaluationRunResult } from '@lightdash/common';
import {
    Badge,
    Button,
    Card,
    Center,
    Group,
    Loader,
    Paper,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconCheck,
    IconClock,
    IconPlayerPlay,
    IconX,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentEvaluationRunResults } from '../../hooks/useAiAgentEvaluations';
import { useEvalTabContext } from '../../hooks/useEvalTabContext';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';

type Props = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    runUuid: string;
};

type StatusConfig = {
    icon: typeof IconCheck;
    color: string;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
    completed: { icon: IconCheck, color: 'green' },
    failed: { icon: IconX, color: 'red' },
    running: { icon: IconPlayerPlay, color: 'yellow' },
    pending: { icon: IconClock, color: 'gray' },
};

const getStatusConfig = (status: string): StatusConfig =>
    STATUS_CONFIG[status] || STATUS_CONFIG.pending;

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
    const statusConfig = getStatusConfig(result.status);

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

    const handleRowClick = () => {
        if (result.status === 'completed' && result.threadUuid) {
            onViewThread(result);
        }
    };

    const isClickable = result.status === 'completed' && result.threadUuid;

    return (
        <Table.Tr
            style={{
                cursor: isClickable ? 'pointer' : 'default',
            }}
            onClick={handleRowClick}
        >
            <Table.Td style={{ width: 50 }}>
                <Text size="sm" fw={500} c="dimmed">
                    {index + 1}
                </Text>
            </Table.Td>
            <Table.Td>
                <Text size="sm" title={promptText} truncate>
                    {promptText}
                </Text>
            </Table.Td>
            <Table.Td style={{ width: 120 }}>
                <Badge
                    variant="light"
                    color={statusConfig.color}
                    leftSection={
                        <MantineIcon
                            icon={statusConfig.icon}
                            color={statusConfig.color}
                            size="sm"
                        />
                    }
                >
                    {result.status}
                </Badge>
            </Table.Td>
            <Table.Td style={{ width: 100 }}>
                {result.status === 'failed' && result.errorMessage && (
                    <Button
                        variant="subtle"
                        size="xs"
                        color="red"
                        leftSection={
                            <MantineIcon icon={IconAlertCircle} size="sm" />
                        }
                        title={result.errorMessage}
                        onClick={(e) => e.stopPropagation()}
                    >
                        Error
                    </Button>
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
    const { setSelectedThreadUuid } = useEvalTabContext();

    const { data: runData, isLoading } = useAiAgentEvaluationRunResults(
        projectUuid,
        agentUuid,
        evalUuid,
        runUuid,
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

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Button variant="subtle" onClick={handleBack} size="sm">
                    ← Back to Evaluation
                </Button>
            </Group>

            <Card p="md" withBorder>
                <Stack gap="sm">
                    <Group justify="space-between" align="center">
                        <Title order={4}>
                            Evaluation Run {runUuid.slice(-8)}
                        </Title>
                        <Badge
                            variant="light"
                            color={getStatusConfig(runData.status).color}
                            leftSection={
                                <MantineIcon
                                    icon={getStatusConfig(runData.status).icon}
                                    size="sm"
                                />
                            }
                        >
                            {runData.status}
                        </Badge>
                    </Group>

                    {summaryStats && (
                        <Group gap="md">
                            <Text size="sm" c="dimmed">
                                <Text component="span" fw={500} c="green">
                                    {summaryStats.completed}
                                </Text>{' '}
                                completed
                            </Text>
                            {summaryStats.failed > 0 && (
                                <Text size="sm" c="dimmed">
                                    <Text component="span" fw={500} c="red">
                                        {summaryStats.failed}
                                    </Text>{' '}
                                    failed
                                </Text>
                            )}
                            {summaryStats.running > 0 && (
                                <Text size="sm" c="dimmed">
                                    <Text component="span" fw={500} c="yellow">
                                        {summaryStats.running}
                                    </Text>{' '}
                                    running
                                </Text>
                            )}
                            {summaryStats.pending > 0 && (
                                <Text size="sm" c="dimmed">
                                    <Text component="span" fw={500} c="gray">
                                        {summaryStats.pending}
                                    </Text>{' '}
                                    pending
                                </Text>
                            )}
                        </Group>
                    )}

                    <Group gap="md">
                        <Text size="sm" c="dimmed">
                            Started:{' '}
                            {new Date(runData.createdAt).toLocaleString()}
                        </Text>
                        {runData.completedAt && (
                            <Text size="sm" c="dimmed">
                                Completed:{' '}
                                {new Date(runData.completedAt).toLocaleString()}
                            </Text>
                        )}
                    </Group>
                </Stack>
            </Card>

            <Card p="md" withBorder>
                <Stack gap="sm">
                    <Title order={5}>Prompt Results</Title>

                    {!runData.results || runData.results.length === 0 ? (
                        <Paper
                            p="md"
                            withBorder
                            style={{ borderStyle: 'dashed' }}
                        >
                            <Text size="sm" c="dimmed" ta="center">
                                No results available for this run.
                            </Text>
                        </Paper>
                    ) : (
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th style={{ width: 50 }}>#</Table.Th>
                                    <Table.Th>Prompt</Table.Th>
                                    <Table.Th style={{ width: 120 }}>
                                        Status
                                    </Table.Th>
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
                    )}
                </Stack>
            </Card>
        </Stack>
    );
};
