import { subject } from '@casl/ability';
import { DashboardTileTypes, FeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Flex,
    Group,
    Menu,
    Modal,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconArrowBack,
    IconBell,
    IconCheck,
    IconChevronRight,
    IconCirclePlus,
    IconCirclesRelation,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconFolder,
    IconFolders,
    IconHistory,
    IconLayoutGridAdd,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconTrash,
} from '@tabler/icons-react';
import { Fragment, useEffect, useMemo, useState, type FC } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteChartDiffMutation,
    usePromoteMutation,
} from '../../../features/promotion/hooks/usePromoteChart';
import { ChartSchedulersModal } from '../../../features/scheduler';
import {
    getSchedulerUuidFromUrlParams,
    getThresholdUuidFromUrlParams,
    isSchedulerTypeSync,
} from '../../../features/scheduler/utils';
import { SyncModal as GoogleSheetsSyncModal } from '../../../features/sync/components';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useProject } from '../../../hooks/useProject';
import {
    useMoveChartMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import MantineIcon from '../../common/MantineIcon';
import PageHeader from '../../common/Page/PageHeader';
import { UpdatedInfo } from '../../common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../common/ResourceInfoPopup/ResourceInfoPopup';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import ChartCreateModal from '../../common/modal/ChartCreateModal';
import ChartDeleteModal from '../../common/modal/ChartDeleteModal';
import ChartDuplicateModal from '../../common/modal/ChartDuplicateModal';
import ChartUpdateModal from '../../common/modal/ChartUpdateModal';
import MoveChartThatBelongsToDashboardModal from '../../common/modal/MoveChartThatBelongsToDashboardModal';
import SaveChartButton from '../SaveChartButton';
import { TitleBreadCrumbs } from './TitleBreadcrumbs';

enum SpaceType {
    SharedWithMe,
    AdminContentView,
}

const SpaceTypeLabels = {
    [SpaceType.SharedWithMe]: 'Shared with me',
    [SpaceType.AdminContentView]: 'Public content view',
};

type SavedChartsHeaderProps = {
    isPinned: boolean;
    onTogglePin: () => void;
};

const SavedChartsHeader: FC<SavedChartsHeaderProps> = ({
    isPinned,
    onTogglePin,
}) => {
    const { search } = useLocation();
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const dashboardUuid = useSearchParams('fromDashboard');
    const isFromDashboard = !!dashboardUuid;
    const spaceUuid = useSearchParams('fromSpace');

    const userTimeZonesEnabled = useFeatureFlagEnabled(
        FeatureFlags.EnableUserTimezones,
    );
    const { data: project } = useProject(projectUuid);

    const { mutate: promoteChart } = usePromoteMutation();
    const {
        mutate: getPromoteChartDiff,
        data: promoteChartDiff,
        reset: resetPromoteChartDiff,
        isLoading: promoteChartDiffLoading,
    } = usePromoteChartDiffMutation();
    const navigate = useNavigate();
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const hasUnsavedChanges = useExplorerContext(
        (context) => context.state.hasUnsavedChanges,
    );
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const reset = useExplorerContext((context) => context.actions.reset);

    const itemsMap = useExplorerContext(
        (context) => context.query.data?.fields,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );

    const { clearDashboardStorage } = useDashboardStorage();
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const [isMovingChart, setIsMovingChart] = useState(false);
    const [isQueryModalOpen, queryModalHandlers] = useDisclosure();
    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isScheduledDeliveriesModalOpen, scheduledDeliveriesModalHandlers] =
        useDisclosure();
    const [isThresholdAlertsModalOpen, thresholdAlertsModalHandlers] =
        useDisclosure();
    const [isSyncWithGoogleSheetsModalOpen, syncWithGoogleSheetsModalHandlers] =
        useDisclosure();
    const [isAddToDashboardModalOpen, addToDashboardModalHandlers] =
        useDisclosure();
    const [isChartDuplicateModalOpen, chartDuplicateModalHandlers] =
        useDisclosure();

    const { user, health } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);
    const { mutate: moveChartToSpace } = useMoveChartMutation();
    const updateSavedChart = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        savedChart?.uuid,
    );
    const chartViewStats = useChartViewStats(savedChart?.uuid);
    const chartBelongsToDashboard: boolean = !!savedChart?.dashboardUuid;

    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        const isSync = isSchedulerTypeSync(search);

        if (schedulerUuidFromUrlParams) {
            if (isSync) {
                syncWithGoogleSheetsModalHandlers.open();
            } else {
                scheduledDeliveriesModalHandlers.open();
            }
        } else {
            const thresholdUuidFromUrlParams =
                getThresholdUuidFromUrlParams(search);
            if (thresholdUuidFromUrlParams) {
                thresholdAlertsModalHandlers.open();
            }
        }
    }, [
        search,
        syncWithGoogleSheetsModalHandlers,
        scheduledDeliveriesModalHandlers,
        thresholdAlertsModalHandlers,
    ]);

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (hasUnsavedChanges && isEditMode) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => window.removeEventListener('beforeunload', checkReload);
    }, [hasUnsavedChanges, isEditMode]);

    // Block navigating away if there are unsaved changes
    const blocker = useBlocker(({ nextLocation }) => {
        if (
            hasUnsavedChanges &&
            isEditMode &&
            !isQueryModalOpen &&
            !nextLocation.pathname.includes(
                `/projects/${projectUuid}/saved/${savedChart?.uuid}`,
            ) &&
            !nextLocation.pathname.includes(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
            )
        ) {
            return true; //blocks navigation
        }
        return false; // allow navigation
    });

    const spacesByType = useMemo(() => {
        const spacesUserCanCreateIn = spaces.filter((space) => {
            return user.data?.ability?.can(
                'create',
                subject('SavedChart', {
                    ...space,
                    access: space.userAccess ? [space.userAccess] : [],
                }),
            );
        });
        const spacesSharedWithMe = spacesUserCanCreateIn.filter((space) => {
            return user.data && space.access.includes(user.data.userUuid);
        });
        const spacesAdminsCanSee = spacesUserCanCreateIn.filter((space) => {
            return (
                spacesSharedWithMe.find((s) => s.uuid === space.uuid) ===
                undefined
            );
        });
        return {
            [SpaceType.SharedWithMe]: spacesSharedWithMe,
            [SpaceType.AdminContentView]: spacesAdminsCanSee,
        };
    }, [spaces, user.data]);

    const userCanManageChart =
        savedChart &&
        user.data?.ability?.can('manage', subject('SavedChart', savedChart));

    const userCanPromoteChart =
        savedChart &&
        !savedChart?.dashboardUuid &&
        user.data?.ability?.can('promote', subject('SavedChart', savedChart));

    const userCanManageExplore = user.data?.ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: savedChart?.projectUuid,
        }),
    );

    const userCanCreateDeliveriesAndAlerts = user.data?.ability?.can(
        'create',
        subject('ScheduledDeliveries', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanPinChart = user.data?.ability.can(
        'manage',
        subject('PinnedItems', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleGoBackClick = () => {
        void navigate({
            pathname: `/projects/${savedChart?.projectUuid}/dashboards/${dashboardUuid}`,
        });
    };

    const handleCancelClick = () => {
        reset();

        if (!isFromDashboard)
            void navigate({
                pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/view`,
            });
    };

    const promoteDisabled = !(
        project?.upstreamProjectUuid !== undefined && userCanPromoteChart
    );

    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            {blocker.state === 'blocked' && (
                <Modal
                    opened
                    withCloseButton={false}
                    closeOnClickOutside={false}
                    onClose={() => {
                        blocker.reset();
                    }}
                >
                    <Alert
                        icon={
                            <MantineIcon size="xl" icon={IconAlertTriangle} />
                        }
                        color="red"
                    >
                        You have unsaved changes to your chart! Are you sure you
                        want to leave without saving?
                    </Alert>
                    <Group position="right" mt="sm">
                        <Button
                            color="dark"
                            variant="outline"
                            onClick={() => {
                                blocker.reset();
                            }}
                        >
                            Stay
                        </Button>
                        <Button
                            color="red"
                            onClick={() => {
                                blocker.proceed();
                            }}
                        >
                            Leave page
                        </Button>
                    </Group>
                </Modal>
            )}

            <PageHeader
                cardProps={{
                    py: 'xs',
                }}
            >
                <div style={{ flex: 1 }}>
                    {savedChart && projectUuid && (
                        <>
                            <Group spacing={4}>
                                <TitleBreadCrumbs
                                    projectUuid={projectUuid}
                                    spaceUuid={savedChart.spaceUuid}
                                    spaceName={savedChart.spaceName}
                                    dashboardUuid={savedChart.dashboardUuid}
                                    dashboardName={savedChart.dashboardName}
                                />
                                <Title c="dark.6" order={5} fw={600}>
                                    {savedChart.name}
                                </Title>
                                {isEditMode && userCanManageChart && (
                                    <ActionIcon
                                        size="xs"
                                        color="gray.6"
                                        disabled={updateSavedChart.isLoading}
                                        onClick={() => setIsRenamingChart(true)}
                                    >
                                        <MantineIcon icon={IconPencil} />
                                    </ActionIcon>
                                )}
                            </Group>

                            <ChartUpdateModal
                                opened={isRenamingChart}
                                uuid={savedChart.uuid}
                                onClose={() => setIsRenamingChart(false)}
                                onConfirm={() => setIsRenamingChart(false)}
                            />

                            <Group spacing="xs">
                                <UpdatedInfo
                                    updatedAt={savedChart.updatedAt}
                                    user={savedChart.updatedByUser}
                                    partiallyBold={false}
                                />
                                <ResourceInfoPopup
                                    resourceUuid={savedChart.uuid}
                                    projectUuid={projectUuid}
                                    description={savedChart.description}
                                    viewStats={chartViewStats.data?.views}
                                    firstViewedAt={
                                        chartViewStats.data?.firstViewedAt
                                    }
                                    withChartData={true}
                                />
                            </Group>
                        </>
                    )}
                </div>

                {userTimeZonesEnabled &&
                    savedChart?.metricQuery.timezone &&
                    !isEditMode && (
                        <Text color="gray" mr="sm" fz="xs">
                            {savedChart?.metricQuery.timezone}
                        </Text>
                    )}

                {(userCanManageChart ||
                    userCanCreateDeliveriesAndAlerts ||
                    userCanManageExplore) && (
                    <Group spacing="xs">
                        {userCanManageExplore && !isEditMode && (
                            <ExploreFromHereButton />
                        )}
                        {userCanManageChart && (
                            <>
                                {/* TODO: Extract this into a separate component, depending on the mode: viewing or editing */}
                                {!isEditMode ? (
                                    <>
                                        <Button
                                            variant="default"
                                            size="xs"
                                            leftIcon={
                                                <MantineIcon
                                                    icon={IconPencil}
                                                />
                                            }
                                            onClick={() =>
                                                navigate({
                                                    pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/edit`,
                                                })
                                            }
                                        >
                                            Edit chart
                                        </Button>
                                        <ShareShortLinkButton
                                            disabled={!isValidQuery}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <SaveChartButton />
                                        <Button
                                            variant="default"
                                            size="xs"
                                            disabled={
                                                isFromDashboard &&
                                                !hasUnsavedChanges
                                            }
                                            onClick={handleCancelClick}
                                        >
                                            Cancel{' '}
                                            {isFromDashboard ? 'changes' : ''}
                                        </Button>

                                        {isFromDashboard && (
                                            <Tooltip
                                                offset={-1}
                                                label="Return to dashboard"
                                                withinPortal
                                                position="bottom"
                                            >
                                                <ActionIcon
                                                    variant="default"
                                                    onClick={handleGoBackClick}
                                                >
                                                    <MantineIcon
                                                        icon={IconArrowBack}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {/* TODO: Refactor this into its own component */}
                        <Menu
                            position="bottom"
                            withArrow
                            withinPortal
                            shadow="md"
                            width={200}
                            disabled={!unsavedChartVersion.tableName}
                        >
                            <Menu.Dropdown>
                                <Menu.Label>Manage</Menu.Label>
                                {userCanManageChart && hasUnsavedChanges && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconCirclePlus}
                                            />
                                        }
                                        onClick={queryModalHandlers.open}
                                    >
                                        Save chart as
                                    </Menu.Item>
                                )}
                                {userCanManageChart &&
                                    !hasUnsavedChanges &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon icon={IconCopy} />
                                            }
                                            onClick={
                                                chartDuplicateModalHandlers.open
                                            }
                                        >
                                            Duplicate
                                        </Menu.Item>
                                    )}
                                {userCanManageChart &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconLayoutGridAdd}
                                                />
                                            }
                                            onClick={
                                                addToDashboardModalHandlers.open
                                            }
                                        >
                                            Add to dashboard
                                        </Menu.Item>
                                    )}
                                {userCanManageChart &&
                                    savedChart?.dashboardUuid && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconFolders}
                                                />
                                            }
                                            onClick={() =>
                                                setIsMovingChart(true)
                                            }
                                        >
                                            Move to space
                                        </Menu.Item>
                                    )}

                                {!chartBelongsToDashboard &&
                                    userCanPinChart && (
                                        <Menu.Item
                                            component="button"
                                            role="menuitem"
                                            icon={
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
                                            onClick={onTogglePin}
                                        >
                                            {isPinned
                                                ? 'Unpin from homepage'
                                                : 'Pin to homepage'}
                                        </Menu.Item>
                                    )}

                                {userCanManageChart &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconFolders}
                                                />
                                            }
                                            onClick={(
                                                e: React.MouseEvent<HTMLDivElement>,
                                            ) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setIsMovingChart(true);
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
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                    >
                                                        Move to space
                                                        <MantineIcon
                                                            icon={
                                                                IconChevronRight
                                                            }
                                                        />
                                                    </Flex>
                                                </Menu.Target>
                                                <Menu.Dropdown
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    {[
                                                        SpaceType.SharedWithMe,
                                                        SpaceType.AdminContentView,
                                                    ].map((spaceType) => (
                                                        <Fragment
                                                            key={spaceType}
                                                        >
                                                            {spacesByType[
                                                                spaceType
                                                            ].length > 0 ? (
                                                                <>
                                                                    {spaceType ===
                                                                        SpaceType.AdminContentView &&
                                                                    spacesByType[
                                                                        SpaceType
                                                                            .SharedWithMe
                                                                    ].length >
                                                                        0 ? (
                                                                        <Menu.Divider />
                                                                    ) : null}

                                                                    <Menu.Label>
                                                                        {
                                                                            SpaceTypeLabels[
                                                                                spaceType
                                                                            ]
                                                                        }
                                                                    </Menu.Label>
                                                                </>
                                                            ) : null}

                                                            {spacesByType[
                                                                spaceType
                                                            ].map(
                                                                (
                                                                    spaceToMove,
                                                                ) => {
                                                                    const isDisabled =
                                                                        savedChart?.spaceUuid ===
                                                                        spaceToMove.uuid;
                                                                    return (
                                                                        <Menu.Item
                                                                            disabled={
                                                                                isDisabled
                                                                            }
                                                                            key={
                                                                                spaceToMove.uuid
                                                                            }
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
                                                                                e: React.MouseEvent<HTMLDivElement>,
                                                                            ) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (
                                                                                    savedChart &&
                                                                                    savedChart.spaceUuid !==
                                                                                        spaceToMove.uuid
                                                                                ) {
                                                                                    moveChartToSpace(
                                                                                        {
                                                                                            uuid: savedChart.uuid,
                                                                                            spaceUuid:
                                                                                                spaceToMove.uuid,
                                                                                        },
                                                                                    );
                                                                                }
                                                                            }}
                                                                        >
                                                                            {
                                                                                spaceToMove.name
                                                                            }
                                                                        </Menu.Item>
                                                                    );
                                                                },
                                                            )}
                                                        </Fragment>
                                                    ))}
                                                </Menu.Dropdown>
                                            </Menu>
                                        </Menu.Item>
                                    )}
                                {userCanManageChart && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon icon={IconHistory} />
                                        }
                                        onClick={() =>
                                            navigate({
                                                pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/history`,
                                            })
                                        }
                                    >
                                        Version history
                                    </Menu.Item>
                                )}
                                {
                                    <Tooltip
                                        label={
                                            userCanPromoteChart
                                                ? 'You must enable first an upstream project in settings > Data ops'
                                                : "You don't have permissions to promote this chart on the upstream project"
                                        }
                                        disabled={!promoteDisabled}
                                        withinPortal
                                    >
                                        <div>
                                            <Menu.Item
                                                disabled={promoteDisabled}
                                                icon={
                                                    <MantineIcon
                                                        icon={
                                                            IconDatabaseExport
                                                        }
                                                    />
                                                }
                                                onClick={() => {
                                                    if (savedChart)
                                                        getPromoteChartDiff(
                                                            savedChart?.uuid,
                                                        );
                                                }}
                                            >
                                                Promote chart
                                            </Menu.Item>
                                        </div>
                                    </Tooltip>
                                }

                                <Menu.Divider />
                                <Menu.Label>Integrations</Menu.Label>
                                {userCanCreateDeliveriesAndAlerts && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconSend} />}
                                        onClick={
                                            scheduledDeliveriesModalHandlers.open
                                        }
                                    >
                                        Scheduled deliveries
                                    </Menu.Item>
                                )}
                                {userCanCreateDeliveriesAndAlerts && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconBell} />}
                                        onClick={
                                            thresholdAlertsModalHandlers.open
                                        }
                                    >
                                        Alerts
                                    </Menu.Item>
                                )}
                                {userCanManageChart && hasGoogleDriveEnabled ? (
                                    <Menu.Item
                                        icon={
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
                                ) : null}

                                {userCanManageChart && (
                                    <>
                                        <Menu.Divider />

                                        <Box>
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                        color="red"
                                                    />
                                                }
                                                color="red"
                                                onClick={
                                                    deleteModalHandlers.open
                                                }
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
                                    disabled={!unsavedChartVersion.tableName}
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                        </Menu>
                    </Group>
                )}
            </PageHeader>

            {unsavedChartVersion && (
                <ChartCreateModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={queryModalHandlers.close}
                    onConfirm={queryModalHandlers.close}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                />
            )}
            {savedChart && isAddToDashboardModalOpen && projectUuid && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    projectUuid={projectUuid}
                    uuid={savedChart.uuid}
                    dashboardTileType={DashboardTileTypes.SAVED_CHART}
                    onClose={addToDashboardModalHandlers.close}
                />
            )}
            {isDeleteModalOpen && savedChart?.uuid && (
                <ChartDeleteModal
                    uuid={savedChart.uuid}
                    opened={isDeleteModalOpen}
                    onClose={deleteModalHandlers.close}
                    onConfirm={() => {
                        if (dashboardUuid) {
                            void navigate(
                                `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                            );
                        } else {
                            void navigate(`/`);
                        }
                        clearDashboardStorage();
                        deleteModalHandlers.close();
                    }}
                />
            )}
            {isSyncWithGoogleSheetsModalOpen && savedChart?.uuid && (
                <GoogleSheetsSyncModal
                    chartUuid={savedChart.uuid}
                    opened={isSyncWithGoogleSheetsModalOpen}
                    onClose={syncWithGoogleSheetsModalHandlers.close}
                />
            )}
            {isScheduledDeliveriesModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isOpen={isScheduledDeliveriesModalOpen}
                    onClose={scheduledDeliveriesModalHandlers.close}
                />
            )}
            {isThresholdAlertsModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isThresholdAlert
                    itemsMap={itemsMap}
                    isOpen={isThresholdAlertsModalOpen}
                    onClose={thresholdAlertsModalHandlers.close}
                />
            )}
            {savedChart && (
                <MoveChartThatBelongsToDashboardModal
                    className={'non-draggable'}
                    uuid={savedChart.uuid}
                    name={savedChart.name}
                    spaceUuid={savedChart.spaceUuid}
                    spaceName={savedChart.spaceName}
                    opened={isMovingChart}
                    onClose={() => setIsMovingChart(false)}
                    onConfirm={() => {
                        clearDashboardStorage();
                        void navigate(
                            `/projects/${projectUuid}/saved/${savedChart.uuid}/edit`,
                        );
                    }}
                />
            )}

            {isChartDuplicateModalOpen && savedChart?.uuid && (
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
                    resourceName={savedChart?.name ?? ''}
                    promotionChanges={promoteChartDiff}
                    onClose={() => {
                        resetPromoteChartDiff();
                    }}
                    onConfirm={() => {
                        if (savedChart?.uuid) promoteChart(savedChart.uuid);
                    }}
                ></PromotionConfirmDialog>
            )}
        </TrackSection>
    );
};

export default SavedChartsHeader;
