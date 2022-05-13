import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const PageWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: flex-start;
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
    height: calc(100vh - 120px);
    overflow: hidden;
    position: sticky;
    top: 120px;
`;

export const CardContent = styled.div`
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

const DrawerWidth = 400;

export const Drawer = styled(Card)<{ $state: string }>`
    height: 100%;
    flex-basis: ${DrawerWidth}px;
    flex-grow: 0;
    flex-shrink: 0;
    transition: opacity 500ms ease-in-out, left 500ms ease-in-out;
    position: absolute;
    top: 0;
    width: ${DrawerWidth}px;
    opacity: ${({ $state }) =>
        ['exiting', 'exited', 'unmounted'].includes($state) ? 0 : 1};
    left: ${({ $state }) =>
        ['exiting', 'exited', 'unmounted'].includes($state)
            ? -DrawerWidth
            : 0}px;
`;

export const WidthHack = styled.div<{ $state: string }>`
    transition: width 500ms ease-in-out;
    width: ${({ $state }) =>
        ['exiting', 'exited', 'unmounted'].includes($state)
            ? 0
            : DrawerWidth}px;
`;
