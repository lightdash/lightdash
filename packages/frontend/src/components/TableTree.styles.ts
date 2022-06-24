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
    .bp4-tree-node-content-0 {
        padding-left: 0;
    }
    .bp4-tree-node-content-1 {
        padding-left: 20px;
    }
    .bp4-tree-node-content-2 {
        padding-left: 32px;
    }
    .bp4-tree-node-content-3 {
        padding-left: 44px;
    }
    .bp4-tree-node-content-4  {
        padding-left: 56px;
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

export const ItemLabelWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 5px;
`;

export const ItemIcon = styled(Icon)`
    margin: 0;
    path {
        fill: ${Colors.GRAY2};
    }
`;

export const ItemLabel = styled.p`
    margin: 0;
`;
