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
import useMoveToSpace from '../../../hooks/useMoveToSpace';
import {
    useDuplicateMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { UpdatedInfo } from '../../common/ActionCard';
import DeleteActionModal from '../../common/modal/DeleteActionModal';
import MoveToSpaceModal from '../../common/modal/MoveToSpaceModal';
import {
    IconWithRightMargin,
    PageActionsContainer,
    PageDetailsContainer,
    PageHeaderContainer,
    PageTitle,
    PageTitleAndDetailsContainer,
    PageTitleContainer,
    SeparatorDot,
} from '../../common/PageHeader';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import CreateSavedQueryModal from '../../SavedQueries/CreateSavedQueryModal';
import RenameSavedChartModal from '../../SavedQueries/RenameSavedChartModal';
import ShareLinkButton from '../../ShareLinkButton';
import SaveChartButton from '../SaveChartButton';

const SavedChartsHeader: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const history = useHistory();
    const {
        state: {
            isEditMode,
            unsavedChartVersion,
            hasUnsavedChanges,
            savedChart,
        },
        actions: { reset },
    } = useExplorer();
    const [blockedNavigationLocation, setBlockedNavigationLocation] =
        useState<string>();
    const [isSaveWarningModalOpen, setIsSaveWarningModalOpen] =
        useState<boolean>(false);
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isMoveToSpaceModalOpen, setIsMoveToSpaceModalOpen] =
        useState<boolean>(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);
    const { user } = useApp();
    const { data: spaces } = useSpaces(projectUuid);
    const { moveChart } = useMoveToSpace(true, savedChart);
    const updateSavedChart = useUpdateMutation(savedChart?.uuid);

    const space = spaces?.find((s) => s.uuid === savedChart?.spaceUuid);

    const { mutate: duplicateChart } = useDuplicateMutation(
        savedChart?.uuid || '',
    );
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
                                <RenameSavedChartModal
                                    savedChartUuid={savedChart.uuid}
                                    isOpen={isRenamingChart}
                                    onClose={() => setIsRenamingChart(false)}
                                />
                            </PageTitleContainer>

                            <PageDetailsContainer>
                                <UpdatedInfo
                                    updatedAt={savedChart.updatedAt}
                                    user={savedChart.updatedByUser}
                                />

                                {space && (
                                    <>
                                        <SeparatorDot icon="dot" size={6} />
                                        <IconWithRightMargin
                                            icon="folder-close"
                                            size={10}
                                        />
                                        {space.name}
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
                                        history.push({
                                            pathname: `/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/view`,
                                        });
                                    }}
                                >
                                    Cancel
                                </Button>
                            </>
                        )}

                        <ShareLinkButton
                            url={`${window.location.origin}/projects/${savedChart?.projectUuid}/saved/${savedChart?.uuid}/view`}
                        />

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
                                                            moveChart({
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
                                        icon="trash"
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
                <CreateSavedQueryModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                />
            )}
            {savedChart && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    savedChart={savedChart}
                    onClose={() => setIsAddToDashboardModalOpen(false)}
                />
            )}
            {isDeleteDialogOpen && savedChart?.uuid && (
                <DeleteActionModal
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    uuid={savedChart.uuid}
                    name={savedChart.name}
                    isChart
                    isExplorer
                />
            )}
            {isMoveToSpaceModalOpen && savedChart?.uuid && (
                <MoveToSpaceModal
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsMoveToSpaceModalOpen(false)}
                    uuid={savedChart.uuid}
                    isChart
                />
            )}
        </TrackSection>
    );
};

export default SavedChartsHeader;
