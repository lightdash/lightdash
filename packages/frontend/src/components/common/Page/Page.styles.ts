import { Card, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import { NAVBAR_HEIGHT } from '../../NavBar/NavBar.styles';
import { PAGE_HEADER_HEIGHT } from '../PageHeader';

interface PageWithSidebarProps {
    alignItems?: 'flex-start';
}

export const PageWithSidebar = styled.div<PageWithSidebarProps>`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    ${({ alignItems }) => (alignItems ? `align-items: ${alignItems};` : '')}
`;

interface PageContentContainerProps {
    hasDraggableSidebar: boolean;
}

export const PageWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
`;

export const PageContentContainer = styled.div<PageContentContainerProps>`
    padding: 10px 20px 10px
        ${({ hasDraggableSidebar }) => (hasDraggableSidebar ? 15 : 20)}px;
    display: flex;
    flex-grow: 1;
    flex-direction: column;

    justify-content: flex-start;
    align-items: stretch;

    gap: 10px;
`;

export const PageContentWrapper = styled.div`
    .bp4-card:not(:last-child) {
        margin-bottom: 20px;
    }
`;

export const PageHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 0px 31px 0px;
`;

export const PageBreadcrumbsWrapper = styled.div`
    .bp4-breadcrumb {
        font-size: 22px;
        font-weight: 500;
    }
    .home-breadcrumb {
        color: #5c7080;
    }

    .bp4-breadcrumbs > li::after {
        margin-top: 5px;
    }
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

export const StickySidebar = styled.div`
    height: calc(100vh - ${NAVBAR_HEIGHT + PAGE_HEADER_HEIGHT}px);
    position: sticky;
    top: ${NAVBAR_HEIGHT}px;
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
