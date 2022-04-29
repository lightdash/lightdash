import { Button, Classes } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { RefreshButton } from '../../RefreshButton';
import RefreshServerButton from '../../RefreshServer';
import RenameSavedChartModal from '../../SavedQueries/RenameSavedChartModal';
import { ChartName, TitleWrapper, Wrapper } from './ExploreHeader.styles';

const ExploreHeader: FC = () => {
    const location = useLocation<
        { fromExplorer?: boolean; explore?: boolean } | undefined
    >();
    const {
        state: { savedChart },
    } = useExplorer();
    const [isRenamingChart, setIsRenamingChart] = useState(false);
    const updateSavedChart = useUpdateMutation(savedChart?.uuid);

    const searchParams = new URLSearchParams(location.search);

    const overrideQueryUuid: string | undefined = searchParams.get('explore')
        ? undefined
        : savedChart?.uuid;
    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            <Wrapper>
                <TitleWrapper>
                    {overrideQueryUuid && savedChart && (
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
                                savedChartUuid={overrideQueryUuid}
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

export default ExploreHeader;
