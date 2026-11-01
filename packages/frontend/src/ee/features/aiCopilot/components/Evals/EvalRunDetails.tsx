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
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconPoint, IconPointFilled, IconTarget } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentEvaluationRunResults,
    useEvaluationRunPolling,
} from '../../hooks/useAiAgentEvaluations';
import { useEvalSectionContext } from '../../hooks/useEvalSectionContext';
import { getAssessmentConfig, isRunning, statusConfig } from './utils';

type Props = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
    runUuid: string;
};

export const EvalRunDetails: FC<Props> = ({
    projectUuid,
    agentUuid,
    evalUuid,
    runUuid,
}) => {
    const navigate = useNavigate();
    const { setSelectedThreadUuid, selectedThreadUuid } =
        useEvalSectionContext();

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

    const columns: ContentTableColumnDef<AiAgentEvaluationRunResult>[] =
        useMemo(
            () => [
                {
                    accessorKey: 'index',
                    header: '#',
                    enableSorting: false,
                    size: 60,
                    Cell: ({ row }) => (
                        <Text fz="sm" fw={500} c="dimmed">
                            {row.index + 1}
                        </Text>
                    ),
                },
                {
                    accessorKey: 'prompt',
                    header: 'Prompt',
                    enableSorting: false,
                    size: 300,
                    Cell: ({ row }) => {
                        const promptText =
                            row.original.prompt || `Prompt ${row.index + 1}`;
                        return (
                            <Text fz="sm" title={promptText} truncate maw={300}>
                                {promptText}
                            </Text>
                        );
                    },
                },
                {
                    accessorKey: 'status',
                    header: 'Eval Status',
                    enableSorting: false,
                    size: 115,
                    Cell: ({ row }) => {
                        const result = row.original;
                        const statusStyle = statusConfig[result.status];
                        const isEvalRunning = isRunning(result.status);
                        return (
                            <Tooltip
                                label={result.errorMessage}
                                disabled={result.status !== 'failed'}
                            >
                                <Text c={statusStyle.color}>
                                    <MantineIcon
                                        icon={
                                            isEvalRunning
                                                ? IconPoint
                                                : IconPointFilled
                                        }
                                    />
                                </Text>
                            </Tooltip>
                        );
                    },
                },
                {
                    accessorKey: 'assessment',
                    header: 'Assessment',
                    enableSorting: false,
                    size: 120,
                    Cell: ({ row }) => {
                        const result = row.original;
                        const isEvalRunning = isRunning(result.status);
                        const assessmentConfig = getAssessmentConfig(
                            result.assessment?.passed,
                        );
                        return isEvalRunning ? (
                            <Badge w={68} variant="transparent">
                                {result.status === 'assessing' ? (
                                    <Loader size={12} color="gray" />
                                ) : (
                                    <>...</>
                                )}
                            </Badge>
                        ) : (
                            <Badge
                                color={assessmentConfig.color}
                                variant="transparent"
                            >
                                {assessmentConfig.label}
                            </Badge>
                        );
                    },
                },
            ],
            [],
        );

    const table = useContentTable({
        columns,
        data: runData?.results ?? [],
        enableSorting: false,
        enablePagination: false,
        enableBottomToolbar: false,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        mantineTableBodyRowProps: ({ row }) => {
            const result = row.original;
            const isEvalRunning = isRunning(result.status);
            const isClickable = !isEvalRunning && result.threadUuid;
            const selected = result.threadUuid === selectedThreadUuid;

            return {
                onClick: isClickable
                    ? () => handleViewThread(result)
                    : undefined,
                'data-selected': selected || undefined,
            };
        },
        state: {
            isLoading,
        },
        mantinePaperProps: { bd: 'none' },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(runData?.results?.length),
        },
        mantineTableBodyCellProps: { h: 48 },
    });

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
                        <Paper p="xxs" radius="sm">
                            <MantineIcon icon={IconTarget} size="md" />
                        </Paper>
                        <Title order={5}>Run Overview</Title>
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
                            c="dimmed"
                        >
                            {evalStatus.label}
                        </Badge>
                    </Group>
                </Group>

                <Divider />
                <Box>
                    <ContentTable table={table} />
                </Box>
                <Divider />

                <Group justify="flex-end" pr="sm" py="sm">
                    {summaryStats && (
                        <Text size="xs" fw={500} fs="italic" c="dimmed">
                            {summaryStats.completed + summaryStats.failed} /{' '}
                            {summaryStats.total} completed
                        </Text>
                    )}
                </Group>
            </Paper>

            {(!runData.results || runData.results.length === 0) && (
                <Paper variant="dotted" p="xl">
                    <Text size="sm" c="dimmed" ta="center">
                        No results available for this run.
                    </Text>
                </Paper>
            )}
        </Stack>
    );
};
