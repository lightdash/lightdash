import type { AiAgentEvaluationRunSummary } from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCircleDotted,
    IconClock,
    IconX,
} from '@tabler/icons-react';
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
    useAiAgentEvaluationRuns,
    useEvaluationRunPolling,
} from '../../hooks/useAiAgentEvaluations';
import { isRunning, statusConfig } from './utils';

type Props = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
};

export const EvalRuns: FC<Props> = ({ projectUuid, agentUuid, evalUuid }) => {
    const navigate = useNavigate();
    const theme = useMantineTheme();

    const { data: runsData, isLoading: isLoadingRuns } =
        useAiAgentEvaluationRuns(projectUuid, agentUuid, evalUuid);

    const runs = useMemo(
        () => runsData?.data?.runs ?? [],
        [runsData?.data?.runs],
    );

    // Poll for any active (running/pending) run to keep the list updated
    const activeRun = useMemo(() => {
        return runs.find(
            (run) => run.status === 'pending' || run.status === 'running',
        );
    }, [runs]);

    // Enable polling only if there's an active run
    useEvaluationRunPolling(projectUuid, agentUuid, evalUuid, activeRun);

    const handleSelectRun = (run: AiAgentEvaluationRunSummary) => {
        void navigate(
            `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evalUuid}/run/${run.runUuid}`,
        );
    };

    const columns: MRT_ColumnDef<AiAgentEvaluationRunSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'runUuid',
                header: 'Run ID',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => (
                    <Text fz="sm" fw={500}>
                        {row.original.runUuid.slice(-8)}
                    </Text>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Run Status',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => {
                    const evalStatus = statusConfig[row.original.status];
                    return (
                        <Badge
                            color={evalStatus.color}
                            variant="dot"
                            size="sm"
                            radius="sm"
                            c="ldGray.7"
                            style={{ border: 'none' }}
                        >
                            {evalStatus.label}
                        </Badge>
                    );
                },
            },
            {
                accessorKey: 'assessment',
                header: 'Assessment',
                enableSorting: false,
                size: 140,
                Cell: ({ row }) => {
                    const run = row.original;
                    return isRunning(run.status) ? (
                        <Tooltip label="Running">
                            <Loader size={12} color="gray" />
                        </Tooltip>
                    ) : !run.passedAssessments && !run.failedAssessments ? (
                        <Tooltip label="No assessments available">
                            <MantineIcon
                                icon={IconCircleDotted}
                                color="ldGray.6"
                            />
                        </Tooltip>
                    ) : (
                        <Group gap="sm">
                            {run.passedAssessments > 0 && (
                                <Group gap={2}>
                                    <MantineIcon
                                        icon={IconCheck}
                                        color="green.8"
                                    />
                                    <Text fz="xs" c="green.8" fw={500}>
                                        {run.passedAssessments}
                                    </Text>
                                </Group>
                            )}
                            {run.failedAssessments > 0 && (
                                <Group gap={2}>
                                    <MantineIcon icon={IconX} color="red.8" />
                                    <Text fz="xs" c="red.8" fw={500}>
                                        {run.failedAssessments}
                                    </Text>
                                </Group>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: false,
                size: 180,
                Cell: ({ row }) => {
                    const run = row.original;
                    const createdAt = run.createdAt
                        ? dayjs(run.createdAt).format('DD/MM/YYYY HH:mm:ss')
                        : '-';
                    const completedAt = run.completedAt
                        ? dayjs(run.completedAt).format('DD/MM/YYYY HH:mm:ss')
                        : '-';
                    return (
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
                            <Text fz="sm" c="ldGray.6">
                                {createdAt}
                            </Text>
                        </Tooltip>
                    );
                },
            },
            {
                accessorKey: 'duration',
                header: 'Duration',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => {
                    const run = row.original;
                    const runDuration = run.completedAt
                        ? dayjs
                              .utc(
                                  dayjs
                                      .duration(
                                          dayjs(run.completedAt).diff(
                                              dayjs(run.createdAt),
                                          ),
                                      )
                                      .asMilliseconds(),
                              )
                              .format('mm[m]ss[s]')
                        : '-';
                    return (
                        <Text fz="sm" c="ldGray.6">
                            {runDuration}
                        </Text>
                    );
                },
            },
        ],
        [],
    );

    const table = useMantineReactTable({
        columns,
        data: runs,
        enableSorting: false,
        enableColumnActions: false,
        enablePagination: false,
        enableBottomToolbar: false,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleSelectRun(row.original),
            style: {
                cursor: 'pointer',
            },
        }),
        state: {
            isLoading: isLoadingRuns,
        },
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            style: { maxHeight: '320px' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(runs.length),
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

    if (isLoadingRuns) {
        return (
            <Box style={{ display: 'flex', justifyContent: 'center', p: 20 }}>
                <Loader />
            </Box>
        );
    }

    return (
        <Stack gap="xs">
            <Title order={5} c="ldGray.9" fw={500}>
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
                <MantineReactTable table={table} />
            )}
        </Stack>
    );
};
