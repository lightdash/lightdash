import { AnchorButton, Colors, H4, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

export const EmptyStateWrapper = styled.div`
    max-width: 22em;
`;

export const EmptyStateIcon = styled(Icon)`
    path {
        fill: ${Colors.GRAY3};
    }
`;

export const Title = styled(H4)`
    margin: 1em auto;
`;

export const ButtonWrapper = styled.div`
    width: 100%;
`;

export const CTA = styled(AnchorButton)`
    background: ${Colors.BLUE3};
    border: none;
`;
