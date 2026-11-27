import { subject } from '@casl/ability';
import {
    ContentReviewContentType,
    DashboardTileTypes,
    DirectAccessResourceType,
} from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconCirclesRelation,
    IconDatabaseExport,
    IconDots,
    IconLayoutGridAdd,
    IconPencil,
    IconSend,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import AddTilesToDashboardModal from '../../../../components/SavedDashboards/AddTilesToDashboardModal';
import {
    PendingReviewBadge,
    RequestReviewModal,
    useContentReviewEligibility,
} from '../../../../ee/features/contentReview';
import { useContentAuthoringEnabled } from '../../../../hooks/useContentAuthoringEnabled';
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

/**
 * Walkthrough result for manage:SqlRunner: the saved SQL chart's own page,
 * which saving opens.
 */
const savedChartTourProps = {
    'data-tour-scope': 'manage:SqlRunner',
    'data-tour-step': '1',
    'data-tour-route': '/projects/:projectUuid/sql-runner/:slug',
    'data-tour-label': 'The chart is saved in its space',
    'data-tour-docs': 'explore/sql-runner.mdx#intro:p2:1',
    'data-tour-return': 'none',
    'data-tour-resultdocs':
        'explore/sql-runner.mdx#saved-charts-in-the-sql-runner:1',
};

export const HeaderView: FC = () => {
    const authoringEnabled = useContentAuthoringEnabled();
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

    const [initialSyncUuid, setInitialSyncUuid] = useState<string>();
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
            setInitialSyncUuid(schedulerUuid);
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
            <PageHeader variant="dashboard">
                <HeaderMain miw={0} mr="sm">
                    <HeaderTitle gap="xs" wrap="nowrap">
                        {space && (
                            <TitleBreadCrumbs
                                size="sm"
                                projectUuid={projectUuid}
                                spaceUuid={space.uuid}
                                spaceName={space.name}
                            />
                        )}
                        <HeaderHeading
                            order={6}
                            lineClamp={1}
                            {...savedChartTourProps}
                        >
                            {savedSqlChart.name}
                        </HeaderHeading>
                        <HeaderInfoPopover
                            label="Chart information"
                            info={{
                                resourceUuid: savedSqlChart.savedSqlUuid,
                                projectUuid,
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
                        {contentReview.pendingRequest && (
                            <PendingReviewBadge
                                request={contentReview.pendingRequest}
                            />
                        )}
                    </HeaderTitle>
                </HeaderMain>

                <HeaderActions gap="sm" wrap="nowrap">
                    {canManageSqlRunner && canManageChart && (
                        <Tooltip label="Edit chart" position="bottom">
                            <ActionIcon
                                display={authoringEnabled ? undefined : 'none'}
                                bg="foreground"
                                c="background"
                                size="md"
                                aria-label="Edit chart"
                                onClick={() =>
                                    navigate(
                                        `/projects/${projectUuid}/sql-runner/${savedSqlChart.slug}/edit`,
                                    )
                                }
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Tooltip>
                    )}

                    {(canManageChart ||
                        canSyncWithGoogleSheets ||
                        contentReview.canRequest) && (
                        <Menu
                            position="bottom"
                            returnFocus={!isDirectAccessModalOpen}
                            withArrow
                            width={200}
                        >
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
                                                <MantineIcon icon={IconUsers} />
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
                                                toggleModal('deleteChartModal'),
                                            )
                                        }
                                    >
                                        Delete
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </HeaderActions>
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
                    initialSchedulerUuid={initialSyncUuid}
                    onClose={() => {
                        syncModalHandlers.close();
                        setInitialSyncUuid(undefined);
                    }}
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
