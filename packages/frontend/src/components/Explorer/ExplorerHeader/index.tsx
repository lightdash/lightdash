import React, { FC, memo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useApp } from '../../../providers/AppProvider';
import { Context } from '../../../providers/ExplorerProvider';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import { Wrapper } from './ExplorerHeader.styles';

const ExplorerHeader: FC = memo(() => {
    const isEditMode = useContextSelector(
        Context,
        (context) => context!.state.isEditMode,
    );
    const savedChart = useContextSelector(
        Context,
        (context) => context!.state.savedChart,
    );

    const { user } = useApp();

    return (
        <Wrapper>
            {isEditMode ? (
                <>
                    <RefreshDbtButton />
                    <div>
                        <RefreshButton />
                        {!savedChart &&
                            user.data?.ability?.can('manage', 'SavedChart') && (
                                <SaveChartButton isExplorer />
                            )}
                    </div>
                </>
            ) : (
                <ExploreFromHereButton />
            )}
        </Wrapper>
    );
});

export default ExplorerHeader;
