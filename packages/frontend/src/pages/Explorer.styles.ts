import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const PageContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: flex-start;
`;

export const SideBar = styled(Card)`
    height: calc(100vh - 50px);
    flex-basis: 400px;
    flex-grow: 0;
    flex-shrink: 0;
    margin-right: 10px;
    overflow: hidden;
    position: sticky;
    top: 50px;
`;

export const Main = styled.div`
    padding: 10px 10px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    min-width: 0;
`;
