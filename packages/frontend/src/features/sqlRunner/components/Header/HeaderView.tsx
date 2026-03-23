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
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconCirclesRelation,
    IconDatabaseExport,
    IconDots,
    IconLayoutGridAdd,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import AddTilesToDashboardModal from '../../../../components/SavedDashboards/AddTilesToDashboardModal';
import { useProject } from '../../../../hooks/useProject';
import { Can } from '../../../../providers/Ability';
import useApp from '../../../../providers/App/useApp';
import { PromotionConfirmDialog } from '../../../promotion/components/PromotionConfirmDialog';
import {
    getSchedulerUuidFromUrlParams,
    isSchedulerTypeSync,
} from '../../../scheduler/utils';
import { SqlChartSyncModal } from '../../../sync/components/SqlChartSyncModal';
import {
    usePromoteSqlChartDiffMutation,
    usePromoteSqlChartMutation,
} from '../../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleModal } from '../../store/sqlRunnerSlice';
import { DeleteSqlChartModal } from '../DeleteSqlChartModal';

export const HeaderView: FC = () => {
    const navigate = useNavigate();
    const { search, pathname } = useLocation();
    const dispatch = useAppDispatch();
    const { user, health } = useApp();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);
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

    const [isSyncModalOpen, syncModalHandlers] = useDisclosure();

    // Open sync modal when navigating from schedulers settings page
    const hasProcessedUrlParams = useRef(false);
    useEffect(() => {
        if (hasProcessedUrlParams.current) return;

        const schedulerUuid = getSchedulerUuidFromUrlParams(search);
        if (!schedulerUuid) return;

        hasProcessedUrlParams.current = true;

        if (isSchedulerTypeSync(search)) {
            syncModalHandlers.open();
        }

        // Clear URL params to prevent modal from reopening on close
        const newParams = new URLSearchParams(search);
        newParams.delete('scheduler_uuid');
        newParams.delete('isSync');
        void navigate(
            { pathname, search: newParams.toString() },
            { replace: true },
        );
    }, [search, navigate, pathname, syncModalHandlers]);

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
            access: savedSqlChart?.space.userAccess
                ? [savedSqlChart.space.userAccess]
                : [],
        }),
    );

    const canPromoteChart = user.data?.ability?.can(
        'promote',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: savedSqlChart?.space.userAccess
                ? [savedSqlChart.space.userAccess]
                : [],
        }),
    );

    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    const { mutate: promoteSqlChart } = usePromoteSqlChartMutation(projectUuid);
    const {
        mutate: getPromoteSqlChartDiff,
        data: promoteSqlChartDiff,
        reset: resetPromoteSqlChartDiff,
        isLoading: promoteSqlChartDiffLoading,
    } = usePromoteSqlChartDiffMutation(projectUuid);

    if (!savedSqlChart) {
        return null;
    }

    return (
        <>
            <Paper
                shadow="none"
                radius={0}
                withBorder={false}
                px="md"
                py="xs"
                sx={(theme) => ({
                    borderBottom: `1px solid ${
                        theme.colorScheme === 'dark'
                            ? theme.colors.ldDark[8]
                            : theme.colors.ldGray[3]
                    }`,
                })}
            >
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
                            <Title c="ldDark.6" order={5} fw={600}>
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

                    <Group spacing="xs">
                        {canManageSqlRunner && canManageChart && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() =>
                                    navigate(
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
                                    <ActionIcon variant="subtle">
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
                                    {hasGoogleDriveEnabled && (
                                        <Can
                                            I="manage"
                                            this={subject('GoogleSheets', {
                                                organizationUuid:
                                                    user.data?.organizationUuid,
                                                projectUuid,
                                            })}
                                        >
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={
                                                            IconCirclesRelation
                                                        }
                                                    />
                                                }
                                                onClick={syncModalHandlers.open}
                                            >
                                                Google Sheets Sync
                                            </Menu.Item>
                                        </Can>
                                    )}
                                    {canPromoteChart && (
                                        <Tooltip
                                            label="You must enable first an upstream project in settings > Data ops"
                                            disabled={
                                                project?.upstreamProjectUuid !==
                                                undefined
                                            }
                                            withinPortal
                                        >
                                            <div>
                                                <Menu.Item
                                                    icon={
                                                        <MantineIcon
                                                            icon={
                                                                IconDatabaseExport
                                                            }
                                                        />
                                                    }
                                                    disabled={
                                                        project?.upstreamProjectUuid ===
                                                        undefined
                                                    }
                                                    onClick={() =>
                                                        getPromoteSqlChartDiff(
                                                            savedSqlChart.savedSqlUuid,
                                                        )
                                                    }
                                                >
                                                    Promote chart
                                                </Menu.Item>
                                            </div>
                                        </Tooltip>
                                    )}
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
                onSuccess={() => navigate(`/projects/${projectUuid}/home`)}
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
            {isSyncModalOpen && (
                <SqlChartSyncModal
                    projectUuid={projectUuid}
                    savedSqlUuid={savedSqlChart.savedSqlUuid}
                    opened={isSyncModalOpen}
                    onClose={syncModalHandlers.close}
                />
            )}
            {(promoteSqlChartDiff || promoteSqlChartDiffLoading) && (
                <PromotionConfirmDialog
                    type="chart"
                    resourceName={savedSqlChart.name}
                    promotionChanges={promoteSqlChartDiff}
                    onClose={() => {
                        resetPromoteSqlChartDiff();
                    }}
                    onConfirm={() => {
                        promoteSqlChart(savedSqlChart.savedSqlUuid);
                    }}
                />
            )}
        </>
    );
};
