import { subject } from '@casl/ability';
import {
    DirectAccessResourceType,
    canMutateVerifiedContent,
    ContentReviewContentType,
    ContentType,
    ResourceViewItemType,
    type Dashboard,
} from '@lightdash/common';
import {
    Badge,
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Popover,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBolt,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconCode,
    IconCopy,
    IconDatabase,
    IconDatabaseExport,
    IconDots,
    IconFolderPlus,
    IconFolderSymlink,
    IconHistory,
    IconInfoCircle,
    IconMaximize,
    IconMinimize,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconRefreshDot,
    IconSend,
    IconTrash,
    IconUpload,
    IconUsers,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useToggle } from 'react-use';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import {
    PendingReviewBadge,
    RequestReviewModal,
    useContentReviewEligibility,
} from '../../../ee/features/contentReview';
import DashboardAsCodeModal from '../../../features/contentAsCode/components/DashboardAsCodeModal';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../../features/directAccess';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteDashboardDiffMutation,
    usePromoteDashboardMutation,
} from '../../../features/promotion/hooks/usePromoteDashboard';
import { DashboardSchedulersModal } from '../../../features/scheduler';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import useDashboardPerformanceWarning from '../../../hooks/dashboard/useDashboardPerformanceWarning';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { useDashboardPinningMutation } from '../../../hooks/pinning/useDashboardPinningMutation';
import {
    useUnverifyDashboardMutation,
    useVerifyDashboardMutation,
} from '../../../hooks/useContentVerification';
import { useProject } from '../../../hooks/useProject';
import { useProjectUrlIdentifier } from '../../../hooks/useProjectRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useApp from '../../../providers/App/useApp';
import { type TilePreAggregateStatus } from '../../../providers/Dashboard/types';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import { FavoriteActionIcon } from '../FavoriteActionIcon';
import MantineIcon from '../MantineIcon';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import PageHeader from '../Page/PageHeader';
import DashboardInfoOverlay from '../PageHeader/DashboardInfoOverlay';
import ShareShortLinkButton from '../ShareShortLinkButton';
import SpaceActionModal from '../SpaceActionModal';
import { ActionType } from '../SpaceActionModal/types';
import TransferItemsModal from '../TransferItemsModal/TransferItemsModal';
import {
    DASHBOARD_HEADER_HEIGHT,
    DASHBOARD_HEADER_ZINDEX,
} from './dashboard.constants';
import headerClasses from './DashboardHeader.module.css';
import DashboardPreAggRefreshModal from './DashboardPreAggRefreshModal';
import { DashboardRefreshButton } from './DashboardRefreshButton';
import { PreAggregateAuditDrawer } from './PreAggregateAuditIndicator';

type DashboardHeaderProps = {
    dashboard: Dashboard;
    organizationUuid?: string;
    hasDashboardChanged: boolean;
    isEditMode: boolean;
    isSaving: boolean;
    isFullScreenFeatureEnabled?: boolean;
    isFullscreen: boolean;
    oldestCacheTime?: Date;
    preAggregateStatuses?: Record<string, TilePreAggregateStatus>;
    allTilesLoaded?: boolean;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
    dashboardTiles?: Dashboard['tiles'];
    isMovingDashboardToSpace: boolean;
    onSwitchTab?: (tab: Dashboard['tabs'][number] | undefined) => void;
    onAddTiles: (
        tiles: Dashboard['tiles'][number][],
        // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
        tileUuidMapping?: Record<string, string>,
    ) => void;
    // Overrides the default "New chart" navigation so the chart is built in
    // a modal over the dashboard instead of on the Explorer page.
    onNewChart?: () => void;
    onCancel: () => void;
    onSaveDashboard: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onMoveToSpace: (spaceUuid: string) => void;
    onExport: () => void;
    onToggleFullscreen: () => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    onEditClicked: () => void;
    className?: string;
};

