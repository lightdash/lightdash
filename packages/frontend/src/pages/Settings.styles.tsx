import { Button, Card, Colors, H5, Menu } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

const Layout = css`
    width: 800px;
    margin: auto;
`;

export const CardContainer = styled(Card)`
    ${Layout}
    display: grid;
    grid-template-columns: 1fr 1fr;
`;

export const ContentWrapper = styled.div`
    ${Layout}
`;

export const Title = styled(H5)`
    tex-align: left;
`;

export const MenuWrapper = styled.div`
    margin-top: 15px;
`;

export const MenuHeader = styled.div`
    color: ${Colors.GRAY1};
    margin-bottom: 5px;
`;
