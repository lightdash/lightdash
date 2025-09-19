import type { AiAgentEvaluationRunSummary } from '@lightdash/common';
import {
    Badge,
    Box,
    Card,
    Group,
    Loader,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconChevronRight, IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentEvaluationRuns,
    useEvaluationRunPolling,
} from '../../hooks/useAiAgentEvaluations';

const statusColors = {
    pending: 'gray',
    running: 'yellow',
    completed: 'green',
    failed: 'red',
} as const;

type Props = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    selectedRunUuid?: string;
};

type RunItemProps = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    run: AiAgentEvaluationRunSummary;
    isSelected: boolean;
    onSelectRun: (run: AiAgentEvaluationRunSummary) => void;
};

const EvalRunItem: FC<RunItemProps> = ({
    projectUuid,
    agentUuid,
    evalUuid,
    run,
    isSelected,
    onSelectRun,
}) => {
    // Start polling for this run if it's pending or running
    useEvaluationRunPolling(projectUuid, agentUuid, evalUuid, run);

    return (
        <Card
            key={run.runUuid}
            p="sm"
            withBorder
            style={{
                cursor: run.status === 'pending' ? 'not-allowed' : 'pointer',
                opacity: run.status === 'pending' ? 0.6 : 1,
                borderColor: isSelected
                    ? 'var(--mantine-color-blue-5)'
                    : undefined,
            }}
            onClick={() => {
                if (run.status !== 'pending') {
                    onSelectRun(run);
                }
            }}
        >
            <Group justify="space-between" align="center">
                <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                        <Badge
                            color={statusColors[run.status]}
                            variant="light"
                            size="sm"
                        >
                            {run.status}
                        </Badge>
                        <Text size="sm" fw={500}>
                            Run {run.runUuid.slice(-8)}
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                        Started {new Date(run.createdAt).toLocaleString()}
                        {run.completedAt && (
                            <>
                                {' '}
                                • Completed{' '}
                                {new Date(run.completedAt).toLocaleString()}
                            </>
                        )}
                    </Text>
                </Stack>
                <Group gap="sm">
                    {run.status !== 'pending' && (
                        <MantineIcon icon={IconChevronRight} />
                    )}
                </Group>
            </Group>
        </Card>
    );
};

export const EvalRuns: FC<Props> = ({
    projectUuid,
    agentUuid,
    evalUuid,
    selectedRunUuid,
}) => {
    const navigate = useNavigate();

    const { data: runsData, isLoading: isLoadingRuns } =
        useAiAgentEvaluationRuns(projectUuid, agentUuid, evalUuid);

    const runs = runsData?.data?.runs;

    const handleSelectRun = (run: AiAgentEvaluationRunSummary) => {
        void navigate(
            `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evalUuid}/run/${run.runUuid}`,
        );
    };

    if (isLoadingRuns) {
        return (
            <Box style={{ display: 'flex', justifyContent: 'center', p: 20 }}>
                <Loader />
            </Box>
        );
    }

    return (
        <Stack gap="md">
            <Title order={5}>Previous Runs</Title>

            {!runs || runs.length === 0 ? (
                <Paper
                    p="xl"
                    shadow="subtle"
                    component={Stack}
                    gap="xxs"
                    align="center"
                    withBorder
                    style={{ borderStyle: 'dashed' }}
                >
                    <MantineIcon icon={IconClock} size="lg" color="dimmed" />
                    <Title order={5}>No evaluation runs yet</Title>
                    <Text size="sm" c="dimmed" ta="center">
                        Run this evaluation to see the results and performance
                        metrics.
                    </Text>
                </Paper>
            ) : (
                <ScrollArea mah={600}>
                    <Stack gap="sm">
                        {runs.map((run) => (
                            <EvalRunItem
                                key={run.runUuid}
                                projectUuid={projectUuid}
                                agentUuid={agentUuid}
                                evalUuid={evalUuid}
                                run={run}
                                isSelected={run.runUuid === selectedRunUuid}
                                onSelectRun={handleSelectRun}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            )}
        </Stack>
    );
};
