import { DEFAULT_THEME } from '@mantine/core';
import { transparentize } from 'polished';
import styled, { css } from 'styled-components';

// FIXME: these colors are coming from the mantine's default theme.
// We should use the theme from the app instead.
export const TABLE_HEADER_BG = DEFAULT_THEME.colors.gray[0];

// Needed for virtualization. Matches value from Pivot table.
export const ROW_HEIGHT_PX = 34;

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
    min-width: 100%;
    overflow: hidden;

    font-family: 'Inter', sans-serif;
    font-feature-settings: 'tnum';

    padding: ${({ $padding = 0 }) => `${$padding}px`};

    ${({ $shouldExpand }) =>
        $shouldExpand
            ? `
                height: inherit;
            `
            : `
                max-height: 800px;
            `}
`;

export const Table = styled.table<{ $showFooter: boolean }>`
    border-spacing: 0;
    font-size: 14px;
    background-color: white;
    width: 100%;
    border-left: 1px solid #dcdcdd;
    border-right: 1px solid #dcdcdd;

    th,
    td {
        padding-left: 11px;
        padding-right: 11px;
        padding-bottom: 6px;
        padding-top: 6px;
        text-align: left;
        vertical-align: top;
    }

    th {
        color: #1c2127;
        font-weight: 600;
    }
    td {
        color: #1c2127;
    }
    tbody tr:first-child th,
    tbody tr:first-child td,
    tfoot tr:first-child th,
    tfoot tr:first-child td {
        box-shadow: inset 0 1px 0 0 rgba(17, 20, 24, 0.15);
    }

    tbody tr td,
    tfoot tr td {
        box-shadow: inset 0 1px 0 0 rgba(17, 20, 24, 0.15);
    }

    tbody tr td:not(:first-child),
    tfoot tr td:not(:first-child) {
        box-shadow: inset 1px 1px 0 0 rgba(17, 20, 24, 0.15);
    }

    th:not(:first-child) {
        box-shadow: inset 1px 0 0 0 rgba(17, 20, 24, 0.15);
    }

    /* FIXME: everything above this line is copied from blueprint's table css */

    ${({ $showFooter }) =>
        !$showFooter ? `border-bottom: 1px solid #dcdcdd;` : undefined}

    thead {
        z-index: 2;
        position: sticky;
        top: 0;
        inset-block-start: 0; /* "top" */
    }

    thead th:first-child {
        border-top: 1px solid #dcdcdd;
        border-bottom: none !important;
    }

    thead th {
        border-top: 1px solid #dcdcdd;
        border-bottom: none !important;
    }

    tfoot {
        position: sticky;
        z-index: 3;
        bottom: 0;
        inset-block-end: 0; /* "bottom" */
    }

    tfoot th:first-child {
        border-top: none !important;
        border-bottom: none !important;
    }

    tfoot th {
        border-top: none !important;
        border-bottom: none !important;
        box-shadow: inset 0 1px 0 #dcdcdd, inset 0 -1px 0 #dcdcdd,
            inset 1px 0 0 0 rgb(17 20 24 / 15%) !important;
    }

    .sticky-column {
        position: sticky !important;
        left: 1px;
        z-index: 1;
        background-color: white !important;
        word-break: break-word;
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

const FontSyles = `
    font-size: 13px;
`;

const CellStyles = css<{ $isNaN: boolean }>`
    text-align: ${({ $isNaN }) => ($isNaN ? 'left' : 'right')} !important;
    padding: 8.5px !important;
    ${FontSyles}
`;

export const Tr = styled.tr<{
    $index?: number;
}>`
    ${({ $index = 0 }) =>
        $index % 2 === 1
            ? `
                background-color: ${transparentize(
                    0.7,
                    DEFAULT_THEME.colors.gray[1],
                )};
            `
            : ''}

    :hover {
        background-color: ${transparentize(
            0.3,
            DEFAULT_THEME.colors.gray[1],
        )} !important;
    }

    :hover td {
        filter: saturate(1) brightness(0.9);
    }
`;

export const Td = styled.td<{
    $isNaN: boolean;
    $rowIndex: number;
    $isSelected: boolean;
    $isInteractive: boolean;
    $isCopying: boolean;
    $backgroundColor?: string;
    $fontColor?: string;
    $hasData: boolean;
    $isLargeText: boolean;
    $isMinimal: boolean;
}>`
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    height: ${ROW_HEIGHT_PX}px;

    ${({ $isLargeText, $isSelected, $isMinimal }) =>
        $isLargeText
            ? `
                min-width: 300px;
                white-space: ${$isSelected || $isMinimal ? 'normal' : 'nowrap'};
                :hover {
                    white-space: normal;
                }
            `
            : ''}

    ${CellStyles}

    ${({ $isInteractive, $hasData }) =>
        $isInteractive && $hasData
            ? `
                cursor: pointer;
            `
            : ''}

    ${({ $isSelected }) =>
        // this is important because click-outside will not work and it will re-open the menu
        $isSelected ? `pointer-events: none;` : ''}

    ${({ $backgroundColor }) =>
        $backgroundColor
            ? `
                background-color: ${$backgroundColor} !important;
            `
            : `
                background-color: transparent;
            `}

    ${({ $fontColor }) =>
        $fontColor
            ? `
                color: ${$fontColor} !important;
            `
            : ''}

    filter: saturate(1) brightness(1);
    transition: filter 0.15s linear;

    ${({ $isInteractive, $isSelected, $hasData, $backgroundColor }) =>
        $isInteractive && $isSelected && $hasData
            ? `
                    box-shadow: inset 0 0 0 1px #4170CB !important;
                    ${
                        $backgroundColor
                            ? 'filter: saturate(1) brightness(0.8) !important;'
                            : `background-color: #ECF6FE !important;`
                    }
                `
            : ''}

    ${({ $isCopying }) =>
        $isCopying
            ? `filter: saturate(2) brightness(1) !important`
            : 'filter: initial'}
`;

export const FooterCell = styled.th<{ $isNaN: boolean }>`
    ${CellStyles}
    background-color: white;
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

export const TableHeaderLabelContainer = styled.div`
    ${FontSyles}
`;

export const TableHeaderRegularLabel = styled.span`
    font-weight: 400;
    opacity: 0.7;
`;

export const TableHeaderBoldLabel = styled.span`
    font-weight: 600;
`;
