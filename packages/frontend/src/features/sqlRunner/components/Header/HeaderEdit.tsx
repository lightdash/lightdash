import { getPipelineSqlChartSource } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    HoverCard,
    Menu,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconArrowBack,
    IconDots,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import PageHeader from '../../../../components/common/Page/PageHeader';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { useAddVersionMutation } from '../../../../hooks/useSavedQuery';
import { DEFAULT_SQL_LIMIT } from '../../constants';
import { useSavedChartConnection } from '../../hooks/useSavedChartConnection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleModal } from '../../store/sqlRunnerSlice';
import { buildSqlRunnerItems } from '../../viz/sqlRunnerChart';
import { buildSqlRunnerSavedChartVersion } from '../../viz/sqlRunnerSavedChart';
import { DeleteSqlChartModal } from '../DeleteSqlChartModal';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { SqlQueryBeforeSaveAlert } from '../SqlQueryBeforeSaveAlert';
import { UpdateSqlChartModal } from '../UpdateSqlChartModal';

export const HeaderEdit: FC = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const savedChart = useAppSelector((state) => state.sqlRunner.savedChart);
    const chartConfig = useAppSelector((state) => state.sqlRunner.chartConfig);
    const pivotDimensions = useAppSelector(
        (state) => state.sqlRunner.pivotDimensions,
    );
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const limit = useAppSelector((state) => state.sqlRunner.limit);
    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );
    // Saving without a re-run keeps the columns the chart was saved with
    const columns = sqlColumns ?? savedChart?.pipeline?.columns;
    const items = useMemo(
        () => (columns ? buildSqlRunnerItems(columns) : null),
        [columns],
    );

    const { mutate, isLoading } = useAddVersionMutation({
        redirectOnSuccess: false,
    });
    const savedSource = useMemo(
        () =>
            savedChart?.pipeline
                ? getPipelineSqlChartSource(savedChart.pipeline)
                : null,
        [savedChart],
    );
    // The chart as last saved, to tell edits from the stored version
    const [initialSource, setInitialSource] = useState(savedSource);
    const [initialChart, setInitialChart] = useState({
        chartConfig: savedChart?.chartConfig,
        pivotDimensions: savedChart?.pivotConfig?.columns,
    });

    const { connectionRequest, hasConnectionChange, markSaved } =
        useSavedChartConnection(savedSource ?? undefined);

    const hasChanges = useMemo(() => {
        if (!initialSource) return false;
        const changedSql = sql !== initialSource.sql;
        const changedLimit = limit !== initialSource.limit;
        const changedConfig =
            !isEqual(chartConfig, initialChart.chartConfig) ||
            !isEqual(pivotDimensions, initialChart.pivotDimensions);
        return (
            changedSql || changedLimit || changedConfig || hasConnectionChange
        );
    }, [
        initialSource,
        initialChart,
        sql,
        limit,
        chartConfig,
        pivotDimensions,
        hasConnectionChange,
    ]);

    // Saving captures the query as it last ran, so the columns must be known
    const canSave = !!savedChart && !!sql && !!columns && !!items;

    const onSave = useCallback(() => {
        if (!connectionRequest.ready || !savedChart || !columns || !items)
            return;
        const savedLimit = limit ?? DEFAULT_SQL_LIMIT;
        mutate({
            uuid: savedChart.uuid,
            payload: buildSqlRunnerSavedChartVersion({
                sql,
                limit: savedLimit,
                columns,
                items,
                chartConfig,
                pivotDimensions,
                warehouseConnectionUuid:
                    connectionRequest.field.warehouseConnectionUuid ?? null,
                parameters: savedChart.parameters,
            }),
        });
        setInitialChart({ chartConfig, pivotDimensions });
        setInitialSource({
            sql,
            limit: savedLimit,
            warehouseConnectionUuid:
                connectionRequest.field.warehouseConnectionUuid ?? null,
        });
        markSaved();
    }, [
        connectionRequest,
        savedChart,
        columns,
        items,
        limit,
        mutate,
        sql,
        chartConfig,
        pivotDimensions,
        markSaved,
    ]);

    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);
    const isDeleteModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.deleteChartModal.isOpen,
    );
    const onCloseDeleteModal = useCallback(() => {
        dispatch(toggleModal('deleteChartModal'));
    }, [dispatch]);
    const isUpdateModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.updateChartModal.isOpen,
    );
    const onCloseUpdateModal = useCallback(() => {
        dispatch(toggleModal('updateChartModal'));
    }, [dispatch]);

    const isAnyModalOpen =
        isSaveModalOpen || isUpdateModalOpen || isDeleteModalOpen;

    // Save on cmd/ctrl + s, including while the SQL editor is focused
    useHotkeys(
        [
            [
                'mod+s',
                () => {
                    if (
                        canSave &&
                        hasChanges &&
                        !isLoading &&
                        !isAnyModalOpen
                    ) {
                        onSave();
                    }
                },
            ],
        ],
        [],
    );

    const handleGoBackToViewPage = useCallback(() => {
        void navigate(`/projects/${projectUuid}/saved/${savedChart?.slug}`);
    }, [navigate, savedChart, projectUuid]);

    if (!savedChart) {
        return null;
    }

    return (
        <>
            <PageHeader variant="query">
                <Group justify="space-between" flex={1} wrap="nowrap">
                    <Stack gap={0} miw={0}>
                        <Group gap={4} wrap="nowrap">
                            <TitleBreadCrumbs
                                projectUuid={savedChart.projectUuid}
                                spaceUuid={savedChart.spaceUuid}
                                spaceName={savedChart.spaceName}
                            />
                            <Title order={5} maw={500} lineClamp={1}>
                                {savedChart.name}
                            </Title>
                            <ActionIcon
                                size="xs"
                                onClick={() => {
                                    dispatch(toggleModal('updateChartModal'));
                                }}
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Group>
                        <Group gap="xs">
                            <UpdatedInfo
                                updatedAt={savedChart.updatedAt}
                                user={savedChart.updatedByUser}
                                partiallyBold={false}
                            />
                            <ResourceInfoPopup
                                resourceUuid={savedChart.uuid}
                                projectUuid={savedChart.projectUuid}
                                description={savedChart.description}
                                withChartData={false}
                            />
                        </Group>
                    </Stack>

                    <Group gap="xs">
                        <HoverCard disabled={!hasUnrunChanges} withArrow>
                            <HoverCard.Target>
                                <Button
                                    size="xs"
                                    color={'green.7'}
                                    disabled={!canSave || !hasChanges}
                                    loading={isLoading}
                                    onClick={onSave}
                                >
                                    Save
                                </Button>
                            </HoverCard.Target>
                            <HoverCard.Dropdown p={0} bg="yellow.0">
                                <SqlQueryBeforeSaveAlert />
                            </HoverCard.Dropdown>
                        </HoverCard>

                        {hasChanges ? (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={handleGoBackToViewPage}
                            >
                                Cancel
                            </Button>
                        ) : (
                            <Tooltip
                                label="Back to view page"
                                position="bottom"
                            >
                                <ActionIcon
                                    data-testid="back-to-view-page-button"
                                    variant="default"
                                    size="md"
                                    onClick={handleGoBackToViewPage}
                                >
                                    <MantineIcon icon={IconArrowBack} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <Menu position="bottom" withArrow width={200}>
                            <Menu.Target>
                                <ActionIcon>
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Manage</Menu.Label>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                    color="red"
                                    onClick={() =>
                                        dispatch(
                                            toggleModal('deleteChartModal'),
                                        )
                                    }
                                >
                                    Delete
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>
            </PageHeader>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />

            <UpdateSqlChartModal
                opened={isUpdateModalOpen}
                projectUuid={savedChart.projectUuid}
                chart={savedChart}
                onClose={() => onCloseUpdateModal()}
                onSuccess={() => onCloseUpdateModal()}
            />

            <DeleteSqlChartModal
                projectUuid={savedChart.projectUuid}
                chartUuid={savedChart.uuid}
                name={savedChart.name}
                opened={isDeleteModalOpen}
                onClose={onCloseDeleteModal}
                onSuccess={() =>
                    navigate(`/projects/${savedChart.projectUuid}/home`)
                }
            />
        </>
    );
};
