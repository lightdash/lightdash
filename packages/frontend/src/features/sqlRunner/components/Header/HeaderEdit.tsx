import { type SqlChart } from '@lightdash/common';
import { Button, ActionIcon, HoverCard, Menu, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconArrowBack,
    IconDots,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'es-toolkit/compat';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { editorName } from '../../../../components/common/Page/editorName';
import { HeaderInfoPopover } from '../../../../components/common/Page/HeaderInfoPopover';
import {
    HeaderActions,
    HeaderHeading,
    HeaderMain,
    HeaderTitle,
} from '../../../../components/common/Page/HeaderSlots';
import PageHeader from '../../../../components/common/Page/PageHeader';
import {
    cartesianChartSelectors,
    selectCompleteConfigByKind,
} from '../../../../components/DataViz/store/selectors';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { DEFAULT_SQL_LIMIT } from '../../constants';
import { useSavedChartConnection } from '../../hooks/useSavedChartConnection';
import { useUpdateSqlChartMutation } from '../../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    toggleModal,
} from '../../store/sqlRunnerSlice';
import { ChartErrorsAlert } from '../ChartErrorsAlert';
import { DeleteSqlChartModal } from '../DeleteSqlChartModal';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { SqlQueryBeforeSaveAlert } from '../SqlQueryBeforeSaveAlert';
import { UpdateSqlChartModal } from '../UpdateSqlChartModal';

