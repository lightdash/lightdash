import { assertUnreachable } from '@lightdash/common';
import {
    Box,
    Text,
    Tooltip,
    type BoxProps as BoxPropsBase,
} from '@mantine/core';
import { getHotkeyHandler, useClipboard, useId } from '@mantine/hooks';
import { type PolymorphicComponentProps } from '@mantine/utils';
import debounce from 'lodash/debounce';
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
    type RefAttributes,
} from 'react';
import { useScroll } from 'react-use';
import {
    useTableCellStyles,
    useTableRowStyles,
    useTableSectionStyles,
    useTableStyles,
} from './styles';

export const SMALL_TEXT_LENGTH = 35;

type BoxProps = Omit<BoxPropsBase, 'component' | 'children'>;

type TableProps = PolymorphicComponentProps<'table', BoxProps> & {
    containerRef: React.RefObject<HTMLDivElement>;
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
    withMinimalWidth?: boolean;
    withAlignRight?: boolean;
    withBoldFont?: boolean;
    withInteractions?: boolean;
    withColor?: false | string;
    withBackground?: false | string;
    withTooltip?: false | string;
    withMenu?:
        | false
        | ((
              props: {
                  isOpen: boolean;
                  onClose: () => void;
                  onCopy: () => void;
              },
              renderFn: () => JSX.Element,
          ) => JSX.Element);
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

export enum SectionType {
    Head = 'Head',
    Body = 'Body',
    Footer = 'Footer',
}

export enum CellType {
    Head = 'Head',
    Data = 'Data',
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
    ({ children, component = 'table', containerRef, ...rest }, ref) => {
        const { cx, classes } = useTableStyles();

        const [isContainerInitialized, setIsContainerInitialized] =
            useState(false);
        const containerScroll = useScroll(containerRef);

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
                miw="inherit"
                h="inherit"
                pos="relative"
                sx={{ overflow: 'auto' }}
            >
                <Box
                    ref={ref}
                    component={component}
                    {...rest}
                    className={cx(classes.root, rest.className)}
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
        const { cx, classes } = useTableSectionStyles({
            withSticky,
            sectionType,
            scrollPositions,
        });

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
                className={cx(classes.root, rest.className, {
                    [classes.withSticky]: withSticky,
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
        const { cx, classes } = useTableRowStyles({
            sectionType: sectionType,
            index,
        });

        return (
            <RowProvider index={index}>
                <Box
                    component={component}
                    ref={ref}
                    {...rest}
                    className={cx(classes.root, rest.className, {
                        [classes.withSticky]: withSticky,
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
    const CellComponent: ForwardRefRenderFunction<
        HTMLTableCellElement,
        TableCellProps
    > = (
        {
            children,
            withMinimalWidth = false,
            withAlignRight = false,
            withTooltip = false,
            withBoldFont = false,
            withInteractions = false,
            withColor = false,
            withBackground = false,
            withMenu = false,
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

        const handleCopy = useCallback(() => {
            clipboard.copy(children);
        }, [clipboard, children]);

        useEffect(() => {
            const handleKeyDown = getHotkeyHandler([['mod+C', handleCopy]]);
            if (isSelected) {
                document.body.addEventListener('keydown', handleKeyDown);
            }

            return () => {
                document.body.removeEventListener('keydown', handleKeyDown);
            };
        }, [handleCopy, isSelected]);

        const { cx, classes } = useTableCellStyles({
            sectionType,
            cellType,
            index,
            withColor,
            withBackground,
        });

        const cellHasLargeContent = useMemo(() => {
            return (
                sectionType === SectionType.Body &&
                typeof children === 'string' &&
                children.length > SMALL_TEXT_LENGTH
            );
        }, [sectionType, children]);

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
                    className={cx(classes.root, rest.className, {
                        [classes.withSticky]: withSticky,
                        [classes.withLargeContent]: cellHasLargeContent,
                        [classes.withMinimalWidth]: withMinimalWidth,
                        [classes.withAlignRight]: withAlignRight,
                        [classes.withBoldFont]: withBoldFont,
                        [classes.withColor]: withColor,
                        [classes.withInteractions]: withInteractions,
                        [classes.withBackground]: withBackground,
                        [classes.withCopying]: clipboard.copied,
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
                        >
                            <Text span>{children}</Text>
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
                cx,
                classes.root,
                classes.withSticky,
                classes.withLargeContent,
                classes.withMinimalWidth,
                classes.withAlignRight,
                classes.withBoldFont,
                classes.withColor,
                classes.withInteractions,
                classes.withBackground,
                classes.withCopying,
                withSticky,
                cellHasLargeContent,
                withMinimalWidth,
                withAlignRight,
                withBoldFont,
                withColor,
                withInteractions,
                withBackground,
                clipboard.copied,
                withTooltip,
                isSelected,
                toggleCell,
                cellId,
                children,
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
    };

    CellComponent.displayName = `LightTable.${CellType[cellType]}`;
    return forwardRef(CellComponent);
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
