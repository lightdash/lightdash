import { Card, H5 } from '@blueprintjs/core';
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
