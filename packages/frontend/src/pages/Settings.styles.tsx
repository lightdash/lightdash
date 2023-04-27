import { Card, H5 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

const Layout = css`
    width: 900px;
    margin: auto;
`;

export const CardContainer = styled(Card)`
    ${Layout}
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 20px;
`;

export const ContentWrapper = styled.div`
    ${Layout}
`;
