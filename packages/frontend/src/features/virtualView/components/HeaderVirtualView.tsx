import {
    createTemporaryVirtualView,
    friendlyName,
    isApiError,
    isChartValidationError,
    ValidationTarget,
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
    List,
    Loader,
    LoadingOverlay,
    Modal,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconAlertHexagon,
    IconPlus,
    IconTableAlias,
    IconTrash,
} from '@tabler/icons-react';
import { groupBy } from 'lodash';
import { memo, useEffect, useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
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
        <List.Item
            fz="xs"
            icon={
                <MantineIcon
                    icon={
                        diff.type === 'deleted' ? IconTrash : IconAlertHexagon
                    }
                    color={diff.type === 'deleted' ? 'red' : 'yellow'}
                />
            }
        >
            {diff.type === 'deleted' ? (
                <Text>
                    <Text span fw={500}>
                        {diff.reference}
                    </Text>{' '}
                    has been deleted
                </Text>
            ) : (
                <Text>
                    <Text span fw={500}>
                        {diff.reference}
                    </Text>{' '}
                    type changed from{' '}
                    <Text span fw={500}>
                        {diff.oldType}
                    </Text>{' '}
                    →{' '}
                    <Text span fw={500}>
                        {diff.newType}
                    </Text>
                </Text>
            )}
        </List.Item>
    );
});

