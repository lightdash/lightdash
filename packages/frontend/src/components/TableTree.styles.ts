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
