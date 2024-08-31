import { subject } from '@casl/ability';
import { ActionIcon, Group, Paper, Stack, Title, Tooltip } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { useApp } from '../../../../providers/AppProvider';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleModal } from '../../store/sqlRunnerSlice';
import { DeleteSqlChartModal } from '../DeleteSqlChartModal';

export const HeaderView: FC = () => {
    const history = useHistory();
    const dispatch = useAppDispatch();
    const { user } = useApp();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const space = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart?.space,
    );
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    const isDeleteModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.deleteChartModal.isOpen,
    );
    const onCloseDeleteModal = useCallback(() => {
        dispatch(toggleModal('deleteChartModal'));
    }, [dispatch]);

    const canManageSqlRunner = user.data?.ability?.can(
        'manage',
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const canManageChart = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            isPrivate: savedSqlChart?.space.isPrivate,
            access: savedSqlChart?.space.userAccess
                ? [savedSqlChart.space.userAccess]
                : [],
        }),
    );

    if (!savedSqlChart) {
        return null;
    }

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
                <Group position="apart">
                    <Stack spacing="none">
                        <Group spacing="two">
                            {space && (
                                <TitleBreadCrumbs
                                    projectUuid={projectUuid}
                                    spaceUuid={space.uuid}
                                    spaceName={space.name}
                                />
                            )}
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
                                projectUuid={projectUuid}
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
                        {canManageSqlRunner && canManageChart && (
                            <Tooltip
                                variant="xs"
                                label="Edit chart"
                                position="bottom"
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={() =>
                                        history.push(
                                            `/projects/${projectUuid}/sql-runner/${savedSqlChart.slug}/edit`,
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconPencil} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {canManageSqlRunner && canManageChart && (
                            <Tooltip
                                variant="xs"
                                label="Delete"
                                position="bottom"
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={() =>
                                        dispatch(
                                            toggleModal('deleteChartModal'),
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconTrash} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </Group>
            </Paper>
            <DeleteSqlChartModal
                projectUuid={projectUuid}
                savedSqlUuid={savedSqlChart.savedSqlUuid}
                name={savedSqlChart.name}
                opened={isDeleteModalOpen}
                onClose={onCloseDeleteModal}
                onSuccess={() => history.push(`/projects/${projectUuid}/home`)}
            />
        </>
    );
};