const ChartErrorListItem: FC<{
    chartErrors: ValidationErrorChartResponse[];
    projectUuid: string;
}> = ({ chartErrors, projectUuid }) => {
    const firstError = chartErrors[0];
    const errorMessages = chartErrors.map((error) => error.error);

    return (
        <List.Item
            icon={<MantineIcon icon={IconAlertHexagon} color="orange" />}
            styles={{
                itemWrapper: {
                    alignItems: 'center',
                },
            }}
        >
            {/* Necessary for correct alignment between the icon and the text */}
            <Text lh={0}>
                <Tooltip
                    variant="xs"
                    withinPortal
                    label={
                        <Stack spacing={0}>
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
                    width={300}
                >
                    <Anchor
                        href={`/projects/${projectUuid}/saved/${firstError.chartUuid}`}
                        target="_blank"
                        fz="xs"
                        fw={500}
                    >
                        {firstError.name}
                    </Anchor>
                </Tooltip>
            </Text>
        </List.Item>
    );
};

// TODO: Move to separate component
const ChangesReviewModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
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
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconAlertCircle} color="orange" />
                    <Text fw={500}>Schema changes detected</Text>
                </Group>
            }
        >
            <Stack spacing="xs">
                <Text fz="xs">Your changes rename or delete a field.</Text>

                <Stack
                    spacing={0}
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[3]}`,
                        borderRadius: theme.radius.md,
                        padding: theme.spacing.xs,
                        backgroundColor: theme.colors.gray[0],
                    })}
                >
                    <List>
                        {newColumnsAddedNr > 0 && (
                            <List.Item
                                icon={
                                    <MantineIcon
                                        icon={IconPlus}
                                        color="green"
                                    />
                                }
                            >
                                <Text fz="xs">
                                    {newColumnsAddedNr} new column(s) added
                                </Text>
                            </List.Item>
                        )}
                        {visibleDiffs.map((diff, index) => (
                            <DiffListItem key={index} diff={diff} />
                        ))}
                    </List>
                    {isDiffListTruncated && (
                        <>
                            <Collapse in={showAllDiffs}>
                                <List>
                                    {affectedColumns
                                        .slice(3)
                                        .map((diff, index) => (
                                            <DiffListItem
                                                key={index + 3}
                                                diff={diff}
                                            />
                                        ))}
                                </List>
                            </Collapse>
                            <Button
                                compact
                                ml="auto"
                                variant="default"
                                size="xs"
                                onClick={() => setShowAllDiffs(!showAllDiffs)}
                            >
                                {showAllDiffs ? 'Show Less' : 'Show More'}
                            </Button>
                        </>
                    )}
                </Stack>
                {chartErrorEntries.length > 0 && (
                    <>
                        <Text fz="xs">
                            The following charts will be affected:
                        </Text>
                        <Stack
                            spacing={0}
                            sx={(theme) => ({
                                border: `1px solid ${theme.colors.gray[3]}`,
                                borderRadius: theme.radius.md,
                                padding: theme.spacing.xs,
                                backgroundColor: theme.colors.gray[0],
                            })}
                        >
                            <List>
                                {visibleChartErrors.map(
                                    ([chartUuid, errors]) => (
                                        <ChartErrorListItem
                                            key={chartUuid}
                                            chartErrors={errors}
                                            projectUuid={projectUuid}
                                        />
                                    ),
                                )}
                            </List>
                            {isChartErrorsListTruncated && (
                                <>
                                    <Collapse in={showAllChartErrors}>
                                        <List>
                                            {chartErrorEntries
                                                .slice(3)
                                                .map(([chartUuid, errors]) => (
                                                    <ChartErrorListItem
                                                        key={chartUuid}
                                                        chartErrors={errors}
                                                        projectUuid={
                                                            projectUuid
                                                        }
                                                    />
                                                ))}
                                        </List>
                                    </Collapse>
                                    <Button
                                        compact
                                        ml="auto"
                                        variant="default"
                                        size="xs"
                                        onClick={() =>
                                            setShowAllChartErrors(
                                                !showAllChartErrors,
                                            )
                                        }
                                    >
                                        {showAllChartErrors
                                            ? 'Show Less'
                                            : 'Show More'}
                                    </Button>
                                </>
                            )}
                        </Stack>
                    </>
                )}
                <Text fz="xs" fw={500} mt="md">
                    These changes could break existing content using this
                    virtual view. <br />
                    Are you sure you want to save these changes?
                </Text>
            </Stack>
            <Group position="right" spacing="xs" mt="md">
                <Button variant="outline" onClick={onClose}>
                    Cancel
                </Button>
                <Button onClick={onSave}>Save Anyway</Button>
            </Group>
        </Modal>
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
    const history = useHistory();
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

        // If the user has accepted the diff, we update the virtual view and refresh the page
        if (!handleDiff) {
            await updateVirtualView({
                exploreName: virtualViewState.name,
                projectUuid,
                name,
                sql,
                columns: columnsFromQuery,
            });
            return history.go(0);
        }

        // Create a temporary virtual view so that we can create a preview validation
        const virtualExplore: Explore = createTemporaryVirtualView(
            virtualViewState.name,
            sql,
            columnsFromQuery,
        );

        // Validate the virtual view
        await getValidation({
            explores: [virtualExplore],
            validationTargets: [ValidationTarget.CHARTS],
            onComplete: async (response: ValidationResponse[]) => {
                if (response.length === 0) {
                    // No errors , we don't need to show warning
                    await updateVirtualView({
                        exploreName: virtualViewState.name,
                        projectUuid,
                        name,
                        sql,
                        columns: columnsFromQuery,
                    });
                    history.go(0);
                } else {
                    if (handleDiff && initialColumns) {
                        setChartValidationErrors(response);
                        const diffs = compareColumns(
                            initialColumns,
                            columnsFromQuery,
                        );

                        // If there are no diffs, we update the virtual view and refresh the page
                        if (!diffs || diffs.length === 0) {
                            await updateVirtualView({
                                exploreName: virtualViewState.name,
                                projectUuid,
                                name,
                                sql,
                                columns: columnsFromQuery,
                            });
                            history.go(0);
                        } else {
                            // If there are diffs, we show the warning modal
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
            position="apart"
            sx={(theme) => ({
                borderBottom: `1px solid ${theme.colors.gray[3]}`,
            })}
        >
            <LoadingOverlay
                visible={
                    isRunningValidation ||
                    isRunningQuery ||
                    isUpdatingVirtualView
                }
                loader={
                    <Center h="95vh" w="95vw">
                        <Stack align="center" justify="center">
                            <Loader />
                            <Text fw={500}>Validating your changes...</Text>
                        </Stack>
                    </Center>
                }
            />

            <Group spacing="xs">
                <Group spacing="xs">
                    <MantineIcon icon={IconTableAlias} />
                    Editing
                    <TextInput
                        fz="sm"
                        fw={500}
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                    />
                </Group>
            </Group>

            <Group spacing="sm">
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
