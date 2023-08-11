import { Card, H5 } from '@blueprintjs/core';
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

export const StyledCardTitle = styled(H5)`
    margin: 0;
    padding: 0;
`;
