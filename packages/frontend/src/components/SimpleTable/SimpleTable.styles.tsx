import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const TableWrapper = styled.div`
    height: 100%;
    margin: 20px 10px 10px;
    min-height: 300px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: auto;
`;

export const TableInnerWrapper = styled.div`
    display: flex;
    max-width: 100%;
    flex-direction: row;
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
