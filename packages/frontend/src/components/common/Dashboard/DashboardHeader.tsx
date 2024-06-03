import { subject } from '@casl/ability';
import {
    FeatureFlags,
    type Dashboard,
    type SpaceSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Flex,
    Group,
    Menu,
    Popover,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconCheck,
    IconChevronRight,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconFolder,
    IconFolderPlus,
    IconFolders,
    IconInfoCircle,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconPlus,
    IconSend,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import { DashboardSchedulersModal } from '../../../features/scheduler';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { usePromoteDashboardMutation } from '../../../hooks/usePromoteDashboard';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import AddTileButton from '../../DashboardTiles/AddTileButton';
import { Can } from '../Authorization';
import MantineIcon from '../MantineIcon';
import DashboardUpdateModal from '../modal/DashboardUpdateModal';
import PageHeader from '../Page/PageHeader';
import {
    PageActionsContainer,
    PageTitleAndDetailsContainer,
} from '../PageHeader';
import SpaceAndDashboardInfo from '../PageHeader/SpaceAndDashboardInfo';
import { UpdatedInfo } from '../PageHeader/UpdatedInfo';
import ViewInfo from '../PageHeader/ViewInfo';
import SpaceActionModal, { ActionType } from '../SpaceActionModal';
import { DashboardRefreshButton } from './DashboardRefreshButton';
import ShareLinkButton from './ShareLinkButton';

type DashboardHeaderProps = {
    spaces?: SpaceSummary[];
    dashboard: Dashboard;
    organizationUuid?: string;
    hasDashboardChanged: boolean;
    isEditMode: boolean;
    isSaving: boolean;
    isFullscreen: boolean;
    isPinned: boolean;
    oldestCacheTime?: Date;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onCancel: () => void;
    onSaveDashboard: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onMoveToSpace: (spaceUuid: string) => void;
    onExport: () => void;
    onToggleFullscreen: () => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    onTogglePin: () => void;
};

const DashboardHeader = ({
    spaces = [],
    dashboard,
    organizationUuid,
    hasDashboardChanged,
    isEditMode,
    isSaving,
    isFullscreen,
    isPinned,
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
    onTogglePin,
}: DashboardHeaderProps) => {
    const { search } = useLocation();
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        organizationUuid: string;
    }>();

    const history = useHistory();
    const { track } = useTracking();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);
    const [isScheduledDeliveriesModalOpen, toggleScheduledDeliveriesModal] =
        useToggle(false);
    const handleEditClick = () => {
        setIsUpdating(true);
        track({ name: EventName.UPDATE_DASHBOARD_NAME_CLICKED });
    };
    const { mutate: promoteDashboard } = usePromoteDashboardMutation();

    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        if (schedulerUuidFromUrlParams) {
            toggleScheduledDeliveriesModal(true);
        }
    }, [search, toggleScheduledDeliveriesModal]);

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
    const isPromoteChartsEnabled = useFeatureFlagEnabled(
        FeatureFlags.PromoteCharts,
    );
    const userCanPromoteDashboard =
        isPromoteChartsEnabled &&
        user.data?.ability?.can(
            'promote',
            subject('Dashboard', {
                organizationUuid,
                projectUuid,
            }),
        );

    return (
        <PageHeader
            cardProps={{
                h: 'auto',
            }}
        >
            <PageTitleAndDetailsContainer>
                <Group spacing="xs">
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
                                    <Text fz="xs" color="gray.7" fw={500}>
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

                    {isUpdating && (
                        <DashboardUpdateModal
                            uuid={dashboardUuid}
                            opened={isUpdating}
                            onClose={() => setIsUpdating(false)}
                            onConfirm={() => setIsUpdating(false)}
                        />
                    )}
                </Group>
            </PageTitleAndDetailsContainer>

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
                <PageActionsContainer>
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
                </PageActionsContainer>
            ) : (
                <PageActionsContainer>
                    {userCanExportData && <DashboardRefreshButton />}

                    {!isEditMode && document.fullscreenEnabled && (
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
                                onClick={() => {
                                    history.replace(
                                        `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
                                    );
                                }}
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
                                                    icon={IconFolders}
                                                />
                                            }
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                        >
                                            <Menu
                                                width={250}
                                                withArrow
                                                position="left-start"
                                                shadow="md"
                                                offset={40}
                                                trigger="hover"
                                            >
                                                <Menu.Target>
                                                    <Flex
                                                        justify="space-between"
                                                        align="center"
                                                    >
                                                        Move to space
                                                        <MantineIcon
                                                            icon={
                                                                IconChevronRight
                                                            }
                                                        />
                                                    </Flex>
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    {spaces
                                                        ?.filter((space) => {
                                                            return user.data?.ability.can(
                                                                'create',
                                                                subject(
                                                                    'Dashboard',
                                                                    {
                                                                        ...space,
                                                                        access: space.userAccess
                                                                            ? [
                                                                                  space.userAccess,
                                                                              ]
                                                                            : [],
                                                                    },
                                                                ),
                                                            );
                                                        })
                                                        .map((spaceToMove) => {
                                                            const isDisabled =
                                                                dashboard.spaceUuid ===
                                                                spaceToMove.uuid;

                                                            return (
                                                                <Menu.Item
                                                                    icon={
                                                                        <MantineIcon
                                                                            icon={
                                                                                isDisabled
                                                                                    ? IconCheck
                                                                                    : IconFolder
                                                                            }
                                                                        />
                                                                    }
                                                                    color={
                                                                        isDisabled
                                                                            ? 'gray.5'
                                                                            : ''
                                                                    }
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        if (
                                                                            dashboard.spaceUuid !==
                                                                            spaceToMove.uuid
                                                                        ) {
                                                                            onMoveToSpace(
                                                                                spaceToMove.uuid,
                                                                            );
                                                                        }
                                                                    }}
                                                                    key={
                                                                        spaceToMove.uuid
                                                                    }
                                                                >
                                                                    {
                                                                        spaceToMove.name
                                                                    }
                                                                </Menu.Item>
                                                            );
                                                        })}
                                                    <Can
                                                        I="create"
                                                        this={subject('Space', {
                                                            organizationUuid:
                                                                user.data
                                                                    ?.organizationUuid,
                                                            projectUuid,
                                                        })}
                                                    >
                                                        <Menu.Divider />

                                                        <Menu.Item
                                                            icon={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconPlus
                                                                    }
                                                                />
                                                            }
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setIsCreatingNewSpace(
                                                                    true,
                                                                );
                                                            }}
                                                        >
                                                            Create new space
                                                        </Menu.Item>
                                                    </Can>
                                                </Menu.Dropdown>
                                            </Menu>
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
                                        onClick={onTogglePin}
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

                                {userCanPromoteDashboard && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconDatabaseExport}
                                            />
                                        }
                                        onClick={() =>
                                            promoteDashboard(dashboardUuid)
                                        }
                                    >
                                        Promote dashboard
                                    </Menu.Item>
                                )}

                                {(userCanExportData ||
                                    userCanManageDashboard) && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconUpload} />}
                                        onClick={onExport}
                                    >
                                        Export dashboard{' '}
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

                    {isCreatingNewSpace && (
                        <SpaceActionModal
                            projectUuid={projectUuid}
                            actionType={ActionType.CREATE}
                            title="Create new space"
                            confirmButtonLabel="Create"
                            icon={IconFolderPlus}
                            onClose={() => setIsCreatingNewSpace(false)}
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
                </PageActionsContainer>
            )}
        </PageHeader>
    );
};

export default DashboardHeader;