const DashboardHeader = memo(
    ({
        dashboard,
        organizationUuid,
        hasDashboardChanged,
        isEditMode,
        isSaving,
        isMovingDashboardToSpace,
        onSwitchTab,
        isFullScreenFeatureEnabled,
        isFullscreen,
        oldestCacheTime,
        preAggregateStatuses,
        allTilesLoaded,
        activeTabUuid,
        dashboardTabs,
        dashboardTiles,
        onAddTiles,
        onNewChart,
        onCancel,
        onSaveDashboard,
        onDelete,
        onDuplicate,
        onMoveToSpace,
        onExport,
        onToggleFullscreen,
        setAddingTab,
        onEditClicked,
        className,
    }: DashboardHeaderProps) => {
        const performanceWarning = useDashboardPerformanceWarning(
            dashboardTiles,
            dashboardTabs,
        );
        const { search, pathname } = useLocation();
        const navigate = useNavigate();
        const projectUuid = useProjectUuid();
        const projectUrlIdentifier = useProjectUrlIdentifier();
        const dashboardUuid = dashboard.uuid;
        const dashboardIdentifier = dashboard.slug;

        const { data: project } = useProject(projectUuid);

        const { track } = useTracking();
        const [isUpdating, setIsUpdating] = useState(false);
        const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);
        const [isScheduledDeliveriesModalOpen, toggleScheduledDeliveriesModal] =
            useToggle(false);
        const [isTransferToSpaceModalOpen, transferToSpaceModalHandlers] =
            useDisclosure(false);
        const [isRequestReviewModalOpen, requestReviewModalHandlers] =
            useDisclosure(false);
        const contentReview = useContentReviewEligibility({
            projectUuid,
            contentType: ContentReviewContentType.DASHBOARD,
            contentUuid: dashboard.uuid,
            spaceUuid: dashboard.spaceUuid,
        });
        const [isDirectAccessModalOpen, directAccessModalHandlers] =
            useDisclosure(false);
        const directAccessAvailability = useDirectAccessAvailability();
        const canManageDashboardAccess = useCanManageDirectAccess({
            projectUuid,
            spaceUuid: dashboard.spaceUuid,
            createdByUserUuid: null,
            access: dashboard.access ?? [],
            grantRoles: [],
        });
        const [isPreAggAuditOpen, preAggAuditHandlers] = useDisclosure(false);
        const [isPreAggRefreshOpen, preAggRefreshHandlers] =
            useDisclosure(false);
        const [isDashboardAsCodeModalOpen, dashboardAsCodeModalHandlers] =
            useDisclosure(false);

        const uniquePreAggregateNames = useMemo(() => {
            if (!preAggregateStatuses) return [];
            return [
                ...new Set(
                    Object.values(preAggregateStatuses)
                        .filter((s) => s.hit && s.preAggregateName !== null)
                        .map((s) => s.preAggregateName as string),
                ),
            ];
        }, [preAggregateStatuses]);
        const handleEditClick = () => {
            setIsUpdating(true);
            track({ name: EventName.UPDATE_DASHBOARD_NAME_CLICKED });
        };
        const { mutate: promoteDashboard } = usePromoteDashboardMutation();
        const {
            mutate: getPromoteDashboardDiff,
            data: promoteDashboardDiff,
            reset: resetPromoteDashboardDiff,
            isLoading: promoteDashboardDiffLoading,
        } = usePromoteDashboardDiffMutation();

        // Capture scheduler UUID from URL for deep linking to edit mode
        const [initialSchedulerUuid, setInitialSchedulerUuid] = useState<
            string | undefined
        >(() => getSchedulerUuidFromUrlParams(search) ?? undefined);

        const hasProcessedUrlParams = useRef(false);
        useEffect(() => {
            if (hasProcessedUrlParams.current) return;

            const schedulerUuidFromUrlParams =
                getSchedulerUuidFromUrlParams(search);

            if (!schedulerUuidFromUrlParams) {
                return;
            }

            hasProcessedUrlParams.current = true;
            toggleScheduledDeliveriesModal(true);

            // Clear URL params to prevent modal from reopening on close
            const newParams = new URLSearchParams(search);
            newParams.delete('scheduler_uuid');
            void navigate(
                { pathname, search: newParams.toString() },
                { replace: true },
            );
        }, [search, pathname, navigate, toggleScheduledDeliveriesModal]);

        // Clear initial UUID when modal is closed so reopening shows the list
        const wasScheduledDeliveriesModalOpen = useRef(false);
        useEffect(() => {
            // Only clear when transitioning from open to closed, not on initial render
            if (
                wasScheduledDeliveriesModalOpen.current &&
                !isScheduledDeliveriesModalOpen
            ) {
                setInitialSchedulerUuid(undefined);
            }
            wasScheduledDeliveriesModalOpen.current =
                isScheduledDeliveriesModalOpen;
        }, [isScheduledDeliveriesModalOpen]);

        const isPinned = useMemo(() => {
            return Boolean(dashboard?.pinnedListUuid);
        }, [dashboard?.pinnedListUuid]);
        const { mutate: toggleDashboardPinning } =
            useDashboardPinningMutation();
        const onDashboardPinning = useCallback(() => {
            if (!dashboardUuid) return;
            toggleDashboardPinning({ uuid: dashboardUuid });
        }, [dashboardUuid, toggleDashboardPinning]);

        const { data: favorites } = useFavorites(projectUuid);
        const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
        const isDashboardFavorited = useMemo(
            () =>
                favorites?.some((f) => f.data.uuid === dashboardUuid) ?? false,
            [favorites, dashboardUuid],
        );

        const { user, health } = useApp();
        const preAggregatesEnabled =
            health.data?.preAggregates.enabled ?? false;
        const userCanManageDashboard =
            !!user.data?.ability.can(
                'manage',
                subject('Dashboard', dashboard),
            ) &&
            canMutateVerifiedContent(
                user.data.ability,
                {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                },
                dashboard.verification,
                user.data.userUuid,
            );
        const userCanRefreshPreAggregates =
            user.data?.ability.can(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) && user.data?.ability.can('manage', 'CompileProject');
        const userCanCreateDeliveries = user.data?.ability?.can(
            'create',
            subject('ScheduledDeliveries', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        );

        const userCanExportData = user.data?.ability.can(
            'manage',
            subject('ExportCsv', { organizationUuid, projectUuid }),
        );

        const userCanViewContentAsCode =
            project &&
            user.data?.ability.can(
                'view',
                subject('ContentAsCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            );

        const userCanPinDashboard = user.data?.ability.can(
            'manage',
            subject('PinnedItems', {
                organizationUuid,
                projectUuid,
            }),
        );

        const userCanPromoteDashboard = user.data?.ability?.can(
            'promote',
            subject('Dashboard', {
                organizationUuid,
                projectUuid,
                access: dashboard.access,
            }),
        );

        const canManageContentVerification =
            user.data?.ability?.can(
                'manage',
                subject('ContentVerification', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                }),
            ) === true;

        const { mutate: verifyDashboard } = useVerifyDashboardMutation();
        const { mutate: unverifyDashboard } = useUnverifyDashboardMutation();
        const isDashboardVerified = !!dashboard?.verification;

        const handleDashboardRefreshUpdateEvent = useCallback(
            (intervalMin?: number) => {
                track({
                    name: EventName.DASHBOARD_AUTO_REFRESH_UPDATED,
                    properties: {
                        userId: user.data?.userUuid,
                        dashboardId: dashboardUuid,
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        frequency: intervalMin
                            ? `${intervalMin} minutes`
                            : 'off',
                    },
                });
            },
            [
                dashboardUuid,
                organizationUuid,
                projectUuid,
                track,
                user.data?.userUuid,
            ],
        );

        return (
            <PageHeader
                cardProps={{
                    px: 'xl',
                    py: 0,
                    h: DASHBOARD_HEADER_HEIGHT,
                    style: { zIndex: DASHBOARD_HEADER_ZINDEX },
                    className,
                }}
            >
                <Group gap="xs" flex={1} wrap="nowrap">
                    <Title order={6}>{dashboard.name}</Title>
                    {dashboard.hasUnpublishedChanges && (
                        <Tooltip
                            label="Only you can see these changes. A reviewer can write them back to the repo from Content review."
                            maw={280}
                        >
                            <Badge
                                color="yellow"
                                variant="dot"
                                size="sm"
                                style={{ cursor: 'default' }}
                            >
                                Unpublished changes
                            </Badge>
                        </Tooltip>
                    )}
                    {!!dashboard.draftsAwaitingReview && (
                        <Tooltip
                            label="Other people have unpublished changes on this dashboard. Review them and write them back to the repo."
                            maw={280}
                        >
                            <Badge
                                component={Link}
                                to={`/generalSettings/projectManagement/${dashboard.projectUuid}/contentReview`}
                                color="blue"
                                variant="dot"
                                size="sm"
                                className="ld-pointer"
                            >
                                {dashboard.draftsAwaitingReview} draft
                                {dashboard.draftsAwaitingReview === 1
                                    ? ''
                                    : 's'}{' '}
                                to review
                            </Badge>
                        </Tooltip>
                    )}
                    <Popover
                        withArrow
                        offset={{
                            mainAxis: -2,
                            crossAxis: 6,
                        }}
                    >
                        <Popover.Target>
                            <ActionIcon size="md">
                                <MantineIcon icon={IconInfoCircle} />
                            </ActionIcon>
                        </Popover.Target>

                        <Popover.Dropdown maw={500} p={0}>
                            <DashboardInfoOverlay
                                dashboard={dashboard}
                                projectUuid={projectUuid}
                            />
                        </Popover.Dropdown>
                    </Popover>

                    {contentReview.pendingRequest && (
                        <PendingReviewBadge
                            request={contentReview.pendingRequest}
                        />
                    )}

                    {isDashboardVerified && (
                        <Tooltip
                            label={
                                dashboard?.verification?.verifiedBy
                                    ? `Verified by ${dashboard.verification.verifiedBy.firstName} ${dashboard.verification.verifiedBy.lastName}`
                                    : 'Verified'
                            }
                            zIndex={10000}
                        >
                            <IconCircleCheckFilled
                                size={16}
                                style={{
                                    color: 'var(--mantine-color-green-6)',
                                }}
                            />
                        </Tooltip>
                    )}

                    {dashboardUuid && (
                        <FavoriteActionIcon
                            size="md"
                            isFavorite={isDashboardFavorited}
                            onToggle={() => {
                                toggleFavorite({
                                    contentType: ContentType.DASHBOARD,
                                    contentUuid: dashboardUuid,
                                });
                            }}
                        />
                    )}

                    {isEditMode && userCanManageDashboard && (
                        <ActionIcon
                            size="md"
                            disabled={isSaving}
                            onClick={handleEditClick}
                        >
                            <MantineIcon
                                icon={IconPencil}
                                size={14}
                                strokeWidth={2.25}
                            />
                        </ActionIcon>
                    )}

                    {isUpdating && dashboardUuid && (
                        <DashboardUpdateModal
                            uuid={dashboardUuid}
                            opened={isUpdating}
                            onClose={() => setIsUpdating(false)}
                            onConfirm={() => setIsUpdating(false)}
                        />
                    )}

                    {isDirectAccessModalOpen && projectUuid && (
                        <DirectAccessModal
                            opened={isDirectAccessModalOpen}
                            onClose={directAccessModalHandlers.close}
                            projectUuid={projectUuid}
                            resource={{
                                resourceType:
                                    DirectAccessResourceType.DASHBOARD,
                                resourceUuid: dashboard.uuid,
                                name: dashboard.name,
                            }}
                        />
                    )}
                    {isRequestReviewModalOpen && projectUuid && (
                        <RequestReviewModal
                            projectUuid={projectUuid}
                            contentType={ContentReviewContentType.DASHBOARD}
                            contentUuid={dashboard.uuid}
                            contentName={dashboard.name}
                            opened={isRequestReviewModalOpen}
                            onClose={requestReviewModalHandlers.close}
                        />
                    )}
                    {isTransferToSpaceModalOpen && projectUuid && (
                        <TransferItemsModal
                            projectUuid={projectUuid}
                            opened={isTransferToSpaceModalOpen}
                            onClose={transferToSpaceModalHandlers.close}
                            items={[
                                {
                                    data: dashboard,
                                    type: ResourceViewItemType.DASHBOARD,
                                },
                            ]}
                            isLoading={isMovingDashboardToSpace}
                            onConfirm={(spaceUuid) => {
                                if (!spaceUuid) {
                                    throw new Error(
                                        'Space UUID is required to move a dashboard',
                                    );
                                }
                                onMoveToSpace(spaceUuid);
                                transferToSpaceModalHandlers.close();
                            }}
                        />
                    )}
                </Group>

                {userCanManageDashboard && isEditMode ? (
                    <Group gap="xs">
                        {performanceWarning.hasWarning && (
                            <Tooltip
                                label={
                                    <Box>
                                        <Text size="sm" fw={500} mb={6}>
                                            Speed up this dashboard
                                        </Text>
                                        <Text size="xs">
                                            With{' '}
                                            {performanceWarning.totalChartCount}{' '}
                                            charts, load times can be slower
                                            depending on the user's machine.{' '}
                                            {performanceWarning.totalTabs <= 1
                                                ? `We recommend splitting this into multiple dashboard tabs, limited to ${performanceWarning.tabsExceedingLimit[0]?.limit ?? 10} charts per tab to keep things snappy for your team.`
                                                : `We recommend splitting this into multiple dashboards to keep things snappy for your team.`}
                                        </Text>
                                    </Box>
                                }
                                withinPortal
                                position="bottom"
                                multiline
                                maw={320}
                                openDelay={200}
                                transitionProps={{
                                    transition: 'fade',
                                    duration: 150,
                                }}
                            >
                                <ActionIcon size="md" color="orange.6">
                                    <MantineIcon icon={IconAlertTriangle} />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        <AddTileButton
                            onAddTiles={onAddTiles}
                            disabled={isSaving}
                            setAddingTab={setAddingTab}
                            activeTabUuid={activeTabUuid}
                            dashboardTabs={dashboardTabs}
                            onNewChart={onNewChart}
                            radius="md"
                        />

                        <Tooltip
                            fz="xs"
                            position="bottom"
                            label="No changes to save"
                            disabled={hasDashboardChanged}
                            openDelay={200}
                            transitionProps={{
                                transition: 'fade',
                                duration: 150,
                            }}
                        >
                            <Box>
                                <Button
                                    size="xs"
                                    disabled={!hasDashboardChanged}
                                    loading={isSaving}
                                    onClick={onSaveDashboard}
                                    color="green.7"
                                >
                                    Save changes
                                </Button>
                            </Box>
                        </Tooltip>
                        <Button
                            variant="default"
                            size="xs"
                            disabled={isSaving}
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    </Group>
                ) : (
                    <Group gap="sm">
                        {!!userCanManageDashboard && !isFullscreen && (
                            <Tooltip
                                label="Edit dashboard"
                                position="bottom"
                                openDelay={200}
                                transitionProps={{
                                    transition: 'fade',
                                    duration: 150,
                                }}
                            >
                                <ActionIcon
                                    aria-label="Edit dashboard"
                                    onClick={onEditClicked}
                                    bg="foreground"
                                    c="background"
                                    size="md"
                                >
                                    <MantineIcon
                                        icon={IconPencil}
                                        color="background"
                                        size="md"
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        {(userCanExportData ||
                            (!isEditMode &&
                                document.fullscreenEnabled &&
                                isFullScreenFeatureEnabled) ||
                            !isFullscreen) && (
                            <Divider orientation="vertical" />
                        )}

                        {oldestCacheTime && (
                            <Tooltip
                                label={`Dashboard uses cached data from ${dayjs(
                                    oldestCacheTime,
                                ).format('MMM D, YYYY h:mm A')}`}
                                position="bottom"
                                openDelay={200}
                                transitionProps={{
                                    transition: 'fade',
                                    duration: 150,
                                }}
                            >
                                <UnstyledButton>
                                    <Group gap={6}>
                                        <MantineIcon
                                            icon={IconDatabase}
                                            size="sm"
                                            color="dimmed"
                                        />

                                        <Text fz="xs" c="dimmed">
                                            {dayjs(oldestCacheTime).format(
                                                'MMM D, h:mm A',
                                            )}
                                        </Text>
                                    </Group>
                                </UnstyledButton>
                            </Tooltip>
                        )}

                        {userCanExportData && (
                            <DashboardRefreshButton
                                onIntervalChange={
                                    handleDashboardRefreshUpdateEvent
                                }
                            />
                        )}

                        {!isEditMode &&
                            document.fullscreenEnabled &&
                            isFullScreenFeatureEnabled && (
                                <Tooltip
                                    label={
                                        isFullscreen
                                            ? 'Exit Fullscreen Mode'
                                            : 'Enter Fullscreen Mode'
                                    }
                                    position="bottom"
                                    openDelay={200}
                                    transitionProps={{
                                        transition: 'fade',
                                        duration: 150,
                                    }}
                                >
                                    <ActionIcon
                                        variant="default"
                                        size="md"
                                        onClick={onToggleFullscreen}
                                    >
                                        <MantineIcon
                                            icon={
                                                isFullscreen
                                                    ? IconMinimize
                                                    : IconMaximize
                                            }
                                            size="md"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}

                        {userCanExportData && !isFullscreen && (
                            <ShareShortLinkButton />
                        )}

                        {!isFullscreen && (
                            <Menu
                                data-testid="dashboard-header-menu"
                                position="bottom"
                                withArrow
                                disabled={
                                    !userCanManageDashboard &&
                                    !userCanExportData &&
                                    !userCanViewContentAsCode
                                }
                            >
                                <Menu.Target>
                                    <Box
                                        className={
                                            headerClasses.menuTargetWrapper
                                        }
                                    >
                                        {preAggregatesEnabled && (
                                            <Box
                                                className={
                                                    headerClasses.zapIndicator
                                                }
                                                data-settled={
                                                    allTilesLoaded || undefined
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconBolt}
                                                    size={9}
                                                />
                                            </Box>
                                        )}
                                        <ActionIcon variant="default" size="md">
                                            <MantineIcon icon={IconDots} />
                                        </ActionIcon>
                                    </Box>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <AskAiAgentMenuItem
                                        projectUuid={projectUuid}
                                        dashboardUuid={dashboard.uuid}
                                        clickedFrom="dashboard_header"
                                    />
                                    {/* TODO: add a create-issue entry point once the issues flow is finalized */}
                                    {!!userCanManageDashboard && (
                                        <>
                                            {preAggregatesEnabled &&
                                                preAggregateStatuses &&
                                                Object.keys(
                                                    preAggregateStatuses,
                                                ).length > 0 && (
                                                    <>
                                                        <Menu.Item
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconBolt
                                                                    }
                                                                />
                                                            }
                                                            onClick={
                                                                preAggAuditHandlers.open
                                                            }
                                                        >
                                                            Pre-aggregation
                                                            audit
                                                        </Menu.Item>
                                                        {userCanRefreshPreAggregates &&
                                                            uniquePreAggregateNames.length >
                                                                0 && (
                                                                <Menu.Item
                                                                    leftSection={
                                                                        <MantineIcon
                                                                            icon={
                                                                                IconRefreshDot
                                                                            }
                                                                        />
                                                                    }
                                                                    onClick={
                                                                        preAggRefreshHandlers.open
                                                                    }
                                                                >
                                                                    Rebuild
                                                                    pre-aggregates
                                                                </Menu.Item>
                                                            )}
                                                        <Menu.Divider />
                                                    </>
                                                )}
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconPencil}
                                                    />
                                                }
                                                onClick={handleEditClick}
                                            >
                                                Edit details
                                            </Menu.Item>

                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconCopy}
                                                    />
                                                }
                                                onClick={onDuplicate}
                                            >
                                                Duplicate
                                            </Menu.Item>

                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconFolderSymlink}
                                                    />
                                                }
                                                onClick={
                                                    transferToSpaceModalHandlers.open
                                                }
                                            >
                                                Move dashboard
                                            </Menu.Item>

                                            {contentReview.canRequest && (
                                                <Menu.Item
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconSend}
                                                        />
                                                    }
                                                    onClick={
                                                        requestReviewModalHandlers.open
                                                    }
                                                >
                                                    Request review
                                                </Menu.Item>
                                            )}

                                            {directAccessAvailability.isAvailable &&
                                                canManageDashboardAccess && (
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
                                        </>
                                    )}

                                    {userCanPinDashboard && (
                                        <Menu.Item
                                            component="button"
                                            role="menuitem"
                                            leftSection={
                                                isPinned ? (
                                                    <MantineIcon
                                                        icon={IconPinnedOff}
                                                    />
                                                ) : (
                                                    <MantineIcon
                                                        icon={IconPin}
                                                    />
                                                )
                                            }
                                            onClick={onDashboardPinning}
                                        >
                                            {isPinned
                                                ? 'Unpin from homepage'
                                                : 'Pin to homepage'}
                                        </Menu.Item>
                                    )}

                                    {!!userCanCreateDeliveries && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconSend} />
                                            }
                                            onClick={() => {
                                                toggleScheduledDeliveriesModal(
                                                    true,
                                                );
                                            }}
                                        >
                                            Scheduled deliveries
                                        </Menu.Item>
                                    )}

                                    {userCanPromoteDashboard &&
                                        dashboardUuid && (
                                            <Tooltip
                                                label="You must enable first an upstream project in settings > Data ops"
                                                disabled={
                                                    project?.upstreamProjectUuid !==
                                                    undefined
                                                }
                                            >
                                                <div>
                                                    <Menu.Item
                                                        disabled={
                                                            project?.upstreamProjectUuid ===
                                                            undefined
                                                        }
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={
                                                                    IconDatabaseExport
                                                                }
                                                            />
                                                        }
                                                        onClick={() =>
                                                            getPromoteDashboardDiff(
                                                                dashboard.uuid,
                                                            )
                                                        }
                                                    >
                                                        Promote dashboard
                                                    </Menu.Item>
                                                </div>
                                            </Tooltip>
                                        )}

                                    {userCanManageDashboard &&
                                        dashboardUuid && (
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconHistory}
                                                    />
                                                }
                                                onClick={() =>
                                                    navigate(
                                                        `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/history`,
                                                    )
                                                }
                                            >
                                                Version history
                                            </Menu.Item>
                                        )}

                                    {canManageContentVerification &&
                                        dashboardUuid && (
                                            <Menu.Item
                                                leftSection={
                                                    isDashboardVerified ? (
                                                        <IconCircleCheckFilled
                                                            size={16}
                                                            style={{
                                                                color: 'var(--mantine-color-green-6)',
                                                            }}
                                                        />
                                                    ) : (
                                                        <MantineIcon
                                                            icon={
                                                                IconCircleCheck
                                                            }
                                                        />
                                                    )
                                                }
                                                onClick={() => {
                                                    if (isDashboardVerified) {
                                                        unverifyDashboard(
                                                            dashboardUuid,
                                                        );
                                                    } else {
                                                        verifyDashboard(
                                                            dashboardUuid,
                                                        );
                                                    }
                                                }}
                                            >
                                                {isDashboardVerified
                                                    ? 'Remove verification'
                                                    : 'Verify dashboard'}
                                            </Menu.Item>
                                        )}

                                    {(userCanExportData ||
                                        userCanManageDashboard) && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconUpload}
                                                />
                                            }
                                            onClick={onExport}
                                        >
                                            Export dashboard
                                        </Menu.Item>
                                    )}

                                    {userCanViewContentAsCode && (
                                        <>
                                            <Menu.Divider />
                                            <Menu.Label>
                                                Content as code
                                            </Menu.Label>
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconCode}
                                                    />
                                                }
                                                onClick={
                                                    dashboardAsCodeModalHandlers.open
                                                }
                                            >
                                                View as code
                                            </Menu.Item>
                                        </>
                                    )}

                                    {userCanManageDashboard && (
                                        <>
                                            <Menu.Divider />
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                        color="red"
                                                    />
                                                }
                                                onClick={onDelete}
                                                color="red"
                                            >
                                                Delete
                                            </Menu.Item>
                                        </>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        )}

                        {isCreatingNewSpace && projectUuid && (
                            <SpaceActionModal
                                projectUuid={projectUuid}
                                actionType={ActionType.CREATE}
                                title="Create new space"
                                confirmButtonLabel="Create"
                                icon={IconFolderPlus}
                                onClose={() => setIsCreatingNewSpace(false)}
                                parentSpaceUuid={null}
                                onSubmitForm={(space) => {
                                    if (space) onMoveToSpace(space.uuid);
                                }}
                            />
                        )}
                        {isScheduledDeliveriesModalOpen && dashboardUuid && (
                            <DashboardSchedulersModal
                                dashboardUuid={dashboardUuid}
                                name={dashboard.name}
                                isOpen={isScheduledDeliveriesModalOpen}
                                onClose={() =>
                                    toggleScheduledDeliveriesModal(false)
                                }
                                initialSchedulerUuid={initialSchedulerUuid}
                            />
                        )}
                        {projectUuid && (
                            <DashboardAsCodeModal
                                opened={isDashboardAsCodeModalOpen}
                                onClose={dashboardAsCodeModalHandlers.close}
                                projectUuid={projectUuid}
                                dashboardUuid={dashboard.uuid}
                                hasUnsavedChanges={
                                    hasDashboardChanged && isEditMode
                                }
                            />
                        )}
                        {(promoteDashboardDiff ||
                            promoteDashboardDiffLoading) &&
                            dashboardUuid && (
                                <PromotionConfirmDialog
                                    type="dashboard"
                                    resourceName={dashboard.name}
                                    promotionChanges={promoteDashboardDiff}
                                    onClose={() => {
                                        resetPromoteDashboardDiff();
                                    }}
                                    onConfirm={() => {
                                        promoteDashboard(dashboard.uuid);
                                    }}
                                />
                            )}
                    </Group>
                )}
                {preAggregatesEnabled && preAggregateStatuses && (
                    <PreAggregateAuditDrawer
                        opened={isPreAggAuditOpen}
                        onClose={preAggAuditHandlers.close}
                        statuses={preAggregateStatuses}
                        activeTabUuid={activeTabUuid}
                        dashboardTabs={dashboardTabs ?? []}
                        onSwitchTab={(tab) => onSwitchTab?.(tab)}
                    />
                )}
                {preAggregatesEnabled &&
                    projectUuid &&
                    uniquePreAggregateNames.length > 0 && (
                        <DashboardPreAggRefreshModal
                            opened={isPreAggRefreshOpen}
                            onClose={preAggRefreshHandlers.close}
                            projectUuid={projectUuid}
                            preAggregateNames={uniquePreAggregateNames}
                        />
                    )}
            </PageHeader>
        );
    },
);

export default DashboardHeader;
