import { Card, Collapse } from '@blueprintjs/core';
import styled from 'styled-components';

export const ExplorerWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
`;

interface StyledCollapseProps {
    isOpen?: boolean;
    $flexGrow?: number;
}

export const StyledCollapse = styled(Collapse)<StyledCollapseProps>`
    flex-grow: ${({ $flexGrow }) => $flexGrow || 'unset'};
    min-height: ${({ isOpen }) => (isOpen ? '300px' : 'unset')};

    .bp4-collapse-body {
        height: 100%;
    }
`;

export const ExploreCard = styled(Card)<{ $flexGrow?: number }>`
    padding: 5px;
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
    flex-grow: ${({ $flexGrow }) => $flexGrow || 'unset'};
`;
