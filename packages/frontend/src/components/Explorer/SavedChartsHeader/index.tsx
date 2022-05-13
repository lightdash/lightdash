import { Button, Classes, Divider, Menu, MenuItem } from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import {
    useDuplicateMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { UpdatedInfo } from '../../common/ActionCard';
import DeleteActionModal from '../../common/modal/DeleteActionModal';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import CreateSavedQueryModal from '../../SavedQueries/CreateSavedQueryModal';
import RenameSavedChartModal from '../../SavedQueries/RenameSavedChartModal';
import SaveChartButton from '../SaveChartButton';
import {
    ChartName,
    OptionsMenu,
    TitleWrapper,
    Wrapper,
} from './SavedChartsHeader.styles';

const SavedChartsHeader: FC = () => {
    const {
        state: { unsavedChartVersion, hasUnsavedChanges, savedChart },
    } = useExplorer();
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);

    const updateSavedChart = useUpdateMutation(savedChart?.uuid);

    const { mutate: duplicateChart } = useDuplicateMutation(
        savedChart?.uuid || '',
    );
    const chartId = savedChart?.uuid || '';

    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            <Wrapper>
                <TitleWrapper>
                    {savedChart && (
                        <>
                            <ChartName
                                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                            >
                                {savedChart.name}
                                {savedChart.description && (
                                    <Tooltip2
                                        content={savedChart.description}
                                        position="bottom"
                                    >
                                        <Button icon="info-sign" minimal />
                                    </Tooltip2>
                                )}
                                <Button
                                    icon="edit"
                                    disabled={updateSavedChart.isLoading}
                                    onClick={() => setIsRenamingChart(true)}
                                    minimal
                                />
                                <RenameSavedChartModal
                                    savedChartUuid={savedChart.uuid}
                                    isOpen={isRenamingChart}
                                    onClose={() => setIsRenamingChart(false)}
                                />
                            </ChartName>

                            <UpdatedInfo
                                updatedAt={savedChart.updatedAt}
                                user={savedChart.updatedByUser}
                            />
                        </>
                    )}
                </TitleWrapper>
                <SaveChartButton />
                <Popover2
                    placement="bottom"
                    disabled={!unsavedChartVersion.tableName}
                    content={
                        <Menu>
                            <MenuItem
                                icon={hasUnsavedChanges ? 'add' : 'duplicate'}
                                text={
                                    hasUnsavedChanges
                                        ? 'Save chart as'
                                        : 'Duplicate'
                                }
                                onClick={() => {
                                    if (savedChart?.uuid && hasUnsavedChanges) {
                                        setIsQueryModalOpen(true);
                                    } else {
                                        duplicateChart(chartId);
                                    }
                                }}
                            />
                            <MenuItem
                                icon="control"
                                text="Add to dashboard"
                                onClick={() =>
                                    setIsAddToDashboardModalOpen(true)
                                }
                            />
                            <Divider />
                            <MenuItem
                                icon="trash"
                                text="Delete"
                                intent="danger"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            />
                        </Menu>
                    }
                >
                    <OptionsMenu
                        icon="more"
                        disabled={!unsavedChartVersion.tableName}
                    />
                </Popover2>
            </Wrapper>
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
        </TrackSection>
    );
};

export default SavedChartsHeader;
