import { Colors, Icon } from '@blueprintjs/core';
import { hexToRGB } from '@lightdash/common';
import styled from 'styled-components';

export const TooltipContent = styled.p`
    margin: 0;
    max-width: 360px;
`;

export const ItemOptions = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
    height: 30px;
`;

export const Placeholder = styled.div`
    width: 30px;
`;

export const WarningIcon = styled(Icon)`
    color: ${Colors.ORANGE5} !important;
`;

export const Row = styled.div<{
    depth: number;
    selected?: boolean;
    bgColor?: string;
    onClick?: () => void;
}>`
    padding-left: ${({ depth }) => depth * 24}px;
    padding-right: 10px;
    height: 30px;
    display: flex;
    align-items: center;
    ${({ onClick, selected, bgColor }) =>
        onClick &&
        `
        cursor: pointer;
        
        :hover {
            background-color: ${
                selected && bgColor
                    ? hexToRGB(bgColor, 0.8)
                    : Colors.LIGHT_GRAY5
            }
        }
        
    `}

    background-color: ${({ selected, bgColor }) =>
        selected && bgColor ? bgColor : undefined};
`;

export const Hightlighed = styled.b``;
