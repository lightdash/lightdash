import { subject } from '@casl/ability';
import {
    ResourceViewItemType,
    type Dashboard,
    type FeatureFlags,
    type SpaceSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Popover,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconFolderPlus,
    IconFolderSymlink,
    IconInfoCircle,
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
import AIDashboardSummary from '../../../ee/features/aiDashboardSummary';
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
import SlugInfo from '../PageHeader/SlugInfo';
import SpaceAndDashboardInfo from '../PageHeader/SpaceAndDashboardInfo';
import { UpdatedInfo } from '../PageHeader/UpdatedInfo';
import ViewInfo from '../PageHeader/ViewInfo';
import SpaceActionModal from '../SpaceActionModal';
import { ActionType } from '../SpaceActionModal/types';
import TransferItemsModal from '../TransferItemsModal/TransferItemsModal';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import { DashboardRefreshButton } from './DashboardRefreshButton';
import ShareLinkButton from './ShareLinkButton';

type DashboardHeaderProps = {
    spaces?: SpaceSummary[];
    dashboard: Dashboard;
    organizationUuid?: string;
    hasDashboardChanged: boolean;
    isEditMode: boolean;
    isSaving: boolean;
    isFullScreenFeatureEnabled?: boolean;
    isFullscreen: boolean;
    oldestCacheTime?: Date;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
    isMovingDashboardToSpace: boolean;
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
};

const DashboardHeader = ({
    spaces = [],
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
                h: 'auto',
            }}
        >
            <Group spacing="xs" style={{ flex: 1 }}>
                <Title order={4} fw={600}>
                    {dashboard.name}
                </Title>

                <Popover
                    withinPortal
                    withArrow
                    offset={{
                        mainAxis: -2,
                        crossAxis: 6,
                    }}
                >
                    <Popover.Target>
                        <ActionIcon color="dark">
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Popover.Target>

                    <Popover.Dropdown maw={500}>
                        <Stack spacing="xs">
                            {dashboard.description && (
                                <Text
                                    fz="xs"
                                    color="gray.7"
                                    fw={500}
                                    style={{ whiteSpace: 'pre-line' }}
                                >
                                    {dashboard.description}
                                </Text>
                            )}

                            <UpdatedInfo
                                updatedAt={dashboard.updatedAt}
                                user={dashboard.updatedByUser}
                            />

                            <ViewInfo
                                views={dashboard.views}
                                firstViewedAt={dashboard.firstViewedAt}
                            />

                            <SlugInfo slug={dashboard.slug} />

                            {dashboard.spaceName && (
                                <SpaceAndDashboardInfo
                                    space={{
                                        link: `/projects/${projectUuid}/spaces/${dashboard.spaceUuid}`,
                                        name: dashboard.spaceName,
                                    }}
                                />
                            )}
                        </Stack>
                    </Popover.Dropdown>
                </Popover>

                {isEditMode && userCanManageDashboard && (
                    <ActionIcon
                        color="dark"
                        disabled={isSaving}
                        onClick={handleEditClick}
                    >
                        <MantineIcon icon={IconPencil} />
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
                        spaces={spaces}
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

            {oldestCacheTime && (
                <Text
                    color="gray"
                    mr="sm"
                    sx={{ fontSize: '11px', textAlign: 'end' }}
                >
                    Dashboard uses cached data from
                    <Text fw={700}>
                        {dayjs(oldestCacheTime).format('MMM D, YYYY h:mm A')}{' '}
                    </Text>
                </Text>
            )}

            {userCanManageDashboard && isEditMode ? (
                <Group spacing="xs">
                    <AddTileButton
                        onAddTiles={onAddTiles}
                        disabled={isSaving}
                        setAddingTab={setAddingTab}
                        activeTabUuid={activeTabUuid}
                        dashboardTabs={dashboardTabs}
                    />

                    <Tooltip
                        fz="xs"
                        withinPortal
                        position="bottom"
                        label="No changes to save"
                        disabled={hasDashboardChanged}
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
                <Group spacing="xs">
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
                            >
                                <ActionIcon
                                    variant="default"
                                    onClick={onToggleFullscreen}
                                >
                                    <MantineIcon
                                        icon={
                                            isFullscreen
                                                ? IconArrowsMinimize
                                                : IconArrowsMaximize
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}

                    {!!userCanManageDashboard && !isFullscreen && (
                        <Tooltip
                            label="Edit dashboard"
                            withinPortal
                            position="bottom"
                        >
                            <ActionIcon
                                variant="default"
                                onClick={onEditClicked}
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Tooltip>
                    )}

                    {userCanExportData && !isFullscreen && (
                        <ShareLinkButton url={`${window.location.href}`} />
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
                                <ActionIcon variant="default">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                                {!!userCanManageDashboard && (
                                    <>
                                        <Menu.Item
                                            icon={
                                                <MantineIcon icon={IconCopy} />
                                            }
                                            onClick={onDuplicate}
                                        >
                                            Duplicate
                                        </Menu.Item>

                                        <Menu.Item
                                            icon={
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
                                        icon={
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
                                        icon={<MantineIcon icon={IconSend} />}
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
                                                icon={
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
                                        icon={<MantineIcon icon={IconUpload} />}
                                        onClick={onExport}
                                    >
                                        Export dashboard
                                    </Menu.Item>
                                )}

                                {userCanManageDashboard && (
                                    <>
                                        <Menu.Divider />
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconTrash}
                                                    color="red"
                                                />
                                            }
                                            onClick={onDelete}
                                            color="red"
                                        >
                                            Delete
                                        </Menu.Item>{' '}
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

export default DashboardHeader;
