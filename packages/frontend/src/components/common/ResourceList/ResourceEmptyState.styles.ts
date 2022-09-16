import { Colors, H4, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

interface EmptyStateWrapperProps {
    $large?: boolean;
}

export const EmptyStateWrapper = styled.div<EmptyStateWrapperProps>`
    margin: ${(props) => (props.$large ? '40px' : '20px')} auto;
`;

export const EmptyStateIcon = styled(Icon)`
    path {
        fill: ${Colors.GRAY3};
    }
`;

export const EmptyStateText = styled(H4)`
    margin: 18px auto;
`;
