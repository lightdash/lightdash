import {
    ValidationTarget,
    createTemporaryVirtualView,
    friendlyName,
    isApiError,
    isChartValidationError,
    type Explore,
    type ValidationErrorChartResponse,
    type ValidationResponse,
    type VizColumn,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Center,
    Collapse,
    Group,
    Loader,
    LoadingOverlay,
    Paper,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconAlertHexagon,
    IconPlus,
    IconTableAlias,
    IconTrash,
} from '@tabler/icons-react';
import groupBy from 'lodash/groupBy';
import { memo, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import { useValidationWithResults } from '../../../hooks/validation/useValidation';
import { useSqlQueryRun } from '../../sqlRunner/hooks/useSqlQueryRun';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { compareSqlQueries } from '../../sqlRunner/store/sqlRunnerSlice';
import { useUpdateVirtualView } from '../hooks/useVirtualView';
import { compareColumns, type ColumnDiff } from '../utils/compareColumns';

export type VirtualViewState = {
    name: string;
    label: string;
    sql: string;
    onCloseEditVirtualView: () => void;
};

const DiffListItem: FC<{ diff: ColumnDiff }> = memo(({ diff }) => {
    return (
        <Group gap="xs" wrap="nowrap">
            <MantineIcon
                icon={diff.type === 'deleted' ? IconTrash : IconAlertHexagon}
                color={diff.type === 'deleted' ? 'red' : 'yellow'}
                size={16}
            />
            {diff.type === 'deleted' ? (
                <Text fz="sm" c="gray.7">
                    <Text span fw={600} c="gray.8" fz="sm">
                        {diff.reference}
                    </Text>{' '}
                    has been deleted
                </Text>
            ) : (
                <Text fz="sm" c="gray.7">
                    <Text span fw={600} c="gray.8">
                        {diff.reference}
                    </Text>{' '}
                    type changed:{' '}
                    <Text span fw={500} c="gray.6">
                        {diff.oldType}
                    </Text>{' '}
                    →{' '}
                    <Text span fw={500} c="gray.8">
                        {diff.newType}
                    </Text>
                </Text>
            )}
        </Group>
    );
});

const ChartErrorListItem: FC<{
    chartErrors: ValidationErrorChartResponse[];
    projectUuid: string;
}> = ({ chartErrors, projectUuid }) => {
    const firstError = chartErrors[0];
    const errorMessages = chartErrors.map((error) => error.error);

    return (
        <Group gap="xs" wrap="nowrap">
            <MantineIcon icon={IconAlertHexagon} color="orange" size={16} />
            <Tooltip
                variant="xs"
                withinPortal
                label={
                    <Stack gap={2}>
                        {errorMessages.map((message, index) => (
                            <Text fz={11} key={index}>
                                {message}
                            </Text>
                        ))}
                    </Stack>
                }
                withArrow
                position="right"
                multiline
                maw={300}
            >
                <Anchor
                    href={`/projects/${projectUuid}/saved/${firstError.chartUuid}`}
                    target="_blank"
                    fz="sm"
                    fw={500}
                >
                    {firstError.name}
                </Anchor>
            </Tooltip>
        </Group>
    );
};

// TODO: Move to separate component
const ChangesReviewModal: FC<
    Pick<MantineModalProps, 'opened' | 'onClose'> & {
        columnDiffs: ColumnDiff[];
        chartValidationErrors: ValidationResponse[] | undefined;
        onSave: () => void;
    }
> = ({ opened, onClose, columnDiffs, chartValidationErrors, onSave }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const newColumnsAddedNr = columnDiffs.filter(
        (diff) => diff.type === 'added',
    ).length;
    const affectedColumns = columnDiffs.filter((diff) => diff.type !== 'added');

    const isDiffListTruncated = affectedColumns.length > 3;
    const [showAllDiffs, setShowAllDiffs] = useState(false);
    const visibleDiffs = affectedColumns.slice(0, 3);

    const groupedChartErrors = useMemo(() => {
        if (!chartValidationErrors) return {};
        return groupBy(
            chartValidationErrors.filter(
                (error): error is ValidationErrorChartResponse =>
                    isChartValidationError(error),
            ),
            'chartUuid',
        );
    }, [chartValidationErrors]);

    const chartErrorEntries = Object.entries(groupedChartErrors);
    const isChartErrorsListTruncated = chartErrorEntries.length > 3;
    const [showAllChartErrors, setShowAllChartErrors] = useState(false);
    const visibleChartErrors = chartErrorEntries.slice(0, 3);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Schema changes detected"
            icon={IconAlertCircle}
            actions={
                <Button color="orange" onClick={onSave}>
                    Save Anyway
                </Button>
            }
        >
            <Stack gap="md">
                {/* Column Changes Section */}
                <Stack gap="xs">
                    <Text fz="sm" fw={500} c="ldGray.7">
                        Column changes
                    </Text>
                    <Paper p="sm" radius="md" withBorder bg="ldGray.0">
                        <Stack gap="xs">
                            {newColumnsAddedNr > 0 && (
                                <Group gap="xs">
                                    <MantineIcon
                                        icon={IconPlus}
                                        color="green"
                                        size={16}
                                    />
                                    <Text fz="sm" c="ldGray.7">
                                        {newColumnsAddedNr} new column
                                        {newColumnsAddedNr > 1 ? 's' : ''} added
                                    </Text>
                                </Group>
                            )}
                            {visibleDiffs.map((diff, index) => (
                                <DiffListItem key={index} diff={diff} />
                            ))}
                            <Collapse in={showAllDiffs}>
                                {affectedColumns.slice(3).map((diff, index) => (
                                    <DiffListItem key={index + 3} diff={diff} />
                                ))}
                            </Collapse>
                            {isDiffListTruncated && (
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="ldGray.6"
                                    onClick={() =>
                                        setShowAllDiffs(!showAllDiffs)
                                    }
                                >
                                    {showAllDiffs
                                        ? 'Show less'
                                        : `Show ${
                                              affectedColumns.length - 3
                                          } more`}
                                </Button>
                            )}
                        </Stack>
                    </Paper>
                </Stack>

                {/* Affected Charts Section */}
                {chartErrorEntries.length > 0 && (
                    <Stack gap="xs">
                        <Text fz="sm" fw={500} c="ldGray.7">
                            Affected charts ({chartErrorEntries.length})
                        </Text>
                        <Paper p="sm" radius="md" withBorder bg="ldGray.0">
                            <Stack gap="xs">
                                {visibleChartErrors.map(
                                    ([chartUuid, errors]) => (
                                        <ChartErrorListItem
                                            key={chartUuid}
                                            chartErrors={errors}
                                            projectUuid={projectUuid}
                                        />
                                    ),
                                )}
                                <Collapse in={showAllChartErrors}>
                                    {chartErrorEntries
                                        .slice(3)
                                        .map(([chartUuid, errors]) => (
                                            <ChartErrorListItem
                                                key={chartUuid}
                                                chartErrors={errors}
                                                projectUuid={projectUuid}
                                            />
                                        ))}
                                </Collapse>
                                {isChartErrorsListTruncated && (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="gray"
                                        onClick={() =>
                                            setShowAllChartErrors(
                                                !showAllChartErrors,
                                            )
                                        }
                                    >
                                        {showAllChartErrors
                                            ? 'Show less'
                                            : `Show ${
                                                  chartErrorEntries.length - 3
                                              } more`}
                                    </Button>
                                )}
                            </Stack>
                        </Paper>
                    </Stack>
                )}

                {/* Warning Footer */}
                <Text fz="sm" c="ldGray.6">
                    These changes could break existing content using this
                    virtual view.
                </Text>
            </Stack>
        </MantineModal>
    );
};

