import { Card, Collapse, H5 } from '@blueprintjs/core';
import styled from 'styled-components';

export const StyledCard = styled(Card)`
    padding: 5px;
`;

export const StyledCardDivider = styled.div`
    flex: 0 0 10px;
`;

export const StyledCardHeader = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
`;

export const StyledCardTitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
`;

export const StyledCardActionsWrpper = styled.div`
    display: inline-flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-right: 10px;
`;

export const StyledCardTitle = styled(H5)`
    margin: 0;
    padding: 0;
`;

interface StyledCollapseProps {
    isOpen?: boolean;
    $isExpanded?: boolean;
}

export const StyledCollapse = styled(Collapse)<StyledCollapseProps>`
    ${({ isOpen, $isExpanded }) =>
        isOpen && $isExpanded
            ? `
                flex-grow: 1;
                min-height: 300px;

                .bp4-collapse-body {
                    height: 100%;
                }
            `
            : ''}
`;
