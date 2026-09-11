import { subject } from '@casl/ability';
import {
    ChartSourceType,
    ContentReviewContentType,
    ContentType,
    DashboardTileTypes,
    DirectAccessResourceType,
    FeatureFlags,
    ResourceViewItemType,
    type ResourceViewChartItem,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowsExchange,
    IconBell,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconCirclesRelation,
    IconCode,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconFolderSymlink,
    IconFolders,
    IconHistory,
    IconLayoutGridAdd,
    IconLink,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { lazy, useCallback, useMemo, useState, type FC } from 'react';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import {
    RequestReviewModal,
    useContentReviewEligibility,
} from '../../../ee/features/contentReview';
import ChartAsCodeModal from '../../../features/contentAsCode/components/ChartAsCodeModal';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../../features/directAccess';
import {
    selectHasUnsavedChanges,
    selectIsEditMode,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteChartDiffMutation,
    usePromoteMutation,
} from '../../../features/promotion/hooks/usePromoteChart';
import { ChartSchedulersModal } from '../../../features/scheduler';
import { type SchedulerDeepLink } from '../../../features/scheduler/hooks/useSchedulerDeepLink';
import { SyncModal as GoogleSheetsSyncModal } from '../../../features/sync/components';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import { useChartPinningMutation } from '../../../hooks/pinning/useChartPinningMutation';
import { useChartPermissions } from '../../../hooks/useChartPermissions';
import { useContentAction } from '../../../hooks/useContent';
import {
    useUnverifyChartMutation,
    useVerifyChartMutation,
} from '../../../hooks/useContentVerification';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProject } from '../../../hooks/useProject';
import { useProjectUrlIdentifier } from '../../../hooks/useProjectRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import ChartDeleteModal from '../../common/modal/ChartDeleteModal';
import ChartDuplicateModal from '../../common/modal/ChartDuplicateModal';
import MoveChartThatBelongsToDashboardModal from '../../common/modal/MoveChartThatBelongsToDashboardModal';
import TransferItemsModal from '../../common/TransferItemsModal/TransferItemsModal';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import ChartSlugRenameModal from './ChartSlugRenameModal';

const ChangeChartExploreModal = lazy(
    () => import('../../common/modal/ChangeChartExploreModal'),
);

/**
 * Walkthrough for manage:ContentVerification: verifying a chart from its
 * actions menu; the green check in the header is the result.
 */
const verifyTourAction = {
    'data-tour-anchor': 'verify-chart',
    'data-tour-hint': 'Verify the chart',
    'data-tour-scope': 'manage:ContentVerification',
    'data-tour-covers': 'view:ContentVerification',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid',
    'data-tour-label': 'Click Verify',
    'data-tour-title': 'Verify a chart',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"] >> [data-tour-anchor="chart-actions"]',
    'data-tour-docs':
        'explore/verified-content.mdx#verifying-a-chart-or-dashboard:1',
};

export type ChartActionsHost = 'page' | 'modal';

type Props = {
    /**
     * The chart page navigates for history, deletion and moves. A modal host
     * stays put: history opens in place and items that reroute the page or
     * dock under it are hidden.
     */
    host: ChartActionsHost;
    onOpenVersionHistory: () => void;
    onDeleted: () => void;
    /** Page only: reloads the chart as a space chart after it leaves its dashboard. */
    onMovedToSpace?: () => void;
    /** Page only: the URL carries the old slug. */
    onSlugRenamed?: (slug: string) => void;
    /** Page only: a scheduler modal to open on mount from the URL. */
    schedulerDeepLink?: SchedulerDeepLink | null;
};

/**
 * The chart "..." actions menu and the dialogs it opens. Shared by the chart
 * page header and the in-dashboard chart editor so both expose the same
 * actions; reads the chart from the explorer store it is rendered under.
 */
