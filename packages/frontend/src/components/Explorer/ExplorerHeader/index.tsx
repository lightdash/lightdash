import React, { FC } from 'react';
import { useExplorer } from '../../../providers/ExplorerProvider';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import { Wrapper } from './ExplorerHeader.styles';

const ExplorerHeader: FC = () => {
    const {
        state: { isEditMode, savedChart },
    } = useExplorer();
    return (
        <Wrapper>
            {isEditMode ? (
                <>
                    <RefreshDbtButton />
                    <div>
                        <RefreshButton />
                        {!savedChart && <SaveChartButton isExplorer />}
                    </div>
                </>
            ) : (
                <ExploreFromHereButton />
            )}
        </Wrapper>
    );
};

export default ExplorerHeader;
