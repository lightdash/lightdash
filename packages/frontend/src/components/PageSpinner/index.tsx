import { Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { LogoContainer, SpinnerWrapper } from './PageSpinner.styles';

const PageSpinner: FC = () => (
    <SpinnerWrapper data-testid="page-spinner">
        <Spinner size={100} />
        <LogoContainer />
    </SpinnerWrapper>
);

export default PageSpinner;
