import {
    Alert,
    Button,
    Classes,
    Divider,
    Intent,
    Menu,
} from '@blueprintjs/core';
import { MenuItem2, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { FC, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
    useDuplicateChartMutation,
    useMoveChartMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import ChartCreateModal from '../../common/modal/ChartCreateModal';
import ChartDeleteModal from '../../common/modal/ChartDeleteModal';
import ChartUpdateModal from '../../common/modal/ChartUpdateModal';
import {
    PageActionsContainer,
    PageDetailsContainer,
    PageHeaderContainer,
    PageTitle,
    PageTitleAndDetailsContainer,
    PageTitleContainer,
    SeparatorDot,
} from '../../common/PageHeader';
import SpaceInfo from '../../common/PageHeader/SpaceInfo';
import { UpdatedInfo } from '../../common/PageHeader/UpdatedInfo';
import ViewInfo from '../../common/PageHeader/ViewInfo';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import SaveChartButton from '../SaveChartButton';

const SavedChartsHeader: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const dashboardUuid = useSearchParams('fromDashboard');

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
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);
    const { user } = useApp();
    const { data: spaces } = useSpaces(projectUuid);
    const { mutate: moveChartToSpace } = useMoveChartMutation();
    const updateSavedChart = useUpdateMutation(savedChart?.uuid);

    const space = spaces?.find((s) => s.uuid === savedChart?.spaceUuid);

    const { mutate: duplicateChart } = useDuplicateChartMutation();
    const chartId = savedChart?.uuid || '';

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
        projectUuid,
        savedChart,
        hasUnsavedChanges,
        setIsSaveWarningModalOpen,
        isEditMode,
    ]);

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
            <PageHeaderContainer>
                <PageTitleAndDetailsContainer>
                    {savedChart && (
                        <>
                            <PageTitleContainer
                                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                            >
                                <PageTitle>{savedChart.name}</PageTitle>
                                {savedChart.description && (
                                    <Tooltip2
                                        content={savedChart.description}
                                        position="bottom"
                                    >
                                        <Button icon="info-sign" minimal />
                                    </Tooltip2>
                                )}
                                {user.data?.ability?.can(
                                    'manage',
                                    'SavedChart',
                                ) && (
                                    <Button
                                        icon="edit"
                                        disabled={updateSavedChart.isLoading}
                                        onClick={() => setIsRenamingChart(true)}
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

                                <ViewInfo views={savedChart.views} />

                                {space && (
                                    <>
                                        <SeparatorDot icon="dot" size={6} />

                                        <SpaceInfo
                                            link={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                            name={space.name}
                                        />
                                    </>
                                )}
                            </PageDetailsContainer>
                        </>
                    )}
                </PageTitleAndDetailsContainer>
                {user.data?.ability?.can('manage', 'SavedChart') && (
                    <PageActionsContainer>
                        {!isEditMode ? (
                            <>
                                <Button
                                    icon="edit"
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
                            placement="bottom"
                            disabled={!unsavedChartVersion.tableName}
                            content={
                                <Menu>
                                    <MenuItem2
                                        icon={
                                            hasUnsavedChanges
                                                ? 'add'
                                                : 'duplicate'
                                        }
                                        text={
                                            hasUnsavedChanges
                                                ? 'Save chart as'
                                                : 'Duplicate'
                                        }
                                        onClick={() => {
                                            if (
                                                savedChart?.uuid &&
                                                hasUnsavedChanges
                                            ) {
                                                setIsQueryModalOpen(true);
                                            } else {
                                                duplicateChart(chartId);
                                            }
                                        }}
                                    />
                                    <MenuItem2
                                        icon="control"
                                        text="Add to dashboard"
                                        onClick={() =>
                                            setIsAddToDashboardModalOpen(true)
                                        }
                                    />
                                    <MenuItem2
                                        icon="folder-close"
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
                                                        isDisabled
                                                            ? 'small-tick'
                                                            : undefined
                                                    }
                                                    className={
                                                        isDisabled
                                                            ? 'bp4-disabled'
                                                            : ''
                                                    }
                                                    onClick={(e) => {
                                                        // Use className disabled instead of disabled property to capture and preventdefault its clicks
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (
                                                            savedChart &&
                                                            savedChart.spaceUuid !==
                                                                spaceToMove.uuid
                                                        )
                                                            moveChartToSpace({
                                                                uuid: savedChart.uuid,
                                                                name: savedChart.name,
                                                                spaceUuid:
                                                                    spaceToMove.uuid,
                                                            });
                                                    }}
                                                />
                                            );
                                        })}
                                    </MenuItem2>

                                    <Divider />

                                    <MenuItem2
                                        icon="cross"
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
                                icon="more"
                                disabled={!unsavedChartVersion.tableName}
                            />
                        </Popover2>
                    </PageActionsContainer>
                )}
            </PageHeaderContainer>

            {unsavedChartVersion && (
                <ChartCreateModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                    onConfirm={() => setIsQueryModalOpen(false)}
                />
            )}
            {savedChart && isAddToDashboardModalOpen && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    savedChart={savedChart}
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
        </TrackSection>
    );
};

export default SavedChartsHeader;
