import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const Container = styled.div`
    height: 100%;
    padding: 0.714em;
    min-height: 21.429em;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
`;

export const TableOuterContainer = styled.div`
    display: block;
    max-width: 100% !important;
`;

export const TableInnerContainer = styled.div`
    display: flex;
    max-width: 100% !important;
    flex-direction: row;
`;

export const TableContainer = styled.div`
    flex: 1;
    max-height: 812px;
    overflow: auto;
    border-bottom: 0.071em solid rgb(16 22 26 / 15%);
`;

export const RowNumberColumn = styled.col`
    background: ${Colors.WHITE};
`;

export const RowNumberHeader = styled.th`
    width: 35px;
    font-weight: bold;
    border-top: 0.071em solid rgb(16 22 26 / 15%);
    border-left: 0.071em solid rgb(16 22 26 / 15%);
`;

export const RowTotalFooter = styled.th`
    width: 35px;
    font-weight: bold;
    border-left: 0.071em solid rgb(16 22 26 / 15%);
`;

export const RowNumber = styled.td`
    background: ${Colors.WHITE};
    border-left: 0.071em solid rgb(16 22 26 / 15%);
`;

export const TableFooter = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.714em;
`;

export const PaginationWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
`;

export const PageCount = styled.span`
    color: ${Colors.GRAY1};
`;

export const TableCell = styled.td<{ isNaN: boolean }>`
    text-align: ${({ isNaN }) => (isNaN ? 'left' : 'right')} !important;

    :last-child {
        border-right: 0.071em solid rgb(16 22 26 / 15%);
    }
`;
