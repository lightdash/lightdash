import { type ConditionalFormattingTextStyle } from '@lightdash/common';
import {
    forwardRef,
    type ComponentPropsWithoutRef,
    type CSSProperties,
} from 'react';
import {
    FROZEN_COLUMN_BACKGROUND,
    FROZEN_COLUMN_BORDER_COLOR,
    FROZEN_COLUMN_BORDER_WIDTH,
    ROW_HEIGHT_PX,
} from './constants';
import classes from './Table.module.css';
import trStyles from './Tr.module.css';

type CssVariables = CSSProperties & Record<`--${string}`, string | number>;

interface TableScrollableWrapperProps extends ComponentPropsWithoutRef<'div'> {
    $isDashboard?: boolean;
}

export const TableScrollableWrapper = forwardRef<
    HTMLDivElement,
    TableScrollableWrapperProps
>(({ $isDashboard, className, ...props }, ref) => (
    <div
        ref={ref}
        className={[
            classes.tableScrollableWrapper,
            $isDashboard ? classes.dashboard : undefined,
            className,
        ]
            .filter(Boolean)
            .join(' ')}
        {...props}
    />
));
TableScrollableWrapper.displayName = 'TableScrollableWrapper';

interface TableContainerProps extends ComponentPropsWithoutRef<'div'> {
    $shouldExpand?: boolean;
    $padding?: number;
    $tableFont?: string;
}

export const TableContainer = forwardRef<HTMLDivElement, TableContainerProps>(
    (
        {
            $shouldExpand,
            $padding = 0,
            $tableFont = 'Inter, sans-serif',
            className,
            style,
            ...props
        },
        ref,
    ) => (
        <div
            ref={ref}
            className={[
                classes.tableContainer,
                $shouldExpand ? classes.expanded : undefined,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            style={
                {
                    '--table-font': $tableFont,
                    '--table-padding': `${$padding}px`,
                    ...style,
                } as CssVariables
            }
            {...props}
        />
    ),
);
TableContainer.displayName = 'TableContainer';

interface TableProps extends ComponentPropsWithoutRef<'table'> {
    $showFooter?: boolean;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
    ({ $showFooter: _showFooter, className, style, ...props }, ref) => (
        <table
            ref={ref}
            className={[classes.table, className].filter(Boolean).join(' ')}
            style={
                {
                    '--frozen-column-background': FROZEN_COLUMN_BACKGROUND,
                    '--frozen-column-border-color': FROZEN_COLUMN_BORDER_COLOR,
                    '--frozen-column-border-width': FROZEN_COLUMN_BORDER_WIDTH,
                    ...style,
                } as CssVariables
            }
            {...props}
        />
    ),
);
Table.displayName = 'Table';

export const TableFooter = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={[classes.tableFooter, className].filter(Boolean).join(' ')}
        {...props}
    />
));
TableFooter.displayName = 'TableFooter';

interface TrProps extends ComponentPropsWithoutRef<'tr'> {
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

interface TdProps extends ComponentPropsWithoutRef<'td'> {
    $isNaN: boolean;
    $rowIndex: number;
    $isSelected: boolean;
    $isInteractive: boolean;
    $isCopying: boolean;
    $backgroundColor?: string;
    $fontColor?: string;
    $textStyle?: ConditionalFormattingTextStyle;
    $hasData: boolean;
    $isLargeText: boolean;
    $isMinimal: boolean;
    $hasNewlines: boolean;
    $hasUrls: boolean;
}

export const Td = forwardRef<HTMLTableCellElement, TdProps>(
    (
        {
            $isNaN,
            $rowIndex: _rowIndex,
            $isSelected,
            $isInteractive,
            $isCopying,
            $backgroundColor,
            $fontColor,
            $textStyle,
            $hasData,
            $isLargeText,
            $isMinimal,
            $hasNewlines: _hasNewlines,
            $hasUrls,
            className,
            style,
            ...props
        },
        ref,
    ) => (
        <td
            ref={ref}
            className={[classes.td, className].filter(Boolean).join(' ')}
            data-nan={$isNaN || undefined}
            data-selected={$isSelected || undefined}
            data-interactive={$isInteractive || undefined}
            data-copying={$isCopying || undefined}
            data-background={$backgroundColor ? true : undefined}
            data-font-color={$fontColor ? true : undefined}
            data-has-data={$hasData || undefined}
            data-large-text={$isLargeText || undefined}
            data-minimal={$isMinimal || undefined}
            data-has-urls={$hasUrls || undefined}
            data-bold={$textStyle?.bold || undefined}
            data-italic={$textStyle?.italic || undefined}
            data-underline={$textStyle?.underline || undefined}
            style={
                {
                    '--table-row-height': `${ROW_HEIGHT_PX}px`,
                    '--cell-background-color': $backgroundColor,
                    '--cell-font-color': $fontColor,
                    ...style,
                } as CssVariables
            }
            {...props}
        />
    ),
);
Td.displayName = 'Td';

interface FooterCellProps extends ComponentPropsWithoutRef<'th'> {
    $isNaN: boolean;
}

export const FooterCell = forwardRef<HTMLTableCellElement, FooterCellProps>(
    ({ $isNaN, className, ...props }, ref) => (
        <th
            ref={ref}
            className={[classes.footerCell, className]
                .filter(Boolean)
                .join(' ')}
            data-nan={$isNaN || undefined}
            {...props}
        />
    ),
);
FooterCell.displayName = 'FooterCell';

export const Th = forwardRef<
    HTMLTableCellElement,
    ComponentPropsWithoutRef<'th'>
>(({ className, ...props }, ref) => (
    <th
        ref={ref}
        className={[classes.th, className].filter(Boolean).join(' ')}
        {...props}
    />
));
Th.displayName = 'Th';

export const ThContainer = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={[classes.thContainer, className].filter(Boolean).join(' ')}
        {...props}
    />
));
ThContainer.displayName = 'ThContainer';

export const ThLabelContainer = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'>
>((props, ref) => <div ref={ref} {...props} />);
ThLabelContainer.displayName = 'ThLabelContainer';

export const ThActionsContainer = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={[classes.thActionsContainer, className]
            .filter(Boolean)
            .join(' ')}
        {...props}
    />
));
ThActionsContainer.displayName = 'ThActionsContainer';

interface TableHeaderLabelContainerProps extends ComponentPropsWithoutRef<'div'> {
    color?: string;
}

export const TableHeaderLabelContainer = forwardRef<
    HTMLDivElement,
    TableHeaderLabelContainerProps
>(({ color, className, style, ...props }, ref) => (
    <div
        ref={ref}
        className={[classes.tableHeaderLabelContainer, className]
            .filter(Boolean)
            .join(' ')}
        style={
            {
                '--table-header-label-color': color,
                ...style,
            } as CssVariables
        }
        {...props}
    />
));
TableHeaderLabelContainer.displayName = 'TableHeaderLabelContainer';

export const TableHeaderRegularLabel = forwardRef<
    HTMLSpanElement,
    ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => (
    <span
        ref={ref}
        className={[classes.tableHeaderRegularLabel, className]
            .filter(Boolean)
            .join(' ')}
        {...props}
    />
));
TableHeaderRegularLabel.displayName = 'TableHeaderRegularLabel';

export const TableHeaderBoldLabel = forwardRef<
    HTMLSpanElement,
    ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => (
    <span
        ref={ref}
        className={[classes.tableHeaderBoldLabel, className]
            .filter(Boolean)
            .join(' ')}
        {...props}
    />
));
TableHeaderBoldLabel.displayName = 'TableHeaderBoldLabel';
