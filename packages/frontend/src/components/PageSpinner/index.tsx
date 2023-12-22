import { Loader } from '@mantine/core';
import { FC } from 'react';
import { LogoContainer, SpinnerWrapper } from './PageSpinner.styles';

const PageSpinner: FC<React.PropsWithChildren> = () => (
    <SpinnerWrapper data-testid="page-spinner">
        <Loader color="gray.6" size={100} />
        <LogoContainer />
    </SpinnerWrapper>
);

export default PageSpinner;
