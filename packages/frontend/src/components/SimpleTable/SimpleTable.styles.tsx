import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const TableWrapper = styled.div`
    height: 100%;
    overflow: hidden;
`;

export const TableInnerWrapper = styled.div`
    overflow: auto;
    height: 100%;
`;

export const TableHeader = styled.thead`
    background: ${Colors.GRAY4};
`;

export const TableRow = styled.tr<{ i: number }>`
    background-color: ${({ i }) =>
        i % 2 ? Colors.LIGHT_GRAY5 : Colors.LIGHT_GRAY4};
`;

export const TableCell = styled.td<{ isNaN: boolean }>`
    text-align: ${({ isNaN }) => (isNaN ? 'left' : 'right')} !important;
`;
