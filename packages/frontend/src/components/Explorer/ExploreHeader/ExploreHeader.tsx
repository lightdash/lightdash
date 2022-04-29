import { Button, Classes, H3 } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { RefreshButton } from '../../RefreshButton';
import RefreshServerButton from '../../RefreshServer';
import { TitleWrapper, Wrapper } from './ExploreHeader.styles';
import RenameSavedChartModal from '../../SavedQueries/RenameSavedChartModal';

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
                            <H3
                                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                                style={{
                                    margin: '0',
                                }}
                            >
                                {savedChart.name}
                            </H3>
                            {savedChart.description && (
                                <Tooltip2
                                    content={savedChart.description}
                                    position="bottom"
                                >
                                    <Button
                                        style={{
                                            marginLeft: 5,
                                        }}
                                        icon="info-sign"
                                        minimal
                                    />
                                </Tooltip2>
                            )}
                            <Button
                                style={{
                                    marginLeft: 5,
                                }}
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
