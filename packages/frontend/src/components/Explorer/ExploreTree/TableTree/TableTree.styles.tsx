import { Colors, Icon, Tag } from '@blueprintjs/core';
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

export const TableRow = styled(Row)`
    font-weight: 600;
`;

export const RowIcon = styled(Icon)`
    margin-right: 8px;
`;

export const DimensionsSectionRow = styled(Row)`
    font-weight: 600;
    color: ${Colors.BLUE1};
`;

export const MetricsSectionRow = styled(Row)`
    font-weight: 600;
    color: ${Colors.ORANGE1};
    margin-top: 10px;
`;

export const CustomMetricsSectionRow = styled(Row)`
    font-weight: 600;
    color: ${Colors.ORANGE1};
    margin-top: 10px;
    margin-bottom: 10px;
`;

export const Highlighted = styled.b``;

export const TagCount = styled(Tag)`
    margin-left: 10px;
`;

export const SpanFlex = styled.span`
    flex: 1;
`;

export const EmptyState = styled.div`
    color: ${Colors.GRAY3};
    margin: 10px 24px;
`;

export const GroupNodeRow = styled(Row)`
    font-weight: 600;
`;
