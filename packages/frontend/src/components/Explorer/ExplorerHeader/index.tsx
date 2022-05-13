import React, { FC } from 'react';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import { Wrapper } from './ExplorerHeader.styles';

const ExplorerHeader: FC = () => (
    <Wrapper>
        <RefreshDbtButton />
        <RefreshButton />
    </Wrapper>
);

export default ExplorerHeader;
