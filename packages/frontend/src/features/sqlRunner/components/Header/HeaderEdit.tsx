import { ActionIcon, Group, Paper, Stack, Title, Tooltip } from '@mantine/core';
import {
    IconArrowBackUp,
    IconDeviceFloppy,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { useUpdateSqlChartMutation } from '../../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleModal } from '../../store/sqlRunnerSlice';
import { DeleteSqlChartModal } from '../DeleteSqlChartModal';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { UpdateSqlChartModal } from '../UpdateSqlChartModal';
import {selectCurrentChartConfig} from "../../store/selectors";

export const HeaderEdit: FC = () => {
    const history = useHistory();
    const dispatch = useAppDispatch();
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const config = useAppSelector((state) => selectCurrentChartConfig(state));
    const { mutate } = useUpdateSqlChartMutation(
        savedSqlChart?.project.projectUuid || '',
        savedSqlChart?.savedSqlUuid || '',
    );

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
                                viewStats={1} // todo: update endpoint to return view stats
                                firstViewedAt={undefined}
                                withChartData={false}
                            />
                        </Group>
                    </Stack>

                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label="Save chart"
                            position="bottom"
                        >
                            <ActionIcon size="xs" disabled={!config || !sql}>
                                <MantineIcon
                                    icon={IconDeviceFloppy}
                                    onClick={() => {
                                        if (config && sql) {
                                            mutate({
                                                versionedData: {
                                                    config,
                                                    sql,
                                                },
                                            });
                                        }
                                    }}
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label="Back to view page"
                            position="bottom"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconArrowBackUp}
                                    onClick={() =>
                                        history.push(
                                            `/projects/${savedSqlChart.project.projectUuid}/sql-runner-new/saved/${savedSqlChart.slug}`,
                                        )
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip variant="xs" label="Delete" position="bottom">
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconTrash}
                                    onClick={() =>
                                        dispatch(
                                            toggleModal('deleteChartModal'),
                                        )
                                    }
                                />
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
        </>
    );
};
