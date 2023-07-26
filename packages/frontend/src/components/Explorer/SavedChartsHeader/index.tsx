import {
    Alert,
    Button,
    Classes,
    Divider,
    Intent,
    Menu,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    IconCheck,
    IconCirclePlus,
    IconCopy,
    IconDots,
    IconFolders,
    IconPencil,
    IconSend,
    IconSquarePlus,
    IconTrash,
} from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import {
    useDuplicateChartMutation,
    useMoveChartMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import ChartCreateModal from '../../common/modal/ChartCreateModal';
import ChartDeleteModal from '../../common/modal/ChartDeleteModal';
import ChartUpdateModal from '../../common/modal/ChartUpdateModal';
import PageHeader from '../../common/Page/PageHeader';
import {
    PageActionsContainer,
    PageDetailsContainer,
    PageTitle,
    PageTitleAndDetailsContainer,
    PageTitleContainer,
    SeparatorDot,
} from '../../common/PageHeader';
import SpaceAndDashboardInfo from '../../common/PageHeader/SpaceAndDashboardInfo';
import { UpdatedInfo } from '../../common/PageHeader/UpdatedInfo';
import ViewInfo from '../../common/PageHeader/ViewInfo';
import { ResourceInfoPopup } from '../../common/ResourceInfoPopup/ResourceInfoPopup';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import ChartSchedulersModal from '../../SchedulerModals/ChartSchedulersModal';
import { getSchedulerUuidFromUrlParams } from '../../SchedulerModals/SchedulerModalBase/SchedulerModalContent';
import SaveChartButton from '../SaveChartButton';

const SavedChartsHeader: FC = () => {
    const { search } = useLocation();
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const dashboardUuid = useSearchParams('fromDashboard');
    const spaceUuid = useSearchParams('fromSpace');

    const history = useHistory();
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
    const [blockedNavigationLocation, setBlockedNavigationLocation] =
        useState<string>();
    const [isSaveWarningModalOpen, setIsSaveWarningModalOpen] =
        useState<boolean>(false);
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isScheduledDeliveriesModalOpen, toggleSchedulerDeliveriesModel] =
        useToggle(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);
    const { user } = useApp();
    const { data: spaces } = useSpaceSummaries(projectUuid);
    const { mutate: moveChartToSpace } = useMoveChartMutation();
    const updateSavedChart = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        savedChart?.uuid,
    );
    const chartViewStats = useChartViewStats(savedChart?.uuid);

    const { mutate: duplicateChart } = useDuplicateChartMutation();
    const chartId = savedChart?.uuid || '';
    const chartBelongsToDashboard: boolean = !!savedChart?.dashboardUuid;

    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        if (schedulerUuidFromUrlParams) {
            toggleSchedulerDeliveriesModel(true);
        }
    }, [search, toggleSchedulerDeliveriesModel]);

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
    ]);

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            <Alert
                isOpen={isSaveWarningModalOpen}
                cancelButtonText="Stay"
                confirmButtonText="Leave page"
                intent={Intent.DANGER}
                icon="warning-sign"
                onCancel={() => setIsSaveWarningModalOpen(false)}
                onConfirm={() => {
                    history.block(() => {});
                    if (blockedNavigationLocation)
                        history.push(blockedNavigationLocation);
                }}
            >
                <p>
                    You have unsaved changes to your chart! Are you sure you
                    want to leave without saving?{' '}
                </p>
            </Alert>

            <PageHeader>
                <PageTitleAndDetailsContainer>
                    {savedChart && (
                        <>
                            <PageTitleContainer
                                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                            >
                                <PageTitle>{savedChart.name}</PageTitle>

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
                                        <Button
                                            icon={<IconPencil size={16} />}
                                            disabled={
                                                updateSavedChart.isLoading
                                            }
                                            onClick={() =>
                                                setIsRenamingChart(true)
                                            }
                                            minimal
                                        />
                                    )}
                                <ChartUpdateModal
                                    isOpen={isRenamingChart}
                                    uuid={savedChart.uuid}
                                    onClose={() => setIsRenamingChart(false)}
                                    onConfirm={() => setIsRenamingChart(false)}
                                />
                            </PageTitleContainer>

                            <PageDetailsContainer>
                                <UpdatedInfo
                                    updatedAt={savedChart.updatedAt}
                                    user={savedChart.updatedByUser}
                                />

                                <SeparatorDot icon="dot" size={6} />

                                <ViewInfo
                                    views={chartViewStats.data?.views}
                                    firstViewedAt={
                                        chartViewStats.data?.firstViewedAt
                                    }
                                />

                                <SeparatorDot icon="dot" size={6} />

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
                {user.data?.ability?.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: savedChart?.organizationUuid,
                        projectUuid,
                    }),
                ) && (
                    <PageActionsContainer>
                        {!isEditMode ? (
                            <>
                                <Button
                                    icon={<IconPencil size={16} />}
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
                                    onClick={() => {
                                        reset();
                                        if (dashboardUuid) {
                                            history.push({
                                                pathname: `/projects/${savedChart?.projectUuid}/dashboards/${dashboardUuid}`,
                                            });
                                        } else
                                            history.push({
                                                pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/view`,
                                            });
                                    }}
                                >
                                    Cancel
                                </Button>
                            </>
                        )}

                        <Popover2
                            placement="bottom-end"
                            disabled={!unsavedChartVersion.tableName}
                            content={
                                <Menu>
                                    {hasUnsavedChanges && (
                                        <MenuItem2
                                            icon={<IconCirclePlus />}
                                            text={'Save chart as'}
                                            onClick={() => {
                                                setIsQueryModalOpen(true);
                                            }}
                                        />
                                    )}

                                    {!hasUnsavedChanges &&
                                        !chartBelongsToDashboard && (
                                            <MenuItem2
                                                icon={<IconCopy />}
                                                text={'Duplicate'}
                                                onClick={() => {
                                                    duplicateChart(chartId);
                                                }}
                                            />
                                        )}

                                    {!chartBelongsToDashboard && (
                                        <MenuItem2
                                            icon={<IconSquarePlus />}
                                            text="Add to dashboard"
                                            onClick={() =>
                                                setIsAddToDashboardModalOpen(
                                                    true,
                                                )
                                            }
                                        />
                                    )}
                                    {!chartBelongsToDashboard && (
                                        <MenuItem2
                                            icon={<IconFolders />}
                                            text="Move to space"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                        >
                                            {spaces?.map((spaceToMove) => {
                                                const isDisabled =
                                                    savedChart?.spaceUuid ===
                                                    spaceToMove.uuid;
                                                return (
                                                    <MenuItem2
                                                        key={spaceToMove.uuid}
                                                        text={spaceToMove.name}
                                                        icon={
                                                            isDisabled ? (
                                                                <IconCheck />
                                                            ) : undefined
                                                        }
                                                        className={
                                                            isDisabled
                                                                ? 'bp4-disabled'
                                                                : ''
                                                        }
                                                        onClick={(e) => {
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
                                                                        name: savedChart.name,
                                                                        spaceUuid:
                                                                            spaceToMove.uuid,
                                                                    },
                                                                );
                                                            }
                                                        }}
                                                    />
                                                );
                                            })}
                                        </MenuItem2>
                                    )}
                                    {userCanManageCharts && (
                                        <MenuItem2
                                            icon={<IconSend />}
                                            text="Scheduled deliveries"
                                            onClick={() =>
                                                toggleSchedulerDeliveriesModel(
                                                    true,
                                                )
                                            }
                                        />
                                    )}
                                    <Divider />
                                    <MenuItem2
                                        icon={<IconTrash />}
                                        text="Delete"
                                        intent="danger"
                                        onClick={() =>
                                            setIsDeleteDialogOpen(true)
                                        }
                                    />
                                </Menu>
                            }
                        >
                            <Button
                                style={{ padding: '5px 7px' }}
                                icon={<IconDots size={16} />}
                                disabled={!unsavedChartVersion.tableName}
                            />
                        </Popover2>
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
                    isOpen={isDeleteDialogOpen}
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
            {isScheduledDeliveriesModalOpen && savedChart?.uuid && (
                <ChartSchedulersModal
                    chartUuid={savedChart.uuid}
                    name={savedChart.name}
                    isOpen={isScheduledDeliveriesModalOpen}
                    onClose={() => toggleSchedulerDeliveriesModel(false)}
                />
            )}
        </TrackSection>
    );
};

export default SavedChartsHeader;