export const HeaderVirtualView: FC<{
    virtualViewState: VirtualViewState;
}> = ({ virtualViewState }) => {
    const { showToastError } = useToaster();

    const [initialColumns, setInitialColumns] = useState<
        VizColumn[] | undefined
    >(undefined);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const [columnDiffs, setColumnDiffs] = useState<ColumnDiff[]>([]);
    const [chartValidationErrors, setChartValidationErrors] = useState<
        ValidationResponse[] | undefined
    >(undefined);

    const [showWarningModal, setShowWarningModal] = useState(false);
    const navigate = useNavigate();
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );
    const hasUnrunChanges = useMemo(
        () =>
            compareSqlQueries(
                virtualViewState.sql,
                sql,
                warehouseConnectionType,
            ),
        [sql, virtualViewState.sql, warehouseConnectionType],
    );

    const { mutateAsync: getValidation, isPolling: isRunningValidation } =
        useValidationWithResults(projectUuid);
    const { mutateAsync: runQuery, isLoading: isRunningQuery } =
        useSqlQueryRun(projectUuid);

    const { mutateAsync: updateVirtualView, isLoading: isUpdatingVirtualView } =
        useUpdateVirtualView(projectUuid);

    useEffect(() => {
        if (!columns) {
            return;
        }
        if (!initialColumns) {
            setInitialColumns(columns);
        }
    }, [initialColumns, columns]);
    const [name, setName] = useState(
        virtualViewState.label || friendlyName(virtualViewState.name),
    );

    const handleUpdateVirtualView = async ({
        handleDiff,
    }: {
        handleDiff: boolean;
    }) => {
        console.log('[VirtualView Debug] handleUpdateVirtualView called', {
            handleDiff,
            virtualViewName: virtualViewState.name,
            sql: sql.substring(0, 100) + '...',
        });

        let columnsFromQuery: VizColumn[];
        // Get columns from query regardless of whether the query has run or not
        try {
            const results = await runQuery({ sql, limit: 1 });

            if (results) {
                columnsFromQuery = results.columns;
            } else {
                showToastError({
                    title: 'Error running query',
                    subtitle: 'No results returned',
                });
                return;
            }
        } catch (error: unknown) {
            if (isApiError(error)) {
                showToastError({
                    title: 'Error running query',
                    subtitle: error.error.message,
                });
            }
            return;
        }

        // It's possible that the query returned no columns
        if (!columnsFromQuery) {
            return showToastError({
                title: 'Error running query',
                subtitle: 'No columns returned',
            });
        }

        console.log('[VirtualView Debug] Columns from query:', {
            columnsFromQuery,
            initialColumns,
        });

        // If the user has accepted the diff, we update the virtual view and refresh the page
        if (!handleDiff) {
            await updateVirtualView({
                exploreName: virtualViewState.name,
                projectUuid,
                name,
                sql,
                columns: columnsFromQuery,
            });
            return navigate(0);
        }

        // Create a temporary virtual view so that we can create a preview validation
        const virtualExplore: Explore = createTemporaryVirtualView(
            virtualViewState.name,
            sql,
            columnsFromQuery,
        );

        console.log('[VirtualView Debug] Created temporary virtual view:', {
            exploreName: virtualExplore.name,
            baseTable: virtualExplore.baseTable,
            tables: Object.keys(virtualExplore.tables || {}),
            dimensions: Object.keys(
                virtualExplore.tables?.[virtualExplore.baseTable]?.dimensions ||
                    {},
            ),
        });

        // Validate the virtual view
        console.log('[VirtualView Debug] Calling getValidation...');
        await getValidation({
            explores: [virtualExplore],
            validationTargets: [ValidationTarget.CHARTS],
            onlyValidateExploresInArgs: true,
            onComplete: async (response: ValidationResponse[]) => {
                console.log('[VirtualView Debug] Validation response:', {
                    responseLength: response.length,
                    response,
                    chartErrors: response.filter((r) =>
                        isChartValidationError(r),
                    ),
                });

                if (response.length === 0) {
                    console.log(
                        '[VirtualView Debug] No validation errors, saving directly',
                    );
                    // No errors , we don't need to show warning
                    await updateVirtualView({
                        exploreName: virtualViewState.name,
                        projectUuid,
                        name,
                        sql,
                        columns: columnsFromQuery,
                    });
                    void navigate(0);
                } else {
                    console.log(
                        '[VirtualView Debug] Has validation errors, checking diffs',
                        { handleDiff, hasInitialColumns: !!initialColumns },
                    );

                    if (handleDiff && initialColumns) {
                        setChartValidationErrors(response);
                        const diffs = compareColumns(
                            initialColumns,
                            columnsFromQuery,
                        );

                        console.log('[VirtualView Debug] Column diffs:', {
                            diffs,
                            diffsLength: diffs?.length ?? 0,
                        });

                        // If there are no diffs, we update the virtual view and refresh the page
                        if (!diffs || diffs.length === 0) {
                            console.log(
                                '[VirtualView Debug] No column diffs, saving directly (despite validation errors!)',
                            );
                            await updateVirtualView({
                                exploreName: virtualViewState.name,
                                projectUuid,
                                name,
                                sql,
                                columns: columnsFromQuery,
                            });
                            void navigate(0);
                        } else {
                            // If there are diffs, we show the warning modal
                            console.log(
                                '[VirtualView Debug] Showing warning modal with:',
                                {
                                    columnDiffs: diffs,
                                    chartValidationErrors: response,
                                },
                            );
                            setColumnDiffs(diffs);
                            setShowWarningModal(true);
                        }
                    }
                }
            },
        });
    };

    const hasChanges = useMemo(() => {
        return name !== virtualViewState.label || hasUnrunChanges;
    }, [name, virtualViewState.label, hasUnrunChanges]);

    return (
        <Group
            p="md"
            py="xs"
            justify="space-between"
            className="border-b border-ldGray-3"
        >
            <LoadingOverlay
                visible={
                    isRunningValidation ||
                    isRunningQuery ||
                    isUpdatingVirtualView
                }
                loaderProps={{
                    children: (
                        <Center h="95vh" w="95vw">
                            <Stack align="center" justify="center">
                                <Loader />
                                <Text fw={500}>Validating your changes...</Text>
                            </Stack>
                        </Center>
                    ),
                }}
            />

            <Group gap="xs">
                <Group gap="xs">
                    <Paper p="xxs" withBorder radius="sm">
                        <MantineIcon icon={IconTableAlias} />
                    </Paper>
                    Editing
                    <TextInput
                        fz="sm"
                        fw={500}
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                    />
                </Group>
            </Group>

            <Group gap="sm">
                <Tooltip
                    variant="xs"
                    label="No changes to save"
                    disabled={hasChanges}
                >
                    <Box>
                        <Button
                            size="xs"
                            disabled={
                                isRunningValidation ||
                                isRunningQuery ||
                                !hasChanges
                            }
                            onClick={() =>
                                handleUpdateVirtualView({ handleDiff: true })
                            }
                            color="green"
                        >
                            Save
                        </Button>
                    </Box>
                </Tooltip>
                <Button
                    size="xs"
                    variant="default"
                    onClick={() => {
                        virtualViewState.onCloseEditVirtualView();
                    }}
                >
                    Cancel
                </Button>
            </Group>

            <ChangesReviewModal
                opened={showWarningModal}
                onSave={() => handleUpdateVirtualView({ handleDiff: false })}
                onClose={() => setShowWarningModal(false)}
                columnDiffs={columnDiffs}
                chartValidationErrors={chartValidationErrors}
            />
        </Group>
    );
};
