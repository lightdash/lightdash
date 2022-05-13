import { Button, Classes } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { UpdatedInfo } from '../../common/ActionCard';
import { RefreshButton } from '../../RefreshButton';
import RefreshServerButton from '../../RefreshServer';
import RenameSavedChartModal from '../../SavedQueries/RenameSavedChartModal';
import { ChartName, TitleWrapper, Wrapper } from './SavedChartsHeader.styles';

const SavedChartsHeader: FC = () => {
    const {
        state: { savedChart },
    } = useExplorer();
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const updateSavedChart = useUpdateMutation(savedChart?.uuid);

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
                                <UpdatedInfo
                                    updatedAt={savedChart.updatedAt}
                                    user={savedChart.updatedByUser}
                                />
                            </ChartName>
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
                        </>
                    )}
                </TitleWrapper>
                <RefreshButton />
                <RefreshServerButton />
            </Wrapper>
        </TrackSection>
    );
};

export default SavedChartsHeader;
