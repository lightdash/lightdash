import { Button, Classes } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { RefreshButton } from '../../RefreshButton';
import RefreshServerButton from '../../RefreshServer';
import RenameSavedChartModal from '../../SavedQueries/RenameSavedChartModal';
import { ChartName, TitleWrapper, Wrapper } from './ExploreHeader.styles';

const ExploreHeader: FC = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const {
        state: { isEditMode, savedChart },
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
                <Button
                    onClick={() =>
                        history.push({
                            pathname: `/projects/${projectUuid}/saved/${
                                savedChart?.uuid
                            }/${isEditMode ? 'view' : 'edit'}`,
                        })
                    }
                />
                <RefreshButton />
                <RefreshServerButton />
            </Wrapper>
        </TrackSection>
    );
};

export default ExploreHeader;
