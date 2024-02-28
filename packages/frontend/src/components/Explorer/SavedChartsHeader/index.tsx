import { subject } from '@casl/ability';
import {
    ApiError,
    GitIntegrationConfiguration,
    PullRequestCreated,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Flex,
    Group,
    Menu,
    Modal,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconArrowBack,
    IconArrowRight,
    IconBell,
    IconCheck,
    IconChevronRight,
    IconCircleFilled,
    IconCirclePlus,
    IconCirclesRelation,
    IconCodePlus,
    IconCopy,
    IconDots,
    IconFolder,
    IconFolders,
    IconHistory,
    IconLayoutGridAdd,
    IconPencil,
    IconSend,
    IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FC, Fragment, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import { lightdashApi } from '../../../api';
import { ChartSchedulersModal } from '../../../features/scheduler';
import {
    getSchedulerUuidFromUrlParams,
    isSchedulerTypeSync,
} from '../../../features/scheduler/utils';
import { SyncModal as GoogleSheetsSyncModal } from '../../../features/sync/components';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useDuplicateChartMutation,
    useMoveChartMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import {
    ExploreMode,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';
import ChartDeleteModal from '../../common/modal/ChartDeleteModal';
import ChartUpdateModal from '../../common/modal/ChartUpdateModal';
import MoveChartThatBelongsToDashboardModal from '../../common/modal/MoveChartThatBelongsToDashboardModal';
import PageHeader from '../../common/Page/PageHeader';
import {
    PageActionsContainer,
    PageDetailsContainer,
    PageTitleAndDetailsContainer,
} from '../../common/PageHeader';
import SpaceAndDashboardInfo from '../../common/PageHeader/SpaceAndDashboardInfo';
import { UpdatedInfo } from '../../common/PageHeader/UpdatedInfo';
import ViewInfo from '../../common/PageHeader/ViewInfo';
import { ResourceInfoPopup } from '../../common/ResourceInfoPopup/ResourceInfoPopup';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import SaveChartButton from '../SaveChartButton';

enum SpaceType {
    SharedWithMe,
    AdminContentView,
}

const SpaceTypeLabels = {
    [SpaceType.SharedWithMe]: 'Shared with me',
    [SpaceType.AdminContentView]: 'Admin content view',
};

const getGitIntegration = async (projectUuid: string) =>
    lightdashApi<any>({
        url: `/projects/${projectUuid}/git-integration`,
        method: 'GET',
        body: undefined,
    });

const useGitIntegration = (projectUuid: string) =>
    useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['git-integration'],
        queryFn: () => getGitIntegration(projectUuid),
        retry: false,
    });

