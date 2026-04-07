import {
    forwardRef,
    type ComponentPropsWithRef,
    type CSSProperties,
    type FC,
    type HTMLAttributes,
    type ReactNode,
    type ThHTMLAttributes,
} from 'react';
import styles from './Table.module.css';
import trStyles from './Tr.module.css';

export const TableScrollableWrapper = forwardRef<
    HTMLDivElement,
    HTMLAttributes<HTMLDivElement> & {
        $isDashboard?: boolean;
        children: ReactNode;
    }
>(({ $isDashboard, children, className, ...props }, ref) => (
    <div
        ref={ref}
        className={[styles.tableScrollableWrapper, className]
            .filter(Boolean)
            .join(' ')}
        data-dashboard={$isDashboard ? 'true' : undefined}
        {...props}
    >
        {children}
    </div>
));
TableScrollableWrapper.displayName = 'TableScrollableWrapper';

interface TableContainerProps {
    $shouldExpand?: boolean;
    $padding?: number;
    $tableFont?: string;
}

export const TableContainer: FC<
    HTMLAttributes<HTMLDivElement> &
        TableContainerProps & { children: ReactNode }
> = ({
    $shouldExpand,
    $padding = 0,
    $tableFont,
    children,
    className,
    style,
    ...props
}) => (
    <div
        className={[styles.tableContainer, className].filter(Boolean).join(' ')}
        data-expand={$shouldExpand ? 'true' : undefined}
        style={
            {
                ...style,
                '--table-font': $tableFont ?? undefined,
                '--table-padding': `${$padding}px`,
            } as CSSProperties
        }
        {...props}
    >
        {children}
    </div>
);

export const Table: FC<
    HTMLAttributes<HTMLTableElement> & {
        $showFooter?: boolean;
        children: ReactNode;
    }
> = ({ $showFooter: _showFooter, children, className, ...props }) => (
    <table
        className={[styles.table, className].filter(Boolean).join(' ')}
        {...props}
    >
        {children}
    </table>
);

export const TableFooter: FC<
    HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
> = ({ children, className, ...props }) => (
    <div
        className={[styles.tableFooter, className].filter(Boolean).join(' ')}
        {...props}
    >
        {children}
    </div>
);

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

interface TdProps extends HTMLAttributes<HTMLTableCellElement> {
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
            $hasData,
            $isLargeText,
            $isMinimal,
            $hasNewlines,
            $hasUrls,
            className,
            style,
            ...props
        },
        ref,
    ) => (
        <td
            ref={ref}
            className={[styles.td, className].filter(Boolean).join(' ')}
            data-nan={$isNaN ? 'true' : undefined}
            data-selected={$isSelected ? 'true' : undefined}
            data-interactive={$isInteractive ? 'true' : undefined}
            data-copying={$isCopying ? 'true' : undefined}
            data-has-data={$hasData ? 'true' : undefined}
            data-large-text={$isLargeText ? 'true' : undefined}
            data-minimal={$isMinimal ? 'true' : undefined}
            data-has-newlines={$hasNewlines ? 'true' : undefined}
            data-has-urls={$hasUrls ? 'true' : undefined}
            data-has-bg={$backgroundColor ? 'true' : undefined}
            data-has-font-color={$fontColor ? 'true' : undefined}
            style={
                {
                    ...style,
                    '--td-bg-color': $backgroundColor ?? undefined,
                    '--td-font-color': $fontColor ?? undefined,
                } as CSSProperties
            }
            {...props}
        />
    ),
);
Td.displayName = 'Td';

export const FooterCell: FC<
    ThHTMLAttributes<HTMLTableCellElement> & {
        $isNaN: boolean;
        children?: ReactNode;
    }
> = ({ $isNaN, children, className, ...props }) => (
    <th
        className={[styles.footerCell, className].filter(Boolean).join(' ')}
        data-nan={$isNaN ? 'true' : undefined}
        {...props}
    >
        {children}
    </th>
);

export const Th: FC<
    ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }
> = ({ children, className, ...props }) => (
    <th className={[styles.th, className].filter(Boolean).join(' ')} {...props}>
        {children}
    </th>
);

export const ThContainer: FC<
    HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
> = ({ children, className, ...props }) => (
    <div
        className={[styles.thContainer, className].filter(Boolean).join(' ')}
        {...props}
    >
        {children}
    </div>
);

export const ThLabelContainer = forwardRef<
    HTMLDivElement,
    HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
>(({ children, className, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
        {children}
    </div>
));
ThLabelContainer.displayName = 'ThLabelContainer';

export const ThActionsContainer: FC<
    HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
> = ({ children, className, ...props }) => (
    <div
        className={[styles.thActionsContainer, className]
            .filter(Boolean)
            .join(' ')}
        {...props}
    >
        {children}
    </div>
);

export const TableHeaderLabelContainer: FC<
    HTMLAttributes<HTMLDivElement> & { color?: string; children?: ReactNode }
> = ({ color, children, className, style, ...props }) => (
    <div
        className={[styles.tableHeaderLabelContainer, className]
            .filter(Boolean)
            .join(' ')}
        style={
            color
                ? ({
                      ...style,
                      '--table-header-label-color': color,
                  } as CSSProperties)
                : style
        }
        {...props}
    >
        {children}
    </div>
);

export const TableHeaderRegularLabel: FC<
    HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }
> = ({ children, className, ...props }) => (
    <span
        className={[styles.tableHeaderRegularLabel, className]
            .filter(Boolean)
            .join(' ')}
        {...props}
    >
        {children}
    </span>
);

export const TableHeaderBoldLabel: FC<
    HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }
> = ({ children, className, ...props }) => (
    <span
        className={[styles.tableHeaderBoldLabel, className]
            .filter(Boolean)
            .join(' ')}
        {...props}
    >
        {children}
    </span>
);
