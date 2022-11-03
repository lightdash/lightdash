import { Button, Card, Collapse, H5 } from '@blueprintjs/core';
import styled from 'styled-components';

interface ExpandableProps {
    isOpen?: boolean;
    $shouldExpand?: boolean;
}

export const TRANSITION_DURATION = 200;

export const StyledCollapse = styled(Collapse)<ExpandableProps>`
    ${({ isOpen, $shouldExpand }) =>
        isOpen && $shouldExpand
            ? `
                flex-grow: 1;
                min-height: 300px;

                .bp4-collapse-body {
                    height: 100%;
                }
            `
            : ''}
`;

export const StyledCard = styled(Card)<ExpandableProps>`
    padding: 5px;
    transition: all ${TRANSITION_DURATION}ms linear;

    ${({ isOpen, $shouldExpand }) =>
        isOpen && $shouldExpand
            ? `
                flex-grow: 1;
            `
            : ''}
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

export const StyledButton = styled(Button)`
    margin-right: 5px;
`;
