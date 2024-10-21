import { type SqlChart } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    HoverCard,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowBack, IconPencil, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import {
    cartesianChartSelectors,
    selectCompleteConfigByKind,
} from '../../../../components/DataViz/store/selectors';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
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
    const history = useHistory();
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

    const hasChanges = useMemo(() => {
        if (!initialSavedSqlChart) return false;
        const changedSql = sql !== initialSavedSqlChart.sql;
        const changedLimit = limit !== initialSavedSqlChart.limit;
        const changedConfig = !isEqual(config, initialChartConfig);

        return changedSql || changedLimit || changedConfig;
    }, [initialSavedSqlChart, initialChartConfig, sql, limit, config]);

    const onSave = useCallback(() => {
        if (config && sql) {
            mutate({
                versionedData: {
                    config,
                    sql,
                    limit,
                },
            });
            setInitialChartConfig(config);
            setInitialSavedSqlChart({ sql, limit });
        }
    }, [config, sql, mutate, limit]);

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

    const handleGoBackToViewPage = useCallback(async () => {
        await queryClient.resetQueries({
            queryKey: [
                'sqlRunner',
                'savedSqlChart',
                projectUuid,
                savedSqlChart?.slug,
            ],
        });
        history.push(
            `/projects/${projectUuid}/sql-runner/${savedSqlChart?.slug}`,
        );
    }, [queryClient, history, savedSqlChart, projectUuid]);

    if (!savedSqlChart) {
        return null;
    }

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
                <Group position="apart">
                    <Stack spacing="none">
                        <Group spacing="two">
                            <TitleBreadCrumbs
                                projectUuid={savedSqlChart.project.projectUuid}
                                spaceUuid={savedSqlChart.space.uuid}
                                spaceName={savedSqlChart.space.name}
                            />
                            <Title c="dark.6" order={5} fw={600}>
                                {savedSqlChart.name}
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
                        <Group spacing="xs">
                            <UpdatedInfo
                                updatedAt={savedSqlChart.lastUpdatedAt}
                                user={savedSqlChart.lastUpdatedBy}
                                partiallyBold={false}
                            />
                            <ResourceInfoPopup
                                resourceUuid={savedSqlChart.savedSqlUuid}
                                projectUuid={savedSqlChart.project.projectUuid}
                                description={
                                    savedSqlChart.description ?? undefined
                                }
                                viewStats={savedSqlChart.views}
                                firstViewedAt={savedSqlChart.firstViewedAt}
                                withChartData={false}
                            />
                        </Group>
                    </Stack>

                    <Group spacing="md">
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

                        <Tooltip
                            variant="xs"
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
                        <Tooltip variant="xs" label="Delete" position="bottom">
                            <ActionIcon
                                size="xs"
                                onClick={() =>
                                    dispatch(toggleModal('deleteChartModal'))
                                }
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
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
                    history.push(
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
