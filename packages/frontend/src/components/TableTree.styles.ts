import { Colors, Icon } from '@blueprintjs/core';
import styled, { createGlobalStyle } from 'styled-components';

export const TableTreeGlobalStyle = createGlobalStyle`
    .no-custom-metrics {
        .bp4-tree-node-content {
          height: auto;
        }
        .bp4-tree-node-label {
          white-space: normal;
        }
    }
`;

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

export const DimensionLabelWrapper = styled.div`
    display: flex;
    align-items: center;
`;

export const DimensionLabel = styled.p`
    margin: 0;
`;
