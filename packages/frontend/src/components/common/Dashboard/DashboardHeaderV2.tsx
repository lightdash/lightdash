import { subject } from '@casl/ability';
import { type FeatureFlags, ResourceViewItemType } from '@lightdash/common';
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
    IconCopy,
    IconDatabase,
    IconDatabaseExport,
    IconDots,
    IconFolderPlus,
    IconFolderSymlink,
    IconInfoCircle,
    IconMaximize,
    IconMinimize,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { useToggle } from 'react-use';
import AIDashboardSummary from '../../../ee/features/ambientAi/components/aiDashboardSummary';
import { SwitchToClassicMenuItem } from '../../../features/dashboardTabsV2/DashboardUIToggle';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteDashboardDiffMutation,
    usePromoteDashboardMutation,
} from '../../../features/promotion/hooks/usePromoteDashboard';
import { DashboardSchedulersModal } from '../../../features/scheduler';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import { useDashboardPinningMutation } from '../../../hooks/pinning/useDashboardPinningMutation';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import MantineIcon from '../MantineIcon';
import PageHeader from '../Page/PageHeader';
import DashboardInfoOverlayV2 from '../PageHeader/DashboardInfoOverlayV2';
import SpaceActionModal from '../SpaceActionModal';
import { ActionType } from '../SpaceActionModal/types';
import TransferItemsModal from '../TransferItemsModal/TransferItemsModal';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import { type DashboardHeaderProps } from './DashboardHeaderV1';
import { DashboardRefreshButtonV2 } from './DashboardRefreshButtonV2';
import { ShareLinkButtonV2 } from './ShareLinkButtonV2';
import {
    DASHBOARD_HEADER_HEIGHT,
    DASHBOARD_HEADER_ZINDEX,
} from './dashboard.constants';

const DashboardHeaderV2 = ({
    dashboard,
    organizationUuid,
    hasDashboardChanged,
    isEditMode,
    isSaving,
    isMovingDashboardToSpace,
    isFullScreenFeatureEnabled,
    isFullscreen,
    oldestCacheTime,
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
    const isDashboardSummariesEnabled = useFeatureFlagEnabled(
        'ai-dashboard-summary' as FeatureFlags,
    );

    const { search } = useLocation();
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

    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        if (schedulerUuidFromUrlParams) {
            toggleScheduledDeliveriesModal(true);
        }
    }, [search, toggleScheduledDeliveriesModal]);

    const isPinned = useMemo(() => {
        return Boolean(dashboard?.pinnedListUuid);
    }, [dashboard?.pinnedListUuid]);
    const { mutate: toggleDashboardPinning } = useDashboardPinningMutation();
    const onDashboardPinning = useCallback(() => {
        if (!dashboardUuid) return;
        toggleDashboardPinning({ uuid: dashboardUuid });
    }, [dashboardUuid, toggleDashboardPinning]);

    const { user } = useApp();
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
                bg: 'background',
                sx: { zIndex: DASHBOARD_HEADER_ZINDEX },
                className,
            }}
        >
            <Group gap="xs" flex={1}>
                <Title order={6}>{dashboard.name}</Title>

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
                        <DashboardInfoOverlayV2
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
                                data: dashboard,
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
                        <DashboardRefreshButtonV2
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
                        <ShareLinkButtonV2 url={`${window.location.href}`} />
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
                                <ActionIcon
                                    variant="default"
                                    size="md"
                                    radius="md"
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                                {!!userCanManageDashboard && (
                                    <>
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

                                <SwitchToClassicMenuItem />

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
                            ></PromotionConfirmDialog>
                        )}
                </Group>
            )}
        </PageHeader>
    );
};

export default DashboardHeaderV2;
