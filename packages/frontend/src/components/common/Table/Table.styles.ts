import { Colors, HTMLTable } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const TableScrollableWrapper = styled.div`
    display: flex;
    flex-direction: column;

    position: relative;
    overflow: auto;
    min-width: 100%;
`;

interface TableContainerProps {
    $shouldExpand?: boolean;
    $padding?: number;
}

export const TableContainer = styled.div<TableContainerProps>`
    display: flex;
    flex-direction: column;
    padding: ${({ $padding = 10 }) => `${$padding}px`};
    min-width: 100%;
    overflow: hidden;

    ${({ $shouldExpand }) =>
        $shouldExpand
            ? `
                height: 100%;
            `
            : `
                max-height: 800px;
            `}
`;

export const Table = styled(HTMLTable)<{ $showFooter: boolean }>`
    width: 100%;
    border-left: 1px solid #dcdcdd;
    border-right: 1px solid #dcdcdd;

    ${({ $showFooter }) =>
        !$showFooter ? ` border-bottom: 1px solid #dcdcdd;` : undefined}

    thead {
        z-index: 2;
        position: sticky;
        top: 0;
        inset-block-start: 0; /* "top" */
        background: ${Colors.GRAY5};

        th:first-child {
            border-top: none !important;
            border-bottom: none !important;
        }

        th {
            border-top: none !important;
            border-bottom: none !important;
        }
    }

    tbody tr {
        :nth-child(even) {
            background-color: ${Colors.LIGHT_GRAY5};
        }

        :hover {
            background: ${Colors.LIGHT_GRAY3};
        }
    }

    tfoot {
        position: sticky;
        z-index: 3;
        bottom: 0;
        inset-block-end: 0; /* "bottom" */

        th:first-child {
            border-top: none !important;
            border-bottom: none !important;
        }

        th {
            border-top: none !important;
            border-bottom: none !important;
            box-shadow: inset 0 1px 0 #dcdcdd, inset 0 -1px 0 #dcdcdd,
                inset 1px 0 0 0 rgb(17 20 24 / 15%) !important;
        }
    }

    .sticky-column {
        position: sticky !important;
        left: 1px;
        z-index: 1;
        background-color: white;
        word-break: break-word;
    }
    .first-sticky-column {
        box-shadow: lightgray -1px 0px 0px 0px, lightgray 0px 1px 0px 0px inset !important;
    }
    .last-sticky-column {
        border-right: 2px solid darkgray;
    }
`;

export const TableFooter = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
`;

const CellStyles = css<{ $isNaN: boolean }>`
    text-align: ${({ $isNaN }) => ($isNaN ? 'left' : 'right')} !important;
`;

export const Td = styled.td<{
    $isNaN: boolean;
    $rowIndex: number;
    $isSelected: boolean;
    $isInteractive: boolean;
    $isCopying: boolean;
    $backgroundColor?: string;
    $hasData: boolean;
}>`
    ${CellStyles}

    ${({ $isInteractive, $hasData }) =>
        $isInteractive && $hasData
            ? `
                cursor: pointer;
            `
            : ''}

    ${({ $isInteractive, $isSelected, $hasData }) =>
        $isInteractive && $isSelected && $hasData
            ? `
                box-shadow: inset 0 0 0 1px #4170CB !important;
                background-color: #ECF6FE;
            `
            : ''}

    ${({ $isSelected }) =>
        $isSelected
            ? `
                position: relative;
                z-index: 21;
            `
            : ''}

    ${({ $backgroundColor }) =>
        $backgroundColor
            ? `
                background-color: ${$backgroundColor};
            `
            : ''}

    transition: filter 0.15s linear;

    ${({ $isCopying }) =>
        $isCopying
            ? `
                filter: saturate(3);
            `
            : `
                filter: saturate(1);
            `}
`;

export const FooterCell = styled.th<{ $isNaN: boolean }>`
    ${CellStyles}
    ${() =>
        `
        background-color: ${Colors.WHITE}
  `}
`;

export const PaginationWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
`;

export const PageCount = styled.span`
    color: ${Colors.GRAY1};
    font-size: 12px;
`;

export const Th = styled.th``;

export const ThContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: flex-start;
`;

export const ThLabelContainer = styled.div``;

export const ThActionsContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;

    margin-left: 5px;
    > *:not(:last-child) {
        margin-right: 10px;
    }
`;

export const TableHeaderLabelContainer = styled.div``;

export const TableHeaderRegularLabel = styled.span`
    font-weight: 400;
    opacity: 0.7;
`;

export const TableHeaderBoldLabel = styled.span`
    font-weight: 600;
`;
