import { forwardRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { ROW_HEIGHT_PX } from './constants';
import trStyles from './Tr.module.css';

export const TableScrollableWrapper = styled.div`
    display: flex;
    flex-direction: column;

    position: relative;
    overflow: auto;
    min-width: 100%;
    border-radius: 4px;
    border: 1px solid var(--mantine-color-ldGray-3);
`;

interface TableContainerProps {
    $shouldExpand?: boolean;
    $padding?: number;
    $tableFont?: string;
}

export const TableContainer = styled.div<
    TableContainerProps & { children: ReactNode }
>`
    display: flex;
    flex-direction: column;
    min-width: 100%;
    overflow: hidden;

    font-family: ${({ $tableFont }) => $tableFont ?? 'Inter, sans-serif'};
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

export const Table = styled.table<{
    $showFooter?: boolean;
}>`
    border-spacing: 0;
    font-size: 14px;
    width: 100%;
    border-radius: 4px;

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
        font-weight: 600;
    }
    td {
    }

    /* Inner cell borders using box-shadow (from Blueprint CSS) */
    tbody tr:first-child th,
    tbody tr:first-child td,
    tfoot tr:first-child th,
    tfoot tr:first-child td {
        box-shadow: inset 0 1px 0 0
            color-mix(in srgb, var(--mantine-color-ldGray-3) 80%, transparent);
    }

    tbody tr td,
    tfoot tr td {
        box-shadow: inset 0 1px 0 0
            color-mix(in srgb, var(--mantine-color-ldGray-3) 80%, transparent);
    }

    tbody tr td:not(:first-child),
    tfoot tr td:not(:first-child) {
        box-shadow: inset 1px 1px 0 0
            color-mix(in srgb, var(--mantine-color-ldGray-3) 80%, transparent);
    }

    th:not(:first-child) {
        box-shadow: inset 1px 0 0 0
            color-mix(in srgb, var(--mantine-color-ldGray-3) 80%, transparent);
    }

    /* FIXME: everything above this line is copied from blueprint's table css */

    thead {
        z-index: 2;
        position: sticky;
        top: 0;
        inset-block-start: 0; /* "top" */
    }

    thead th {
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
        /* Footer cell border: top separator between body and footer */
        box-shadow: inset 0 1px 0 var(--mantine-color-ldGray-3) !important;
    }

    .sticky-column {
        position: sticky;
        left: 0;
        z-index: 1;
        word-break: break-word;
        :hover {
            white-space: normal;
            background-color: white;
        }
    }
    th.sticky-column {
        background: white !important;
    }

    .last-sticky-column {
        border-right: 1.4px solid rgb(189, 189, 189);
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

interface TrProps extends ComponentPropsWithRef<'tr'> {
    $index?: number;
}

export const Tr = forwardRef<HTMLTableRowElement, TrProps>(
    ({ className, $index = 0, ...props }, ref) => (
        <tr
            ref={ref}
            className={[trStyles.tr, className].filter(Boolean).join(' ')}
            data-odd={$index % 2 === 1 ? 'true' : undefined}
            {...props}
        />
    ),
);
Tr.displayName = 'Tr';

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
    $hasNewlines: boolean;
    $hasUrls: boolean;
}>`
    max-width: 300px;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
    height: ${ROW_HEIGHT_PX}px;

    ${({ $isLargeText, $isSelected, $isMinimal }) =>
        $isLargeText
            ? `
                min-width: 300px;
                white-space: ${$isSelected || $isMinimal ? 'pre-wrap' : 'pre'};
                :hover {
                    white-space: pre-wrap;
                }
            `
            : ''}
    ${CellStyles}

    ${({ $hasUrls }) =>
        $hasUrls
            ? `
                text-decoration: underline;
                text-decoration-style: dotted;
            `
            : ''}

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
                    box-shadow: inset 0 0 0 1px var(--table-selected-border) !important;
                    ${
                        $backgroundColor
                            ? 'filter: saturate(1) brightness(0.8) !important;'
                            : `background-color: var(--table-selected-bg) !important;`
                    }
                `
            : ''}

    ${({ $isCopying }) =>
        $isCopying
            ? `filter: saturate(2) brightness(1) !important`
            : 'filter: initial'}
`;

export const FooterCell = styled.th<{ $isNaN: boolean }>`
    ${CellStyles};
    background-color: var(--mantine-color-ldGray-0);
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
