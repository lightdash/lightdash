import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

interface PageWithSidebarProps {
    alignItems?: 'flex-start';
}

const PageWithSidebar = styled.div<PageWithSidebarProps>`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    ${({ alignItems }) => (alignItems ? `align-items: ${alignItems};` : '')}
`;

export default PageWithSidebar;
