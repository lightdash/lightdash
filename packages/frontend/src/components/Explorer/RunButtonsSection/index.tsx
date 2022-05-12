import React, { FC } from 'react';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import { Wrapper } from './RunButtonsSection.styles';

const RunButtonsSection: FC = () => {
    const isViewMode = false;

    return (
        <Wrapper>
            {!isViewMode && <RefreshDbtButton />}
            {!isViewMode && <RefreshButton />}
            {isViewMode && <ExploreFromHereButton />}
        </Wrapper>
    );
};

export default RunButtonsSection;