const ChartActionsMenu: FC<Props> = ({
    host,
    onOpenVersionHistory,
    onDeleted,
    onMovedToSpace,
    onSlugRenamed,
    schedulerDeepLink = null,
}) => {
    const { data: changeChartExploreFlag } = useServerFeatureFlag(
        FeatureFlags.ChangeChartExplore,
    );
    const changeChartExploreEnabled = changeChartExploreFlag?.enabled === true;

    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const { data: project } = useProject(projectUuid);
    const { user, health } = useApp();

    const savedChart = useExplorerSelector(selectSavedChart);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const { query } = useExplorerQuery();
    const itemsMap = query.data?.fields;

    const { mutate: promoteChart } = usePromoteMutation();
    const {
        mutate: getPromoteChartDiff,
        data: promoteChartDiff,
        reset: resetPromoteChartDiff,
        isLoading: promoteChartDiffLoading,
    } = usePromoteChartDiffMutation();

    const isPinned = Boolean(savedChart?.pinnedListUuid);
    const { mutate: togglePinChart } = useChartPinningMutation();
    const onChartPinning = useCallback(() => {
        if (!savedChart) return;
        togglePinChart({ uuid: savedChart.uuid });
    }, [savedChart, togglePinChart]);

    const [isMovingChart, setIsMovingChart] = useState(false);
    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isScheduledDeliveriesModalOpen, scheduledDeliveriesModalHandlers] =
        useDisclosure(schedulerDeepLink?.modal === 'scheduledDeliveries');
    const [isThresholdAlertsModalOpen, thresholdAlertsModalHandlers] =
        useDisclosure(schedulerDeepLink?.modal === 'thresholdAlerts');
    const [isSyncWithGoogleSheetsModalOpen, syncWithGoogleSheetsModalHandlers] =
        useDisclosure(schedulerDeepLink?.modal === 'googleSheetsSync');
    // Cleared when the modal closes so reopening it shows the list again
    const [initialSchedulerUuid, setInitialSchedulerUuid] = useState(
        schedulerDeepLink?.schedulerUuid ?? undefined,
    );
    const [initialThresholdUuid, setInitialThresholdUuid] = useState(
        schedulerDeepLink?.thresholdUuid ?? undefined,
    );
    const [isAddToDashboardModalOpen, addToDashboardModalHandlers] =
        useDisclosure();
    const [isChartDuplicateModalOpen, chartDuplicateModalHandlers] =
        useDisclosure();
    const [isChangeExploreModalOpen, changeExploreModalHandlers] =
        useDisclosure();
    const [isDirectAccessModalOpen, directAccessModalHandlers] =
        useDisclosure(false);
    const directAccessAvailability = useDirectAccessAvailability();
    const [isRequestReviewModalOpen, requestReviewModalHandlers] =
        useDisclosure(false);
    const contentReview = useContentReviewEligibility({
        projectUuid,
        contentType: ContentReviewContentType.CHART,
        contentUuid: savedChart?.uuid,
        spaceUuid: savedChart?.spaceUuid,
    });
    const canManageChartAccess = useCanManageDirectAccess({
        projectUuid,
        spaceUuid: savedChart?.spaceUuid ?? null,
        createdByUserUuid: null,
        access: savedChart?.access ?? [],
        grantRoles: [],
    });
    const [isTransferToSpaceModalOpen, transferToSpaceModalHandlers] =
        useDisclosure();
    const [isChartAsCodeModalOpen, chartAsCodeModalHandlers] = useDisclosure();
    const [isChartSlugRenameModalOpen, chartSlugRenameModalHandlers] =
        useDisclosure();

    const { mutateAsync: contentAction, isLoading: isContentActionLoading } =
        useContentAction(projectUuid);
    const chartViewStats = useChartViewStats(savedChart?.uuid);
    const chartBelongsToDashboard = !!savedChart?.dashboardUuid;

    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    const {
        canManageChart: userCanManageChart,
        canManageChartViaSpace: userCanManageChartViaSpace,
        canViewContentAsCode: userCanViewContentAsCode,
        canPromoteChart: userCanPromoteChart,
        canManageExplore: userCanManageExplore,
        canCreateDeliveriesAndAlerts: userCanCreateDeliveriesAndAlerts,
        canManageContentVerification,
        canPinChart: userCanPinChart,
    } = useChartPermissions(savedChart);

    const { mutate: verifyChart } = useVerifyChartMutation();
    const { mutate: unverifyChart } = useUnverifyChartMutation();

    const isChartVerified =
        savedChart?.verification !== null &&
        savedChart?.verification !== undefined;

    const promoteDisabled = !(
        project?.upstreamProjectUuid !== undefined && userCanPromoteChart
    );

    const showChartActions =
        userCanManageChart ||
        userCanCreateDeliveriesAndAlerts ||
        userCanManageExplore ||
        userCanViewContentAsCode;

    const transferItems = useMemo<ResourceViewChartItem[]>(
        () =>
            savedChart && chartViewStats.data
                ? [
                      {
                          data: {
                              ...savedChart,
                              firstViewedAt: chartViewStats.data.firstViewedAt,
                              views: chartViewStats.data.views,
                          },
                          type: ResourceViewItemType.CHART,
                      },
                  ]
                : [],
        [savedChart, chartViewStats.data],
    );

    if (!savedChart || !showChartActions) return null;

    return (
        <>
            <Menu
                position="bottom"
                returnFocus={!isDirectAccessModalOpen}
                withArrow
                width={200}
                disabled={!unsavedChartVersion.tableName}
            >
                <Menu.Dropdown>
                    {/* The agent panel docks under the page, beneath a modal */}
                    {host === 'page' && (
                        <AskAiAgentMenuItem
                            projectUuid={projectUuid}
                            chartUuid={savedChart.uuid}
                            clickedFrom="saved_chart_header"
                        />
                    )}
                    <Menu.Label>Manage</Menu.Label>
                    {userCanManageChart &&
                        !hasUnsavedChanges &&
                        !chartBelongsToDashboard && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconCopy} />}
                                onClick={chartDuplicateModalHandlers.open}
                            >
                                Duplicate
                            </Menu.Item>
                        )}
                    {userCanManageChart && !chartBelongsToDashboard && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconLayoutGridAdd} />
                            }
                            onClick={addToDashboardModalHandlers.open}
                        >
                            Add to dashboard
                        </Menu.Item>
                    )}
                    {host === 'page' &&
                        userCanManageChartViaSpace &&
                        savedChart.dashboardUuid && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconFolders} />}
                                onClick={() => setIsMovingChart(true)}
                            >
                                Move to space
                            </Menu.Item>
                        )}
                    {contentReview.canRequest && !hasUnsavedChanges && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={requestReviewModalHandlers.open}
                        >
                            Request review
                        </Menu.Item>
                    )}
                    {!chartBelongsToDashboard && userCanPinChart && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={
                                <MantineIcon
                                    icon={isPinned ? IconPinnedOff : IconPin}
                                />
                            }
                            onClick={onChartPinning}
                        >
                            {isPinned
                                ? 'Unpin from homepage'
                                : 'Pin to homepage'}
                        </Menu.Item>
                    )}
                    {directAccessAvailability.isAvailable &&
                        canManageChartAccess &&
                        !chartBelongsToDashboard && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconUsers} />}
                                onClick={directAccessModalHandlers.open}
                            >
                                Share
                            </Menu.Item>
                        )}
                    {userCanManageChart && !chartBelongsToDashboard && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconFolderSymlink} />
                            }
                            onClick={transferToSpaceModalHandlers.open}
                        >
                            Move chart
                        </Menu.Item>
                    )}
                    {userCanManageChart && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconHistory} />}
                            onClick={onOpenVersionHistory}
                        >
                            Version history
                        </Menu.Item>
                    )}
                    {/* A new explore re-initialises the page; the editor is keyed by its explore */}
                    {host === 'page' &&
                        changeChartExploreEnabled &&
                        userCanManageChart && (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconArrowsExchange} />
                                }
                                onClick={changeExploreModalHandlers.open}
                            >
                                Change explore
                            </Menu.Item>
                        )}
                    {userCanPromoteChart && (
                        <Tooltip
                            label="You must enable first an upstream project in settings > Data ops"
                            disabled={!promoteDisabled}
                        >
                            <div>
                                <Menu.Item
                                    disabled={promoteDisabled}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconDatabaseExport}
                                        />
                                    }
                                    onClick={() =>
                                        getPromoteChartDiff(savedChart.uuid)
                                    }
                                >
                                    Promote chart
                                </Menu.Item>
                            </div>
                        </Tooltip>
                    )}
                    {canManageContentVerification && (
                        <Menu.Item
                            {...(isChartVerified ? {} : verifyTourAction)}
                            leftSection={
                                isChartVerified ? (
                                    <IconCircleCheckFilled
                                        size={18}
                                        color="var(--mantine-color-green-6)"
                                    />
                                ) : (
                                    <IconCircleCheck size={18} />
                                )
                            }
                            onClick={() => {
                                if (isChartVerified) {
                                    unverifyChart(savedChart.uuid);
                                } else {
                                    verifyChart(savedChart.uuid);
                                }
                            }}
                        >
                            {isChartVerified ? 'Remove verification' : 'Verify'}
                        </Menu.Item>
                    )}

                    {(userCanViewContentAsCode || userCanManageChart) && (
                        <>
                            <Menu.Divider />
                            <Menu.Label>Content as code</Menu.Label>
                            {userCanViewContentAsCode && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconCode} />
                                    }
                                    onClick={chartAsCodeModalHandlers.open}
                                >
                                    View as code
                                </Menu.Item>
                            )}
                            {userCanManageChart && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconLink} />
                                    }
                                    onClick={chartSlugRenameModalHandlers.open}
                                >
                                    Change URL slug
                                </Menu.Item>
                            )}
                        </>
                    )}

                    <Menu.Divider />
                    <Menu.Label>Integrations</Menu.Label>
                    {userCanCreateDeliveriesAndAlerts && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={scheduledDeliveriesModalHandlers.open}
                        >
                            Scheduled deliveries
                        </Menu.Item>
                    )}
                    {userCanCreateDeliveriesAndAlerts && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconBell} />}
                            onClick={thresholdAlertsModalHandlers.open}
                        >
                            Alerts
                        </Menu.Item>
                    )}
                    {hasGoogleDriveEnabled &&
                        userCanCreateDeliveriesAndAlerts && (
                            <Can
                                I="manage"
                                this={subject('GoogleSheets', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconCirclesRelation}
                                        />
                                    }
                                    onClick={
                                        syncWithGoogleSheetsModalHandlers.open
                                    }
                                >
                                    Google Sheets Sync
                                </Menu.Item>
                            </Can>
                        )}

                    {userCanManageChart && (
                        <>
                            <Menu.Divider />
                            <Box>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            color="red"
                                        />
                                    }
                                    color="red"
                                    data-tour-anchor="delete-chart"
                                    data-tour-hint="Delete the chart"
                                    onClick={deleteModalHandlers.open}
                                >
                                    Delete
                                </Menu.Item>
                            </Box>
                        </>
                    )}
                </Menu.Dropdown>
                <Menu.Target>
                    <ActionIcon
                        variant="default"
                        aria-label="Chart actions"
                        disabled={!unsavedChartVersion.tableName}
                        // Anchor for scope walkthroughs (data-tour-via)
                        data-tour-anchor="chart-actions"
                        data-tour-hint="Open the chart's actions"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
            </Menu>

            {isAddToDashboardModalOpen && projectUuid && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    projectUuid={projectUuid}
                    uuid={savedChart.uuid}
                    dashboardTileType={DashboardTileTypes.SAVED_CHART}
                    onClose={addToDashboardModalHandlers.close}
                />
            )}
            {isDeleteModalOpen && (
                <ChartDeleteModal
                    uuid={savedChart.uuid}
                    opened={isDeleteModalOpen}
                    onClose={deleteModalHandlers.close}
                    onConfirm={() => {
                        deleteModalHandlers.close();
                        onDeleted();
                    }}
                />
            )}
            {isSyncWithGoogleSheetsModalOpen && (
                <GoogleSheetsSyncModal
                    chartUuid={savedChart.uuid}
                    opened={isSyncWithGoogleSheetsModalOpen}
                    onClose={syncWithGoogleSheetsModalHandlers.close}
                />
            )}
            {isScheduledDeliveriesModalOpen && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    itemsMap={itemsMap}
                    isOpen={isScheduledDeliveriesModalOpen}
                    onClose={() => {
                        scheduledDeliveriesModalHandlers.close();
                        setInitialSchedulerUuid(undefined);
                    }}
                    initialSchedulerUuid={initialSchedulerUuid}
                />
            )}
            {isThresholdAlertsModalOpen && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isThresholdAlert
                    itemsMap={itemsMap}
                    isOpen={isThresholdAlertsModalOpen}
                    onClose={() => {
                        thresholdAlertsModalHandlers.close();
                        setInitialThresholdUuid(undefined);
                    }}
                    initialSchedulerUuid={initialThresholdUuid}
                />
            )}
            {host === 'page' && onMovedToSpace && (
                <MoveChartThatBelongsToDashboardModal
                    className={'non-draggable'}
                    projectUuid={projectUuid}
                    uuid={savedChart.uuid}
                    name={savedChart.name}
                    spaceUuid={savedChart.spaceUuid}
                    spaceName={savedChart.spaceName}
                    opened={isMovingChart}
                    onClose={() => setIsMovingChart(false)}
                    onConfirm={onMovedToSpace}
                />
            )}
            {isChartDuplicateModalOpen && (
                <ChartDuplicateModal
                    opened={isChartDuplicateModalOpen}
                    uuid={savedChart.uuid}
                    onClose={chartDuplicateModalHandlers.close}
                    onConfirm={chartDuplicateModalHandlers.close}
                />
            )}
            {(promoteChartDiff || promoteChartDiffLoading) && (
                <PromotionConfirmDialog
                    type={'chart'}
                    resourceName={savedChart.name}
                    promotionChanges={promoteChartDiff}
                    onClose={resetPromoteChartDiff}
                    onConfirm={() => promoteChart(savedChart.uuid)}
                />
            )}
            {isDirectAccessModalOpen && projectUuid && (
                <DirectAccessModal
                    opened={isDirectAccessModalOpen}
                    onClose={directAccessModalHandlers.close}
                    projectUuid={projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.CHART,
                        resourceUuid: savedChart.uuid,
                        name: savedChart.name,
                    }}
                />
            )}
            {isRequestReviewModalOpen && projectUuid && (
                <RequestReviewModal
                    projectUuid={projectUuid}
                    contentType={ContentReviewContentType.CHART}
                    contentUuid={savedChart.uuid}
                    contentName={savedChart.name}
                    opened={isRequestReviewModalOpen}
                    onClose={requestReviewModalHandlers.close}
                />
            )}
            {isTransferToSpaceModalOpen && projectUuid && (
                <TransferItemsModal
                    projectUuid={projectUuid}
                    opened={isTransferToSpaceModalOpen}
                    items={transferItems}
                    isLoading={isMovingChart || isContentActionLoading}
                    onClose={transferToSpaceModalHandlers.close}
                    onConfirm={async (newSpaceUuid) => {
                        if (!newSpaceUuid) {
                            throw new Error('No space uuid provided');
                        }
                        await contentAction({
                            action: {
                                type: 'move',
                                targetSpaceUuid: newSpaceUuid,
                            },
                            item: {
                                uuid: savedChart.uuid,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.DBT_EXPLORE,
                            },
                        });
                        transferToSpaceModalHandlers.close();
                    }}
                />
            )}
            {isChangeExploreModalOpen &&
                projectUuid &&
                savedChart.tableName && (
                    <ChangeChartExploreModal
                        opened={isChangeExploreModalOpen}
                        onClose={changeExploreModalHandlers.close}
                        projectUuid={projectUuid}
                        chartUuid={savedChart.uuid}
                        currentExploreName={savedChart.tableName}
                        hasUnsavedChanges={hasUnsavedChanges && isEditMode}
                    />
                )}
            {projectUuid && (
                <ChartAsCodeModal
                    opened={isChartAsCodeModalOpen}
                    onClose={chartAsCodeModalHandlers.close}
                    projectUuid={projectUuid}
                    chartUuid={savedChart.uuid}
                    hasUnsavedChanges={hasUnsavedChanges && isEditMode}
                />
            )}
            {isChartSlugRenameModalOpen && projectUuid && (
                <ChartSlugRenameModal
                    opened={isChartSlugRenameModalOpen}
                    onClose={chartSlugRenameModalHandlers.close}
                    onRenamed={(slug) => {
                        chartSlugRenameModalHandlers.close();
                        onSlugRenamed?.(slug);
                    }}
                    projectUuid={projectUuid}
                    projectUrlIdentifier={projectUrlIdentifier}
                    currentSlug={savedChart.slug}
                />
            )}
        </>
    );
};

export default ChartActionsMenu;