const createPullRequestForChartFields = async (
    projectUuid: string,
    chartUuid: string,
) =>
    lightdashApi<any>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/chart/${chartUuid}/fields`,
        method: 'GET',
        body: undefined,
    });

const useCreatePullRequestForChartFieldsMutation = (
    projectUuid: string,
    chartUuid?: string,
) => {
    /* useMutation<GitIntegrationConfiguration, ApiError>(
        ['git-integration', 'pull-request'],
        () => createPullRequestForChartFields(projectUuid, chartUuid!),

    );*/
    const { showToastSuccess, showToastError } = useToaster();

    return useMutation<PullRequestCreated, ApiError>(
        () => createPullRequestForChartFields(projectUuid, chartUuid!),
        {
            mutationKey: ['git-integration', 'pull-request'],
            retry: false,
            onSuccess: async (pullRequest) => {
                showToastSuccess({
                    title: `Success! Create branch with changes: '${pullRequest.prTitle}'`,
                    action: {
                        children: 'Open Pull Request',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(pullRequest.prUrl, '_blank');
                        },
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create pull request`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const SavedChartsHeader: FC = () => {
    const { search } = useLocation();
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const dashboardUuid = useSearchParams('fromDashboard');
    const isFromDashboard = !!dashboardUuid;
    const spaceUuid = useSearchParams('fromSpace');

    const history = useHistory();
    const isEditMode = useExplorerContext(
        (context) => context.state.mode === ExploreMode.EDIT,
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

    const resultsData = useExplorerContext(
        (context) => context.queryResults.data,
    );

    const itemsMap = useMemo(() => {
        return resultsData?.fields;
    }, [resultsData]);

    const { clearIsEditingDashboardChart, getIsEditingDashboardChart } =
        useDashboardStorage();

    const [blockedNavigationLocation, setBlockedNavigationLocation] =
        useState<string>();
    const [isSaveWarningModalOpen, setIsSaveWarningModalOpen] =
        useState<boolean>(false);
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isMovingChart, setIsMovingChart] = useState(false);
    const [isScheduledDeliveriesModalOpen, toggleScheduledDeliveriesModal] =
        useToggle(false);
    const [isThresholdAlertsModalOpen, toggleThresholdAlertsModal] =
        useToggle(false);
    const [
        isSyncWithGoogleSheetsModalOpen,
        toggleSyncWithGoogleSheetsModalOpen,
    ] = useToggle(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);
    const { user, health } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);
    const { mutate: moveChartToSpace } = useMoveChartMutation();
    const updateSavedChart = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        savedChart?.uuid,
    );
    const chartViewStats = useChartViewStats(savedChart?.uuid);
    const { data: gitIntegration } = useGitIntegration(projectUuid);
    const createPullRequest = useCreatePullRequestForChartFieldsMutation(
        projectUuid,
        savedChart?.uuid,
    );
    const { mutate: duplicateChart } = useDuplicateChartMutation();
    const chartId = savedChart?.uuid || '';
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
                toggleSyncWithGoogleSheetsModalOpen(true);
            } else toggleScheduledDeliveriesModal(true);
        }
    }, [
        search,
        toggleScheduledDeliveriesModal,
        toggleSyncWithGoogleSheetsModalOpen,
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

    useEffect(() => {
        history.block((prompt) => {
            if (
                hasUnsavedChanges &&
                isEditMode &&
                !isQueryModalOpen &&
                !prompt.pathname.includes(
                    `/projects/${projectUuid}/saved/${savedChart?.uuid}`,
                ) &&
                !prompt.pathname.includes(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                )
            ) {
                setBlockedNavigationLocation(prompt.pathname);
                setIsSaveWarningModalOpen(true);
                return false; //blocks history
            }
            return undefined; // allow history
        });

        return () => {
            history.block(() => {});
        };
    }, [
        history,
        dashboardUuid,
        projectUuid,
        savedChart,
        hasUnsavedChanges,
        setIsSaveWarningModalOpen,
        isEditMode,
        isQueryModalOpen,
    ]);

    const spacesSharedWithMe = useMemo(() => {
        return spaces.filter((space) => {
            return user.data && space.access.includes(user.data.userUuid);
        });
    }, [spaces, user.data]);

    const spacesAdminsCanSee = useMemo(() => {
        return spaces.filter((space) => {
            return (
                spacesSharedWithMe.find((s) => s.uuid === space.uuid) ===
                undefined
            );
        });
    }, [spaces, spacesSharedWithMe]);

    const spacesByType = useMemo(() => {
        return {
            [SpaceType.SharedWithMe]: spacesSharedWithMe,
            [SpaceType.AdminContentView]: spacesAdminsCanSee,
        };
    }, [spacesSharedWithMe, spacesAdminsCanSee]);

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanCreateDeliveriesAndAlerts = user.data?.ability?.can(
        'create',
        subject('ScheduledDeliveries', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleGoBackClick = () => {
        if (hasUnsavedChanges && isEditMode) {
            history.block((prompt) => {
                setBlockedNavigationLocation(prompt.pathname);
                setIsSaveWarningModalOpen(true);
                return false; //blocks history
            });
        }

        history.push({
            pathname: `/projects/${savedChart?.projectUuid}/dashboards/${dashboardUuid}`,
        });
    };

    const handleCancelClick = () => {
        reset();

        if (!isFromDashboard)
            history.push({
                pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/view`,
            });
    };

    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            <Modal
                opened={isSaveWarningModalOpen}
                withCloseButton={false}
                closeOnClickOutside={false}
                onClose={() => setIsSaveWarningModalOpen(false)}
            >
                <Alert
                    icon={<MantineIcon size="xl" icon={IconAlertTriangle} />}
                    color="red"
                >
                    You have unsaved changes to your chart! Are you sure you
                    want to leave without saving?
                </Alert>
                <Group position="right" mt="sm">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={() => setIsSaveWarningModalOpen(false)}
                    >
                        Stay
                    </Button>
                    <Button
                        color="red"
                        onClick={() => {
                            history.block(() => {});
                            if (blockedNavigationLocation)
                                history.push(blockedNavigationLocation);
                        }}
                    >
                        Leave page
                    </Button>
                </Group>
            </Modal>

            <PageHeader>
                <PageTitleAndDetailsContainer>
                    {savedChart && (
                        <>
                            <Group spacing="xs">
                                <Title order={4} fw={600}>
                                    {savedChart.name}
                                </Title>

                                <ResourceInfoPopup
                                    resourceUuid={savedChart.uuid}
                                    projectUuid={projectUuid}
                                    description={savedChart.description}
                                    withChartData={true}
                                />

                                {isEditMode &&
                                    user.data?.ability?.can(
                                        'manage',
                                        'SavedChart',
                                    ) && (
                                        <ActionIcon
                                            color="gray.7"
                                            disabled={
                                                updateSavedChart.isLoading
                                            }
                                            onClick={() =>
                                                setIsRenamingChart(true)
                                            }
                                        >
                                            <MantineIcon icon={IconPencil} />
                                        </ActionIcon>
                                    )}
                                <ChartUpdateModal
                                    opened={isRenamingChart}
                                    uuid={savedChart.uuid}
                                    onClose={() => setIsRenamingChart(false)}
                                    onConfirm={() => setIsRenamingChart(false)}
                                />
                            </Group>

                            <PageDetailsContainer>
                                <UpdatedInfo
                                    updatedAt={savedChart.updatedAt}
                                    user={savedChart.updatedByUser}
                                />

                                <MantineIcon
                                    icon={IconCircleFilled}
                                    size={3}
                                    style={{ margin: '0 11px' }}
                                />
                                <ViewInfo
                                    views={chartViewStats.data?.views}
                                    firstViewedAt={
                                        chartViewStats.data?.firstViewedAt
                                    }
                                />

                                <MantineIcon
                                    icon={IconCircleFilled}
                                    size={3}
                                    style={{ margin: '0 11px' }}
                                />
                                <SpaceAndDashboardInfo
                                    space={{
                                        link: `/projects/${projectUuid}/spaces/${savedChart.spaceUuid}`,
                                        name: savedChart.spaceName,
                                    }}
                                    dashboard={
                                        savedChart.dashboardUuid &&
                                        savedChart.dashboardName
                                            ? {
                                                  link: `/projects/${projectUuid}/dashboards/${savedChart.dashboardUuid}`,
                                                  name: savedChart.dashboardName,
                                              }
                                            : undefined
                                    }
                                />
                            </PageDetailsContainer>
                        </>
                    )}
                </PageTitleAndDetailsContainer>

                {(userCanManageCharts || userCanCreateDeliveriesAndAlerts) && (
                    <PageActionsContainer>
                        {userCanManageCharts && (
                            <>
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
                                                history.push({
                                                    pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/edit`,
                                                })
                                            }
                                        >
                                            Edit chart
                                        </Button>
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
                                {userCanManageCharts && hasUnsavedChanges && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconCirclePlus}
                                            />
                                        }
                                        onClick={() => {
                                            setIsQueryModalOpen(true);
                                        }}
                                    >
                                        Save chart as
                                    </Menu.Item>
                                )}
                                {userCanManageCharts &&
                                    !hasUnsavedChanges &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon icon={IconCopy} />
                                            }
                                            onClick={() => {
                                                duplicateChart(chartId);
                                            }}
                                        >
                                            Duplicate
                                        </Menu.Item>
                                    )}
                                {userCanManageCharts &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconLayoutGridAdd}
                                                />
                                            }
                                            onClick={() =>
                                                setIsAddToDashboardModalOpen(
                                                    true,
                                                )
                                            }
                                        >
                                            Add to dashboard
                                        </Menu.Item>
                                    )}
                                {userCanManageCharts &&
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

                                {userCanManageCharts &&
                                    !chartBelongsToDashboard && (
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconFolders}
                                                />
                                            }
                                            onClick={(e) => {
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
                                                                SpaceType
                                                                    .AdminContentView
                                                            ].length > 0 ? (
                                                                <>
                                                                    {spaceType ===
                                                                    SpaceType.AdminContentView ? (
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
                                                                                e,
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
                                {userCanManageCharts && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon icon={IconHistory} />
                                        }
                                        onClick={() =>
                                            history.push({
                                                pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/history`,
                                            })
                                        }
                                    >
                                        Version history
                                    </Menu.Item>
                                )}
                                <Menu.Divider />
                                <Menu.Label>Integrations</Menu.Label>
                                {userCanCreateDeliveriesAndAlerts && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconSend} />}
                                        onClick={() =>
                                            toggleScheduledDeliveriesModal(true)
                                        }
                                    >
                                        Scheduled deliveries
                                    </Menu.Item>
                                )}
                                {userCanCreateDeliveriesAndAlerts && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconBell} />}
                                        onClick={() =>
                                            toggleThresholdAlertsModal(true)
                                        }
                                    >
                                        Alerts
                                    </Menu.Item>
                                )}
                                {userCanManageCharts &&
                                hasGoogleDriveEnabled ? (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconCirclesRelation}
                                            />
                                        }
                                        onClick={() =>
                                            toggleSyncWithGoogleSheetsModalOpen(
                                                true,
                                            )
                                        }
                                    >
                                        Google Sheets Sync
                                    </Menu.Item>
                                ) : null}
                                {gitIntegration?.enabled && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon icon={IconCodePlus} />
                                        }
                                        onClick={() =>
                                            createPullRequest.mutate()
                                        }
                                    >
                                        Add custom metrics to dbt project
                                    </Menu.Item>
                                )}
                                {userCanManageCharts && (
                                    <>
                                        <Menu.Divider />

                                        <Tooltip
                                            disabled={
                                                !getIsEditingDashboardChart()
                                            }
                                            position="bottom"
                                            label="This chart can be deleted from its dashboard"
                                        >
                                            <Box>
                                                <Menu.Item
                                                    icon={
                                                        <MantineIcon
                                                            icon={IconTrash}
                                                            color="red"
                                                        />
                                                    }
                                                    color="red"
                                                    disabled={getIsEditingDashboardChart()}
                                                    onClick={() =>
                                                        setIsDeleteDialogOpen(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    Delete
                                                </Menu.Item>
                                            </Box>
                                        </Tooltip>
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
                    </PageActionsContainer>
                )}
            </PageHeader>

            {unsavedChartVersion && (
                <ChartCreateModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                    onConfirm={() => setIsQueryModalOpen(false)}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                />
            )}
            {savedChart && isAddToDashboardModalOpen && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    projectUuid={projectUuid}
                    savedChartUuid={savedChart.uuid}
                    onClose={() => setIsAddToDashboardModalOpen(false)}
                />
            )}
            {isDeleteDialogOpen && savedChart?.uuid && (
                <ChartDeleteModal
                    uuid={savedChart.uuid}
                    opened={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={() => {
                        history.listen((location, action) => {
                            if (action === 'POP') {
                                if (location.pathname.includes('/tables/')) {
                                    history.push(
                                        `/projects/${projectUuid}/tables`,
                                    );
                                }
                            }
                        });

                        history.push('/');

                        setIsDeleteDialogOpen(false);
                    }}
                />
            )}
            {isSyncWithGoogleSheetsModalOpen && savedChart?.uuid && (
                <GoogleSheetsSyncModal
                    chartUuid={savedChart.uuid}
                    opened={isSyncWithGoogleSheetsModalOpen}
                    onClose={() => toggleSyncWithGoogleSheetsModalOpen(false)}
                />
            )}
            {isScheduledDeliveriesModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isOpen={isScheduledDeliveriesModalOpen}
                    onClose={() => toggleScheduledDeliveriesModal(false)}
                />
            )}
            {isThresholdAlertsModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isThresholdAlert
                    itemsMap={itemsMap}
                    isOpen={isThresholdAlertsModalOpen}
                    onClose={() => toggleThresholdAlertsModal(false)}
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
                        clearIsEditingDashboardChart();
                        history.push(
                            `/projects/${projectUuid}/saved/${savedChart.uuid}/edit`,
                        );
                    }}
                />
            )}
        </TrackSection>
    );
};

export default SavedChartsHeader;
