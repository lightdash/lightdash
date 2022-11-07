import { Card, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import { PAGE_HEADER_HEIGHT } from '../components/common/PageHeader';
import { NAVBAR_HEIGHT } from '../components/NavBar/NavBar.styles';

export const PageWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: stretch;
`;

export const MainContent = styled.div`
    padding: 10px 20px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    min-width: 0;
`;

export const StickySidebar = styled.div`
    height: calc(100vh - ${NAVBAR_HEIGHT + PAGE_HEADER_HEIGHT}px);
    position: sticky;
    top: ${NAVBAR_HEIGHT}px;
`;

export const CardContent = styled.div`
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

export const Drawer = styled(Card)<{ $state: string }>`
    height: 100%;
    border-radius: 0;
    overflow: hidden;
    transition: ${({ $state }) =>
        ['entering', 'exiting'].includes($state)
            ? 'opacity 500ms ease-in-out, left 500ms ease-in-out'
            : 'none'};
    position: absolute;
    top: 0;
    opacity: ${({ $state }) =>
        ['exiting', 'exited', 'unmounted'].includes($state) ? 0 : 1};
`;

export const WidthHack = styled.div<{ $state: string }>`
    transition: ${({ $state }) =>
        ['entering', 'exiting'].includes($state)
            ? 'width 500ms ease-in-out'
            : 'none'};
    display: flex;
    flex-direction: row;
    height: 100%;
    justify-content: flex-end;
`;

export const Resizer = styled.div<{ $isResizing: boolean }>`
    flex-grow: 0;
    flex-shrink: 0;
    flex-basis: 5px;
    cursor: col-resize;
    resize: horizontal;
    height: 100%;
    background: ${({ $isResizing }) =>
        $isResizing
            ? `linear-gradient(90deg, ${Colors.BLUE5} 0%, rgba(0,0,0,0) 100%);`
            : 'none'};
`;
