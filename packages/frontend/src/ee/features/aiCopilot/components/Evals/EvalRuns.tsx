import type { AiAgentEvaluationRunSummary } from '@lightdash/common';
import {
    Badge,
    Box,
    Loader,
    Paper,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconClock } from '@tabler/icons-react';
import dayjs from 'dayjs';
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
};

type RunRowProps = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    run: AiAgentEvaluationRunSummary;
    onSelectRun: (run: AiAgentEvaluationRunSummary) => void;
};

const EvalRunRow: FC<RunRowProps> = ({
    projectUuid,
    agentUuid,
    evalUuid,
    run,
    onSelectRun,
}) => {
    // Start polling for this run if it's pending or running
    useEvaluationRunPolling(projectUuid, agentUuid, evalUuid, run);

    const runDuration = run.completedAt
        ? dayjs
              .utc(
                  dayjs
                      .duration(
                          dayjs(run.completedAt).diff(dayjs(run.createdAt)),
                      )
                      .asMilliseconds(),
              )
              .format('mm[m]ss[s]')
        : '-';

    const createdAt = run.createdAt
        ? dayjs(run.createdAt).format('DD/MM/YYYY HH:mm:ss')
        : '-';
    const completedAt = run.completedAt
        ? dayjs(run.completedAt).format('DD/MM/YYYY HH:mm:ss')
        : '-';

    return (
        <Table.Tr
            key={run.runUuid}
            style={{
                cursor: 'pointer',
            }}
            onClick={() => onSelectRun(run)}
        >
            <Table.Td>
                <Text size="sm" fw={500}>
                    {run.runUuid.slice(-8)}
                </Text>
            </Table.Td>
            <Table.Td>
                <Badge
                    color={statusColors[run.status]}
                    variant="light"
                    size="sm"
                    radius="sm"
                >
                    {run.status}
                </Badge>
            </Table.Td>
            <Table.Td>
                <Tooltip
                    withinPortal
                    position="left-start"
                    label={
                        <Text size="xs">
                            Started {createdAt}
                            {run.completedAt && (
                                <>
                                    <br />
                                    Completed {completedAt}
                                </>
                            )}
                        </Text>
                    }
                >
                    <Text size="sm" c="dimmed">
                        {createdAt}
                    </Text>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Text size="sm" c="dimmed">
                    {runDuration}
                </Text>
            </Table.Td>
        </Table.Tr>
    );
};

export const EvalRuns: FC<Props> = ({ projectUuid, agentUuid, evalUuid }) => {
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
        <Stack gap="xs">
            <Title order={5} c="gray.9" fw={500}>
                Previous Runs
            </Title>

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
                <Paper p="sm">
                    <Table.ScrollContainer maxHeight={320} minWidth={500}>
                        <Table highlightOnHover stickyHeader>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Run ID</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Created</Table.Th>
                                    <Table.Th>Duration</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {runs.map((run) => (
                                    <EvalRunRow
                                        key={run.runUuid}
                                        projectUuid={projectUuid}
                                        agentUuid={agentUuid}
                                        evalUuid={evalUuid}
                                        run={run}
                                        onSelectRun={handleSelectRun}
                                    />
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}
        </Stack>
    );
};
