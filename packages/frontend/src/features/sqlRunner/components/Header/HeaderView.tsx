import { subject } from '@casl/ability';
import { DashboardTileTypes } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Title,
} from '@mantine/core';
import { IconDots, IconLayoutGridAdd, IconTrash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import AddTilesToDashboardModal from '../../../../components/SavedDashboards/AddTilesToDashboardModal';
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
    const isAddToDashboardModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.addToDashboard.isOpen,
    );
    const onCloseAddToDashboardModal = useCallback(() => {
        dispatch(toggleModal('addToDashboard'));
    }, [dispatch]);
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
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() =>
                                    history.push(
                                        `/projects/${projectUuid}/sql-runner/${savedSqlChart.slug}/edit`,
                                    )
                                }
                            >
                                Edit chart
                            </Button>
                        )}

                        {canManageChart && (
                            <Menu
                                position="bottom"
                                withArrow
                                withinPortal
                                shadow="md"
                                width={200}
                            >
                                <Menu.Target>
                                    <ActionIcon variant="default">
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Label>Manage</Menu.Label>
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconLayoutGridAdd}
                                            />
                                        }
                                        onClick={() =>
                                            dispatch(
                                                toggleModal('addToDashboard'),
                                            )
                                        }
                                    >
                                        Add to dashboard
                                    </Menu.Item>
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconTrash}
                                                color="red"
                                            />
                                        }
                                        color="red"
                                        disabled={!canManageSqlRunner}
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
            {isAddToDashboardModalOpen && (
                <AddTilesToDashboardModal
                    isOpen={true}
                    projectUuid={projectUuid}
                    uuid={savedSqlChart.savedSqlUuid}
                    dashboardTileType={DashboardTileTypes.SQL_CHART}
                    onClose={onCloseAddToDashboardModal}
                />
            )}
        </>
    );
};
