import { Card, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import { NAVBAR_HEIGHT } from '../components/NavBar/NavBar.styles';

export const PageContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
`;

export const SideBar = styled.div`
    display: flex;
    flex-direction: row;
    position: sticky;
    align-self: flex-start;
    top: ${NAVBAR_HEIGHT}px;
`;

export const SideBarCard = styled(Card)`
    height: calc(100vh - ${NAVBAR_HEIGHT}px);
    overflow: hidden;
`;

export const Resizer = styled.div<{ $isResizing: boolean }>`
    flex: 1;
    width: 5px;
    cursor: col-resize;
    resize: horizontal;
    background: ${({ $isResizing }) =>
        $isResizing
            ? `linear-gradient(90deg, ${Colors.BLUE5} 0%, rgba(0,0,0,0) 100%);`
            : 'none'};
`;
