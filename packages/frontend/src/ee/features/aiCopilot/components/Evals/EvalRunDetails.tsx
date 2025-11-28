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
    useMantineTheme,
} from '@mantine-8/core';
import { IconPoint, IconPointFilled, IconTarget } from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
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
    const theme = useMantineTheme();
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

    const columns: MRT_ColumnDef<AiAgentEvaluationRunResult>[] = useMemo(
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
                        <Badge w={68} variant="transparent" color="gray">
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

    const table = useMantineReactTable({
        columns,
        data: runData?.results ?? [],
        enableSorting: false,
        enableColumnActions: false,
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
                onClick: () => {
                    if (isClickable) {
                        handleViewThread(result);
                    }
                },
                style: {
                    cursor: isClickable ? 'pointer' : 'default',
                    backgroundColor: selected
                        ? 'var(--mantine-color-ldGray-1)'
                        : undefined,
                },
            };
        },
        state: {
            isLoading,
        },
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: 'none',
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(runData?.results?.length),
        },
        mantineTableHeadCellProps: (props) => {
            const isFirstColumn =
                props.table.getAllColumns().indexOf(props.column) === 0;
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn || isFirstColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
            };
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyCellProps: () => {
            return {
                h: 48,
                style: {
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
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
                        <Paper p="xxs" withBorder radius="sm">
                            <MantineIcon icon={IconTarget} size="md" />
                        </Paper>
                        <Title order={5} c="ldGray.9" fw={700}>
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
                            c="ldGray.7"
                        >
                            {evalStatus.label}
                        </Badge>
                    </Group>
                </Group>

                <Divider />
                <Box>
                    <MantineReactTable table={table} />
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
