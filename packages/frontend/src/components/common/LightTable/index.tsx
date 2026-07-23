import {
    assertUnreachable,
    type ConditionalFormattingTextStyle,
} from '@lightdash/common';
import {
    Box,
    type BoxProps as BoxPropsBase,
    type PolymorphicComponentProps,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { getHotkeyHandler, useClipboard, useId } from '@mantine-8/hooks';
import clsx from 'clsx';
import debounce from 'lodash/debounce';
import { darken } from 'polished';
import {
    createContext,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type FC,
    type ForwardRefExoticComponent,
    type ForwardRefRenderFunction,
    type PropsWithoutRef,
    type ReactNode,
    type RefAttributes,
} from 'react';
import { useScroll } from 'react-use';
import useToaster from '../../../hooks/toaster/useToaster';
import { CELL_HEIGHT, SMALL_TEXT_LENGTH } from './constants';
import styles from './LightTable.module.css';
import { CellType, SectionType } from './types';

type BoxProps = Omit<BoxPropsBase, 'component' | 'children'>;

type TableProps = PolymorphicComponentProps<'table', BoxProps> & {
    containerRef: React.RefObject<HTMLDivElement | null>;
    isDashboard?: boolean;
};
type TableSectionProps = PolymorphicComponentProps<
    'thead' | 'tbody' | 'tfoot',
    BoxProps
> & {
    withSticky?: boolean;
};
type TableRowProps = PolymorphicComponentProps<'tr', BoxProps> & {
    index: number;
};
type TableCellProps = PolymorphicComponentProps<'th' | 'td', BoxProps> & {
    isMinimal?: boolean;
    withMinimalWidth?: boolean;
    withAlignRight?: boolean;
    withBoldFont?: boolean;
    withInteractions?: boolean;
    withColor?: false | string;
    withBackground?: false | string;
    withTextStyle?: false | ConditionalFormattingTextStyle;
    withTooltip?: false | string;
    withMenu?:
        | false
        | ((
              props: {
                  isOpen: boolean;
                  onClose: () => void;
                  onCopy: () => void;
              },
              renderFn: () => ReactNode,
          ) => ReactNode);
    withValue?: string;
};

interface TableCompoundComponents {
    Head: ForwardRefExoticComponent<
        PropsWithoutRef<TableSectionProps> &
            RefAttributes<HTMLTableSectionElement>
    >;
    Body: ForwardRefExoticComponent<
        PropsWithoutRef<TableSectionProps> &
            RefAttributes<HTMLTableSectionElement>
    >;
    Footer: ForwardRefExoticComponent<
        PropsWithoutRef<TableSectionProps> &
            RefAttributes<HTMLTableSectionElement>
    >;
    Row: ForwardRefExoticComponent<
        PropsWithoutRef<TableRowProps> & RefAttributes<HTMLTableRowElement>
    >;
    Cell: ForwardRefExoticComponent<
        PropsWithoutRef<TableCellProps> & RefAttributes<HTMLTableCellElement>
    >;
    CellHead: ForwardRefExoticComponent<
        PropsWithoutRef<TableCellProps> & RefAttributes<HTMLTableCellElement>
    >;
}

type TableContextType = {
    selectedCell: string | null;
    toggleCell: (cellId: string | null) => void;

    scrollPositions: {
        isAtTop: boolean;
        isAtBottom: boolean;
    };
};

const TableContext = createContext<TableContextType | null>(null);

const useTableContext = () => {
    const context = useContext(TableContext);
    if (context === null) {
        throw new Error(
            'component cannot be rendered outside the TableProvider',
        );
    }
    return context;
};

const TableProvider: FC<
    React.PropsWithChildren<Pick<TableContextType, 'scrollPositions'>>
> = ({ children, scrollPositions }) => {
    const [selectedCell, setSelectedCell] = useState<string | null>(null);

    const handleToggleCell = useCallback(
        (cellId: string | null) => {
            setSelectedCell(cellId);
        },
        [setSelectedCell],
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedToggleCell = useMemo(() => {
        return debounce(handleToggleCell, 300, {
            leading: true,
            trailing: false,
        });
    }, [handleToggleCell]);

    return (
        <TableContext.Provider
            value={{
                selectedCell,
                toggleCell: handleDebouncedToggleCell,
                scrollPositions,
            }}
        >
            {children}
        </TableContext.Provider>
    );
};

const TableComponent = forwardRef<HTMLTableElement, TableProps>(
    (
        {
            children,
            component = 'table',
            containerRef,
            isDashboard = false,
            ...rest
        },
        ref,
    ) => {
        const shouldRemoveBorders = isDashboard;

        const [isContainerInitialized, setIsContainerInitialized] =
            useState(false);
        const containerScroll = useScroll(
            containerRef as React.RefObject<HTMLElement>,
        );

        useEffect(() => {
            if (!containerRef.current) return;
            setIsContainerInitialized(true);
        }, [containerRef]);

        const { isAtTop, isAtBottom } = useMemo(() => {
            if (!isContainerInitialized || !containerRef.current) {
                return {
                    isAtTop: false,
                    isAtBottom: false,
                };
            }

            const { clientHeight, scrollHeight } = containerRef.current;
            const containerScrollPosY = containerScroll.y;

            return {
                isAtTop: containerScrollPosY === 0,
                isAtBottom:
                    containerScrollPosY + clientHeight === scrollHeight ||
                    containerScrollPosY + clientHeight === scrollHeight,
            };
        }, [containerScroll, containerRef, isContainerInitialized]);

        return (
            <Box
                ref={containerRef}
                className={clsx(styles.container, {
                    [styles.dashboardContainer]: shouldRemoveBorders,
                })}
            >
                <Box
                    ref={ref}
                    component={component}
                    {...rest}
                    className={clsx(styles.root, rest.className)}
                >
                    <TableProvider scrollPositions={{ isAtBottom, isAtTop }}>
                        {children}
                    </TableProvider>
                </Box>
            </Box>
        );
    },
);

type SectionContextType = {
    sectionType: SectionType;
    withSticky?: boolean;
};

const SectionContext = createContext<SectionContextType | null>(null);

const SectionProvider: FC<React.PropsWithChildren<SectionContextType>> = ({
    children,
    sectionType,
    withSticky = false,
}) => {
    return (
        <SectionContext.Provider value={{ sectionType, withSticky }}>
            {children}
        </SectionContext.Provider>
    );
};

const useSectionContext = () => {
    const context = useContext(SectionContext);
    if (context === null) {
        throw new Error(
            'component cannot be rendered outside the SectionProvider',
        );
    }
    return context;
};

type RowContextType = { index: number };

const RowContext = createContext<RowContextType | null>(null);

const RowProvider: FC<React.PropsWithChildren<RowContextType>> = ({
    children,
    index,
}) => {
    return (
        <RowContext.Provider value={{ index }}>{children}</RowContext.Provider>
    );
};

const useRowContext = () => {
    const context = useContext(RowContext);
    if (context === null) {
        throw new Error(
            'Row components cannot be rendered outside the RowContext component',
        );
    }
    return context;
};

const SectionBase = (
    sectionType: SectionType,
): ForwardRefExoticComponent<
    PropsWithoutRef<TableSectionProps> & RefAttributes<HTMLTableSectionElement>
> => {
    const SectionComponent: ForwardRefRenderFunction<
        HTMLTableSectionElement,
        TableSectionProps
    > = ({ children, withSticky = false, ...rest }, ref) => {
        const { scrollPositions } = useTableContext();
        const isHead = sectionType === SectionType.Head;
        const isFooter = sectionType === SectionType.Footer;
        const withShadow =
            withSticky &&
            ((isHead && !scrollPositions.isAtTop) ||
                (isFooter && !scrollPositions.isAtBottom));

        const component = useMemo(() => {
            switch (sectionType) {
                case SectionType.Head:
                    return 'thead';
                case SectionType.Body:
                    return 'tbody';
                case SectionType.Footer:
                    return 'tfoot';
                default:
                    return assertUnreachable(
                        sectionType,
                        `Unknown cell type: ${sectionType}`,
                    );
            }
        }, []);

        return (
            <Box
                component={component}
                ref={ref}
                {...rest}
                className={clsx(rest.className, {
                    [styles.stickySection]: withSticky,
                    [styles.headSection]: withSticky && isHead,
                    [styles.footerSection]: withSticky && isFooter,
                    [styles.withShadow]: withShadow,
                })}
            >
                <SectionProvider
                    sectionType={sectionType}
                    withSticky={withSticky}
                >
                    {children}
                </SectionProvider>
            </Box>
        );
    };

    SectionComponent.displayName = `LightTable.${SectionType[sectionType]}`;
    return forwardRef(SectionComponent);
};

const Row = forwardRef<HTMLTableRowElement, TableRowProps>(
    ({ children, component = 'tr', index, ...rest }, ref) => {
        const { sectionType, withSticky } = useSectionContext();
        const isHead = sectionType === SectionType.Head;
        const isBody = sectionType === SectionType.Body;
        const isFooter = sectionType === SectionType.Footer;

        return (
            <RowProvider index={index}>
                <Box
                    component={component}
                    ref={ref}
                    {...rest}
                    __vars={{
                        '--light-table-sticky-offset': `${index * CELL_HEIGHT}px`,
                    }}
                    className={clsx(styles.row, rest.className, {
                        [styles.bodyRow]: isBody,
                        [styles.stickyRow]: withSticky,
                        [styles.headRow]: withSticky && isHead,
                        [styles.footerRow]: withSticky && isFooter,
                    })}
                >
                    {children}
                </Box>
            </RowProvider>
        );
    },
);

const BaseCell = (
    cellType: CellType,
): ForwardRefExoticComponent<
    PropsWithoutRef<TableCellProps> & RefAttributes<HTMLTableCellElement>
> => {
    const CellComponent = forwardRef<HTMLTableCellElement, TableCellProps>(
        (
            {
                children,
                isMinimal = false,
                withMinimalWidth = false,
                withAlignRight = false,
                withTooltip = false,
                withBoldFont = false,
                withInteractions = false,
                withColor = false,
                withBackground = false,
                withTextStyle = false,
                withMenu = false,
                withValue = undefined,
                ...rest
            },
            ref,
        ) => {
            const cellId = useId();
            const clipboard = useClipboard({ timeout: 200 });

            const { selectedCell, toggleCell } = useTableContext();
            const { index } = useRowContext();
            const { sectionType, withSticky } = useSectionContext();

            const isSelected = selectedCell === cellId;

            const { showToastSuccess } = useToaster();

            const handleCopy = useCallback(() => {
                clipboard.copy(withValue === undefined ? '' : withValue);
                showToastSuccess({ title: 'Copied to clipboard!' });
            }, [clipboard, withValue, showToastSuccess]);

            useEffect(() => {
                const handleKeyDown = getHotkeyHandler([['mod+C', handleCopy]]);
                if (isSelected) {
                    document.body.addEventListener('keydown', handleKeyDown);
                }

                return () => {
                    document.body.removeEventListener('keydown', handleKeyDown);
                };
            }, [handleCopy, isSelected]);

            const isHead = sectionType === SectionType.Head;
            const isFooter = sectionType === SectionType.Footer;
            const cellVariables = useMemo(
                () => ({
                    '--light-table-sticky-offset': `${index * CELL_HEIGHT}px`,
                    ...(withColor
                        ? { '--light-table-cell-color': withColor }
                        : {}),
                    ...(withBackground
                        ? {
                              '--light-table-cell-background': withBackground,
                              '--light-table-cell-background-selected': darken(
                                  0.05,
                                  withBackground,
                              ),
                              '--light-table-cell-background-selected-border':
                                  darken(0.2, withBackground),
                              '--light-table-cell-background-border': darken(
                                  0.03,
                                  withBackground,
                              ),
                          }
                        : {}),
                }),
                [index, withBackground, withColor],
            );

            const cellHasLargeContent = useMemo(() => {
                return !!(
                    sectionType === SectionType.Body &&
                    withValue &&
                    typeof withValue === 'string' &&
                    withValue.length > SMALL_TEXT_LENGTH
                );
            }, [sectionType, withValue]);

            const component = useMemo(() => {
                switch (cellType) {
                    case CellType.Head:
                        return 'th';
                    case CellType.Data:
                        return 'td';
                    default:
                        return assertUnreachable(
                            cellType,
                            `Unknown cell type: ${cellType}`,
                        );
                }
            }, []);

            const cellElement = useMemo(
                () => (
                    <Box
                        component={component}
                        ref={ref}
                        {...rest}
                        data-is-selected={isSelected}
                        __vars={cellVariables}
                        className={clsx(styles.cell, rest.className, {
                            [styles.headCell]: cellType === CellType.Head,
                            [styles.stickyCell]: withSticky,
                            [styles.headCellSticky]: withSticky && isHead,
                            [styles.footerCellSticky]: withSticky && isFooter,
                            [styles.withLargeContent]:
                                cellHasLargeContent && !isMinimal,
                            [styles.withMinimalWidth]: withMinimalWidth,
                            [styles.withAlignRight]: withAlignRight,
                            [styles.withBoldFont]: withBoldFont,
                            [styles.withColor]: !!withColor,
                            [styles.withTextBold]:
                                !!withTextStyle && withTextStyle.bold,
                            [styles.withTextItalic]:
                                !!withTextStyle && withTextStyle.italic,
                            [styles.withTextUnderline]:
                                !!withTextStyle && withTextStyle.underline,
                            [styles.withInteractions]: withInteractions,
                            [styles.withBackground]: !!withBackground,
                            [styles.withCopying]: clipboard.copied,
                        })}
                        onClick={
                            withInteractions
                                ? () => {
                                      toggleCell(isSelected ? null : cellId);
                                  }
                                : undefined
                        }
                    >
                        {children && withTooltip ? (
                            <Tooltip
                                position="top"
                                disabled={isSelected}
                                withinPortal
                                maw={400}
                                multiline
                                label={withTooltip}
                                openDelay={500}
                            >
                                <Text span inherit>
                                    {children}
                                </Text>
                            </Tooltip>
                        ) : (
                            <>{children}</>
                        )}
                    </Box>
                ),
                [
                    component,
                    ref,
                    rest,
                    isSelected,
                    cellVariables,
                    withSticky,
                    isHead,
                    isFooter,
                    cellHasLargeContent,
                    isMinimal,
                    withMinimalWidth,
                    withAlignRight,
                    withBoldFont,
                    withColor,
                    withTextStyle,
                    withInteractions,
                    withBackground,
                    clipboard.copied,
                    children,
                    withTooltip,
                    toggleCell,
                    cellId,
                ],
            );

            return withMenu
                ? withMenu(
                      {
                          isOpen: isSelected,
                          onClose: () => toggleCell(null),
                          onCopy: handleCopy,
                      },
                      () => cellElement,
                  )
                : cellElement;
        },
    );

    CellComponent.displayName = `LightTable.${CellType[cellType]}`;
    return CellComponent;
};

const Table = TableComponent as typeof TableComponent & TableCompoundComponents;
const Head = SectionBase(SectionType.Head);
const Body = SectionBase(SectionType.Body);
const Footer = SectionBase(SectionType.Footer);
const CellHead = BaseCell(CellType.Head);
const Cell = BaseCell(CellType.Data);

Table.Head = Head;
Table.Body = Body;
Table.Footer = Footer;
Table.Row = Row;
Table.CellHead = CellHead;
Table.Cell = Cell;

Table.displayName = 'LightTable';
Table.Head.displayName = 'LightTable.Head';
Table.Body.displayName = 'LightTable.Body';
Table.Footer.displayName = 'LightTable.Footer';
Table.Row.displayName = 'LightTable.Row';
Table.CellHead.displayName = 'LightTable.CellHead';
Table.Cell.displayName = 'LightTable.Cell';

export default Table;
