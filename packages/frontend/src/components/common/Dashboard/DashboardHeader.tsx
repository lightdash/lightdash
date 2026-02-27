import { subject } from '@casl/ability';
import {
    ContentType,
    ResourceViewItemType,
    type Dashboard,
    type FeatureFlags,
} from '@lightdash/common';
import {
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
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconBolt,
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
    IconSend,
    IconStar,
    IconStarFilled,
    IconShieldCheck,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useToggle } from 'react-use';
import AIDashboardSummary from '../../../ee/features/ambientAi/components/aiDashboardSummary';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteDashboardDiffMutation,
    usePromoteDashboardMutation,
} from '../../../features/promotion/hooks/usePromoteDashboard';
import { DashboardSchedulersModal } from '../../../features/scheduler';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { useDashboardPinningMutation } from '../../../hooks/pinning/useDashboardPinningMutation';
import { useVerifyDashboardMutation } from '../../../hooks/useContentVerification';
import { useProject } from '../../../hooks/useProject';
import { useClientFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { type TilePreAggregateStatus } from '../../../providers/Dashboard/types';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import MantineIcon from '../MantineIcon';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import PageHeader from '../Page/PageHeader';
import DashboardInfoOverlay from '../PageHeader/DashboardInfoOverlay';
import { ShareLinkButton } from '../ShareLinkButton';
import SpaceActionModal from '../SpaceActionModal';
import { ActionType } from '../SpaceActionModal/types';
import TransferItemsModal from '../TransferItemsModal/TransferItemsModal';
import {
    DASHBOARD_HEADER_HEIGHT,
    DASHBOARD_HEADER_ZINDEX,
} from './dashboard.constants';
import headerClasses from './DashboardHeader.module.css';
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
    isMovingDashboardToSpace: boolean;
    onSwitchTab?: (tab: Dashboard['tabs'][number] | undefined) => void;
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
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

const DashboardHeader = ({
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
    onAddTiles,
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
    const isDashboardSummariesEnabled = useClientFeatureFlag(
        'ai-dashboard-summary' as FeatureFlags,
    );

    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        organizationUuid: string;
    }>();

    const { data: project } = useProject(projectUuid);

    const { track } = useTracking();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);
    const [isScheduledDeliveriesModalOpen, toggleScheduledDeliveriesModal] =
        useToggle(false);
    const [isTransferToSpaceModalOpen, transferToSpaceModalHandlers] =
        useDisclosure(false);
    const [isPreAggAuditOpen, preAggAuditHandlers] = useDisclosure(false);
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
    const { mutate: toggleDashboardPinning } = useDashboardPinningMutation();
    const onDashboardPinning = useCallback(() => {
        if (!dashboardUuid) return;
        toggleDashboardPinning({ uuid: dashboardUuid });
    }, [dashboardUuid, toggleDashboardPinning]);

    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    const isDashboardFavorited = useMemo(
        () => favorites?.some((f) => f.data.uuid === dashboardUuid) ?? false,
        [favorites, dashboardUuid],
    );

    const { user, health } = useApp();
    const preAggregatesEnabled = health.data?.preAggregates.enabled ?? false;
    const userCanManageDashboard = user.data?.ability.can(
        'manage',
        subject('Dashboard', dashboard),
    );
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

    const userCanPinDashboard = user.data?.ability.can(
        'manage',
        subject('PinnedItems', {
            organizationUuid,
            projectUuid,
        }),
    );

    const canManageContentVerification =
        user.data?.ability?.can(
            'manage',
            subject('ContentVerification', {
                organizationUuid,
                projectUuid,
            }),
        ) === true;

    const { mutate: verifyDashboard } = useVerifyDashboardMutation();

    const userCanPromoteDashboard = user.data?.ability?.can(
        'promote',
        subject('Dashboard', {
            organizationUuid,
            projectUuid,
            access: dashboard.access,
        }),
    );

    const handleDashboardRefreshUpdateEvent = useCallback(
        (intervalMin?: number) => {
            track({
                name: EventName.DASHBOARD_AUTO_REFRESH_UPDATED,
                properties: {
                    userId: user.data?.userUuid,
                    dashboardId: dashboardUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    frequency: intervalMin ? `${intervalMin} minutes` : 'off',
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

                {dashboardUuid && (
                    <ActionIcon
                        variant="subtle"
                        size="md"
                        radius="md"
                        color={isDashboardFavorited ? 'orange' : 'ldGray.6'}
                        onClick={() => {
                            toggleFavorite({
                                contentType: ContentType.DASHBOARD,
                                contentUuid: dashboardUuid,
                            });
                        }}
                    >
                        {isDashboardFavorited ? (
                            <IconStarFilled size={16} />
                        ) : (
                            <IconStar size={16} />
                        )}
                    </ActionIcon>
                )}

                <Popover
                    withinPortal
                    withArrow
                    offset={{
                        mainAxis: -2,
                        crossAxis: 6,
                    }}
                >
                    <Popover.Target>
                        <ActionIcon
                            variant="subtle"
                            size="md"
                            radius="md"
                            color="ldGray.6"
                        >
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

                {isEditMode && userCanManageDashboard && (
                    <ActionIcon
                        variant="subtle"
                        size="md"
                        color="ldGray.6"
                        radius="md"
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

                {isTransferToSpaceModalOpen && projectUuid && (
                    <TransferItemsModal
                        projectUuid={projectUuid}
                        opened={isTransferToSpaceModalOpen}
                        onClose={transferToSpaceModalHandlers.close}
                        items={[
                            {
                                data: {
                                    ...dashboard,
                                    verification: null,
                                },
                                type: ResourceViewItemType.DASHBOARD,
                            },
                        ]}
                        isLoading={isMovingDashboardToSpace}
                        onConfirm={async (spaceUuid) => {
                            if (!spaceUuid) {
                                throw new Error(
                                    'Space UUID is required to move a dashboard',
                                );
                            }
                            await onMoveToSpace(spaceUuid);
                            transferToSpaceModalHandlers.close();
                        }}
                    />
                )}
            </Group>

            {userCanManageDashboard && isEditMode ? (
                <Group gap="xs">
                    <AddTileButton
                        onAddTiles={onAddTiles}
                        disabled={isSaving}
                        setAddingTab={setAddingTab}
                        activeTabUuid={activeTabUuid}
                        dashboardTabs={dashboardTabs}
                        radius="md"
                    />

                    <Tooltip
                        fz="xs"
                        withinPortal
                        position="bottom"
                        label="No changes to save"
                        disabled={hasDashboardChanged}
                        openDelay={200}
                        transitionProps={{ transition: 'fade', duration: 150 }}
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
                    {isDashboardSummariesEnabled &&
                        projectUuid &&
                        dashboardUuid && (
                            <AIDashboardSummary
                                projectUuid={projectUuid}
                                dashboardUuid={dashboardUuid}
                                dashboardVersionId={
                                    dashboard.dashboardVersionId
                                }
                            />
                        )}

                    {!!userCanManageDashboard && !isFullscreen && (
                        <Tooltip
                            label="Edit dashboard"
                            withinPortal
                            position="bottom"
                            openDelay={200}
                            transitionProps={{
                                transition: 'fade',
                                duration: 150,
                            }}
                        >
                            <ActionIcon
                                aria-label="Edit dashboard"
                                radius="md"
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
                        !isFullscreen) && <Divider orientation="vertical" />}

                    {oldestCacheTime && (
                        <Tooltip
                            label={`Dashboard uses cached data from ${dayjs(
                                oldestCacheTime,
                            ).format('MMM D, YYYY h:mm A')}`}
                            withinPortal
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
                                        color="ldGray.6"
                                    />

                                    <Text fz={11} c="dimmed">
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
                            onIntervalChange={handleDashboardRefreshUpdateEvent}
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
                                withinPortal
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
                                    radius="md"
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
                        <ShareLinkButton
                            url={`${window.location.href}`}
                            label="Copy link to the dashboard"
                        />
                    )}

                    {!isFullscreen && (
                        <Menu
                            data-testid="dashboard-header-menu"
                            position="bottom"
                            withArrow
                            withinPortal
                            shadow="md"
                            disabled={
                                !userCanManageDashboard && !userCanExportData
                            }
                        >
                            <Menu.Target>
                                <Box
                                    className={headerClasses.menuTargetWrapper}
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
                                    <ActionIcon
                                        variant="default"
                                        size="md"
                                        radius="md"
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Box>
                            </Menu.Target>

                            <Menu.Dropdown>
                                {!!userCanManageDashboard && (
                                    <>
                                        {preAggregatesEnabled &&
                                            preAggregateStatuses &&
                                            Object.keys(preAggregateStatuses)
                                                .length > 0 && (
                                                <>
                                                    <Menu.Item
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={IconBolt}
                                                            />
                                                        }
                                                        onClick={
                                                            preAggAuditHandlers.open
                                                        }
                                                    >
                                                        Pre-aggregation audit
                                                    </Menu.Item>
                                                    <Menu.Divider />
                                                </>
                                            )}
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconCopy} />
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
                                                <MantineIcon icon={IconPin} />
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

                                {userCanPromoteDashboard && dashboardUuid && (
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
                                                        dashboardUuid,
                                                    )
                                                }
                                            >
                                                Promote dashboard
                                            </Menu.Item>
                                        </div>
                                    </Tooltip>
                                )}

                                {canManageContentVerification &&
                                    dashboardUuid && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconShieldCheck}
                                                />
                                            }
                                            onClick={() =>
                                                verifyDashboard(dashboardUuid)
                                            }
                                        >
                                            Verify
                                        </Menu.Item>
                                    )}

                                {userCanManageDashboard && dashboardUuid && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconHistory} />
                                        }
                                        onClick={() =>
                                            navigate(
                                                `/projects/${projectUuid}/dashboards/${dashboardUuid}/history`,
                                            )
                                        }
                                    >
                                        Version history
                                    </Menu.Item>
                                )}

                                {(userCanExportData ||
                                    userCanManageDashboard) && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconUpload} />
                                        }
                                        onClick={onExport}
                                    >
                                        Export dashboard
                                    </Menu.Item>
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
                    {(promoteDashboardDiff || promoteDashboardDiffLoading) &&
                        dashboardUuid && (
                            <PromotionConfirmDialog
                                type="dashboard"
                                resourceName={dashboard.name}
                                promotionChanges={promoteDashboardDiff}
                                onClose={() => {
                                    resetPromoteDashboardDiff();
                                }}
                                onConfirm={() => {
                                    promoteDashboard(dashboardUuid);
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
        </PageHeader>
    );
};

export default DashboardHeader;
