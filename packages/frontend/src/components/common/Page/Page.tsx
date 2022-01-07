import { Colors } from '@blueprintjs/core';
import React, { FC } from 'react';
import styled from 'styled-components';
import useBreakpoint from '../../../hooks/useBreakpoint';
import AboutFooter from '../../AboutFooter';
import MobileView from '../../Mobile';
import Content from './Content';

type Props = {
    isFullHeight?: boolean;
    isContentFullWidth?: boolean;
};

const PageBase = styled('div')<Props>`
    min-height: calc(
        100vh - ${(props) => (props.isFullHeight ? '0px' : '50px')}
    );
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: ${(props) =>
        props.isContentFullWidth ? 'stretch' : 'center'};
    background: ${Colors.LIGHT_GRAY4};
`;

const Page: FC<Props> = ({ children, ...props }) => {
    const { isOverBreakpoint } = useBreakpoint(768);

    return (
        <>
            {isOverBreakpoint ? (
                <PageBase {...props}>
                    <Content>{children}</Content>
                    <AboutFooter />
                </PageBase>
            ) : (
                <MobileView />
            )}
        </>
    );
};

export default Page;
