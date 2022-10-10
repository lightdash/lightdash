import React, { FC, memo } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import { Wrapper } from './ExplorerHeader.styles';

const ExplorerHeader: FC = memo(() => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
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
                        <ShareShortLinkButton />
                    </div>
                </>
            ) : (
                <ExploreFromHereButton />
            )}
        </Wrapper>
    );
});

export default ExplorerHeader;
