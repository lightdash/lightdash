import { Button, Card, H5 } from '@blueprintjs/core';
import styled from 'styled-components';

interface ExpandableProps {
    $shouldExpand?: boolean;
    $minHeight?: number;
}

export const StyledCard = styled(Card)<ExpandableProps>`
    padding: 5px;
    display: flex;
    flex-direction: column;

    ${({ $shouldExpand }) => ($shouldExpand ? `flex: 1;` : '')}
`;

export const StyledCollapse = styled.div<ExpandableProps>`
    display: flex;
    flex-direction: column;

    ${({ $shouldExpand, $minHeight }) =>
        $shouldExpand
            ? `
                min-height: ${$minHeight}px;
                flex: 1;`
            : ''};
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
