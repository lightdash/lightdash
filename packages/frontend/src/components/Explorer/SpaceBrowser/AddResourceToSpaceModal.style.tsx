import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

interface SpaceLabelProps {
    disabled?: boolean;
}

export const SpaceLabel = styled.div<SpaceLabelProps>`
    color: ${({ disabled }) => (disabled ? Colors.GRAY4 : Colors.GRAY2)};

    font-size: 12px;
    line-height: 18px;

    .bp4-icon {
        margin-right: 6px;
        margin-bottom: 2px;

        svg {
            ${({ disabled }) =>
                disabled ? `fill: ${Colors.LIGHT_GRAY1};` : ''}
        }
    }
`;