export const HeaderEdit: FC = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const limit = useAppSelector((state) => state.sqlRunner.limit);
    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );

    const config = useAppSelector((state) =>
        selectCompleteConfigByKind(state, selectedChartType),
    );

    const { mutate, isLoading } = useUpdateSqlChartMutation(
        savedSqlChart?.project.projectUuid || '',
        savedSqlChart?.savedSqlUuid || '',
        savedSqlChart?.slug || '',
    );
    // Store initial chart config to detect if there are any changes later on
    const [initialSavedSqlChart, setInitialSavedSqlChart] = useState<
        Pick<SqlChart, 'sql' | 'limit'> | undefined
    >(savedSqlChart);
    const [initialChartConfig, setInitialChartConfig] = useState(config);

    const { connectionRequest, hasConnectionChange, markSaved } =
        useSavedChartConnection(savedSqlChart);

    const hasChanges = useMemo(() => {
        if (!initialSavedSqlChart) return false;
        const changedSql = sql !== initialSavedSqlChart.sql;
        const changedLimit = limit !== initialSavedSqlChart.limit;
        const changedConfig = !isEqual(config, initialChartConfig);

        return (
            changedSql || changedLimit || changedConfig || hasConnectionChange
        );
    }, [
        initialSavedSqlChart,
        initialChartConfig,
        sql,
        limit,
        config,
        hasConnectionChange,
    ]);

    const onSave = useCallback(() => {
        if (!connectionRequest.ready) return;
        if (config && sql) {
            mutate({
                versionedData: {
                    config,
                    sql,
                    limit: limit ?? DEFAULT_SQL_LIMIT,
                    ...connectionRequest.field,
                },
            });
            setInitialChartConfig(config);
            setInitialSavedSqlChart({ sql, limit: limit ?? DEFAULT_SQL_LIMIT });
            markSaved();
        }
    }, [config, sql, mutate, limit, connectionRequest, markSaved]);

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
    const isChartErrorsAlertOpen = useAppSelector(
        (state) => state.sqlRunner.modals.chartErrorsAlert.isOpen,
    );
    const onCloseChartErrorsAlert = useCallback(() => {
        dispatch(toggleModal('chartErrorsAlert'));
    }, [dispatch]);
    const onFixButtonClick = useCallback(() => {
        dispatch(toggleModal('chartErrorsAlert'));
        dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
    }, [dispatch]);

    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );
    const onSaveClick = useCallback(() => {
        if (hasErrors) {
            dispatch(toggleModal('chartErrorsAlert'));
        } else if (config && sql) {
            onSave();
        }
    }, [hasErrors, config, sql, dispatch, onSave]);

    const isAnyModalOpen =
        isSaveModalOpen ||
        isUpdateModalOpen ||
        isDeleteModalOpen ||
        isChartErrorsAlertOpen;

    // Save on cmd/ctrl + s, including while the SQL editor is focused
    useHotkeys(
        [
            [
                'mod+s',
                () => {
                    if (
                        config &&
                        sql &&
                        hasChanges &&
                        !isLoading &&
                        !isAnyModalOpen
                    ) {
                        onSaveClick();
                    }
                },
            ],
        ],
        [],
    );

    const handleGoBackToViewPage = useCallback(async () => {
        await queryClient.resetQueries({
            queryKey: [
                'sqlRunner',
                'savedSqlChart',
                projectUuid,
                savedSqlChart?.slug,
            ],
        });
        void navigate(
            `/projects/${projectUuid}/sql-runner/${savedSqlChart?.slug}`,
        );
    }, [queryClient, navigate, savedSqlChart, projectUuid]);

    if (!savedSqlChart) {
        return null;
    }

    return (
        <>
            <PageHeader variant="dashboard">
                <HeaderMain miw={0} mr="sm">
                    <HeaderTitle gap="xs" wrap="nowrap">
                        <TitleBreadCrumbs
                            size="sm"
                            projectUuid={savedSqlChart.project.projectUuid}
                            spaceUuid={savedSqlChart.space.uuid}
                            spaceName={savedSqlChart.space.name}
                        />
                        <HeaderHeading order={6} lineClamp={1}>
                            {savedSqlChart.name}
                        </HeaderHeading>
                        <HeaderInfoPopover
                            label="Chart information"
                            info={{
                                resourceUuid: savedSqlChart.savedSqlUuid,
                                projectUuid: savedSqlChart.project.projectUuid,
                                description:
                                    savedSqlChart.description ?? undefined,
                                updatedAt: savedSqlChart.lastUpdatedAt,
                                updatedBy: editorName(
                                    savedSqlChart.lastUpdatedBy,
                                ),
                                viewStats: savedSqlChart.views,
                                firstViewedAt: savedSqlChart.firstViewedAt,
                                withChartData: false,
                            }}
                        />
                        <Tooltip label="Edit details" position="bottom">
                            <ActionIcon
                                size="md"
                                aria-label="Edit details"
                                onClick={() => {
                                    dispatch(toggleModal('updateChartModal'));
                                }}
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Tooltip>
                    </HeaderTitle>
                </HeaderMain>

                <HeaderActions gap="xs" wrap="nowrap">
                    <HoverCard disabled={!hasUnrunChanges} withArrow>
                        <HoverCard.Target>
                            <Button
                                size="xs"
                                color={'green.7'}
                                disabled={!config || !sql || !hasChanges}
                                loading={isLoading}
                                onClick={onSaveClick}
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
                        <Tooltip label="Back to view page" position="bottom">
                            <ActionIcon
                                data-testid="back-to-view-page-button"
                                aria-label="Back to view page"
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
                            <ActionIcon
                                variant="default"
                                size="md"
                                aria-label="Chart actions"
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Manage</Menu.Label>
                            <Menu.Item
                                disabled={!config || !sql}
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() =>
                                    dispatch(toggleModal('deleteChartModal'))
                                }
                            >
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </HeaderActions>
            </PageHeader>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />

            <UpdateSqlChartModal
                opened={isUpdateModalOpen}
                projectUuid={savedSqlChart.project.projectUuid}
                savedSqlUuid={savedSqlChart.savedSqlUuid}
                slug={savedSqlChart.slug}
                onClose={() => onCloseUpdateModal()}
                onSuccess={() => onCloseUpdateModal()}
            />

            <DeleteSqlChartModal
                projectUuid={savedSqlChart.project.projectUuid}
                savedSqlUuid={savedSqlChart.savedSqlUuid}
                name={savedSqlChart.name}
                opened={isDeleteModalOpen}
                onClose={onCloseDeleteModal}
                onSuccess={() =>
                    navigate(
                        `/projects/${savedSqlChart.project.projectUuid}/home`,
                    )
                }
            />

            <ChartErrorsAlert
                opened={isChartErrorsAlertOpen}
                onClose={onCloseChartErrorsAlert}
                onFixButtonClick={onFixButtonClick}
            />
        </>
    );
};
