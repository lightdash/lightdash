import React, { FC } from 'react';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import { Wrapper } from './ExplorerHeader.styles';

const ExplorerHeader: FC<{ isExplorer?: boolean }> = ({
    isExplorer = false,
}) => (
    <Wrapper>
        <RefreshDbtButton />
        <div>
            <RefreshButton />
            {isExplorer && <SaveChartButton isExplorer />}
        </div>
    </Wrapper>
);

export default ExplorerHeader;
