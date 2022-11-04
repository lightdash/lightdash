import { Button, Card, H5 } from '@blueprintjs/core';
import styled from 'styled-components';

interface ExpandableProps {
    isOpen?: boolean;
    $shouldExpand?: boolean;
}

export const StyledCollapse = styled.div<ExpandableProps>`
    flex: 1;
    height: 100%;
`;

export const StyledCard = styled(Card)<ExpandableProps>`
    padding: 5px;
    display: flex;
    flex-direction: column;

    ${({ isOpen, $shouldExpand }) =>
        isOpen && $shouldExpand
            ? `
                flex: 1;
                max-height: 600px;
            `
            : ''}
`;

export const StyledCardDivider = styled.div`
    flex: 0 0 10px;
`;

export const StyledCardHeader = styled.div`
    flex-grow: 0;
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
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-left: 10px;
    margin-right: 10px;
    align-items: center;
`;

export const StyledCardTitle = styled(H5)`
    margin: 0;
    padding: 0;
`;

export const StyledButton = styled(Button)`
    margin-right: 5px;
`;
