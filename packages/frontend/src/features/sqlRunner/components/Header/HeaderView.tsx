import { subject } from '@casl/ability';
import {
    ContentReviewContentType,
    DashboardTileTypes,
    DirectAccessResourceType,
} from '@lightdash/common';
import {
    Group,
    Stack,
    Title,
    Button,
    ActionIcon,
    Menu,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconCirclesRelation,
    IconDatabaseExport,
    IconDots,
    IconLayoutGridAdd,
    IconSend,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import PageHeader from '../../../../components/common/Page/PageHeader';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import AddTilesToDashboardModal from '../../../../components/SavedDashboards/AddTilesToDashboardModal';
import {
    PendingReviewBadge,
    RequestReviewModal,
    useContentReviewEligibility,
} from '../../../../ee/features/contentReview';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../../directAccess';
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
    const [isDirectAccessModalOpen, directAccessModalHandlers] =
        useDisclosure(false);
    const directAccessAvailability = useDirectAccessAvailability();
    const canManageSqlChartAccess = useCanManageDirectAccess({
        projectUuid,
        spaceUuid: savedSqlChart?.space.uuid ?? null,
        createdByUserUuid: null,
        access: savedSqlChart?.space.userAccess
            ? [savedSqlChart.space.userAccess]
            : [],
        grantRoles: [],
    });
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
    const [isRequestReviewModalOpen, requestReviewModalHandlers] =
        useDisclosure(false);
    const contentReview = useContentReviewEligibility({
        projectUuid,
        contentType: ContentReviewContentType.SQL_CHART,
        contentUuid: savedSqlChart?.savedSqlUuid,
        spaceUuid: savedSqlChart?.space.uuid ?? null,
    });

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

    const canCreateScheduledDeliveries = user.data?.ability?.can(
        'create',
        subject('ScheduledDeliveries', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    // Creating a sync needs delivery + Drive permissions, not chart edit
    // rights — the same gate the saved chart and data app headers use.
    const canSyncWithGoogleSheets =
        hasGoogleDriveEnabled &&
        canCreateScheduledDeliveries === true &&
        user.data?.ability?.can(
            'manage',
            subject('GoogleSheets', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) === true;

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
            <PageHeader cardProps={{ py: 'xs' }}>
                <Group justify="space-between" flex={1} wrap="nowrap">
                    <Stack gap={0} miw={0}>
                        <Group gap={4} wrap="nowrap">
                            {space && (
                                <TitleBreadCrumbs
                                    projectUuid={projectUuid}
                                    spaceUuid={space.uuid}
                                    spaceName={space.name}
                                />
                            )}
                            <Title order={5} maw={500} lineClamp={1}>
                                {savedSqlChart.name}
                            </Title>
                            {contentReview.pendingRequest && (
                                <PendingReviewBadge
                                    request={contentReview.pendingRequest}
                                />
                            )}
                        </Group>
                        <Group gap="xs">
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

                    <Group gap="xs">
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

                        {(canManageChart ||
                            canSyncWithGoogleSheets ||
                            contentReview.canRequest) && (
                            <Menu position="bottom" withArrow width={200}>
                                <Menu.Target>
                                    <ActionIcon>
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    {canManageChart && (
                                        <>
                                            <Menu.Label>Manage</Menu.Label>
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconLayoutGridAdd}
                                                    />
                                                }
                                                onClick={() =>
                                                    dispatch(
                                                        toggleModal(
                                                            'addToDashboard',
                                                        ),
                                                    )
                                                }
                                            >
                                                Add to dashboard
                                            </Menu.Item>
                                        </>
                                    )}
                                    {contentReview.canRequest && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconSend} />
                                            }
                                            onClick={
                                                requestReviewModalHandlers.open
                                            }
                                        >
                                            Request review
                                        </Menu.Item>
                                    )}
                                    {canSyncWithGoogleSheets && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconCirclesRelation}
                                                />
                                            }
                                            onClick={syncModalHandlers.open}
                                        >
                                            Google Sheets Sync
                                        </Menu.Item>
                                    )}
                                    {canManageChart && canPromoteChart && (
                                        <Tooltip
                                            label="You must enable first an upstream project in settings > Data ops"
                                            disabled={
                                                project?.upstreamProjectUuid !==
                                                undefined
                                            }
                                        >
                                            <div>
                                                <Menu.Item
                                                    leftSection={
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
                                    {directAccessAvailability.isAvailable &&
                                        canManageSqlChartAccess && (
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconUsers}
                                                    />
                                                }
                                                onClick={
                                                    directAccessModalHandlers.open
                                                }
                                            >
                                                Share
                                            </Menu.Item>
                                        )}
                                    {canManageChart && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconTrash}
                                                    color="red"
                                                />
                                            }
                                            color="red"
                                            disabled={!canManageSqlRunner}
                                            onClick={() =>
                                                dispatch(
                                                    toggleModal(
                                                        'deleteChartModal',
                                                    ),
                                                )
                                            }
                                        >
                                            Delete
                                        </Menu.Item>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>
                </Group>
            </PageHeader>

            {isDirectAccessModalOpen && savedSqlChart && (
                <DirectAccessModal
                    opened={isDirectAccessModalOpen}
                    onClose={directAccessModalHandlers.close}
                    projectUuid={projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.SQL_CHART,
                        resourceUuid: savedSqlChart.savedSqlUuid,
                        name: savedSqlChart.name,
                    }}
                />
            )}

            <DeleteSqlChartModal
                projectUuid={projectUuid}
                savedSqlUuid={savedSqlChart.savedSqlUuid}
                name={savedSqlChart.name}
                opened={isDeleteModalOpen}
                onClose={onCloseDeleteModal}
                onSuccess={() => navigate(`/projects/${projectUuid}/home`)}
            />
            {isRequestReviewModalOpen && (
                <RequestReviewModal
                    projectUuid={projectUuid}
                    contentType={ContentReviewContentType.SQL_CHART}
                    contentUuid={savedSqlChart.savedSqlUuid}
                    contentName={savedSqlChart.name}
                    opened={isRequestReviewModalOpen}
                    onClose={requestReviewModalHandlers.close}
                />
            )}
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
