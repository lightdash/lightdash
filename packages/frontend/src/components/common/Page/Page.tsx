import { Colors } from '@blueprintjs/core';
import React, { FC } from 'react';
import styled from 'styled-components';
import AboutFooter from '../../AboutFooter';
import Content from './Content';

type Props = {
    isFullHeight?: boolean;
};

const PageBase = styled('div')<Props>`
    min-height: calc(
        100vh - ${(props) => (props.isFullHeight ? '0px' : '50px')}
    );
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: ${Colors.LIGHT_GRAY4};
`;

const Page: FC<Props> = ({ isFullHeight, children }) => (
    <PageBase isFullHeight={isFullHeight}>
        <Content>{children}</Content>
        <AboutFooter />
    </PageBase>
);

export default Page;
