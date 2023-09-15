import { assertUnreachable } from '@lightdash/common';
import { Box, BoxProps as BoxPropsBase, Tooltip } from '@mantine/core';
import { getHotkeyHandler, useClipboard, useId } from '@mantine/hooks';
import { PolymorphicComponentProps } from '@mantine/utils';
import {
    createContext,
    FC,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useScroll } from 'react-use';
import {
    useTableCellStyles,
    useTableRowStyles,
    useTableSectionStyles,
    useTableStyles,
} from './styles';

type BoxProps = Omit<BoxPropsBase, 'component' | 'children'>;

type TableProps = PolymorphicComponentProps<'table', BoxProps>;
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
    withAlignRight?: boolean;
    withTooltip?: string | false;
    withBoldFont?: boolean;
    withInteractions?: boolean;
    withColor?: string | false;
    withBackground?: string | false;
};

interface TableCompoundComponents {
    Head: FC<TableSectionProps>;
    Body: FC<TableSectionProps>;
    Footer: FC<TableSectionProps>;
    Row: FC<TableRowProps>;
    Cell: FC<TableCellProps>;
    CellHead: FC<TableCellProps>;
}

export enum SectionType {
    Head = 'head',
    Body = 'body',
    Footer = 'footer',
}

export enum CellType {
    Head = 'head',
    Data = 'data',
}

type TableContextType = {
    selectedCell: string | null;
    setSelectedCell: (cellId: string | null) => void;

    scrollPositions: {
        isAtTop: boolean;
        isAtBottom: boolean;
    };
};

const TableContext = createContext<TableContextType | null>(null);

export const useTableContext = () => {
    const context = useContext(TableContext);
    if (context === null) {
        throw new Error(
            'component cannot be rendered outside the TableProvider',
        );
    }
    return context;
};

const TableProvider: FC<Pick<TableContextType, 'scrollPositions'>> = ({
    children,
    scrollPositions,
}) => {
    const [selectedCell, setSelectedCell] = useState<string | null>(null);

    return (
        <TableContext.Provider
            value={{ selectedCell, setSelectedCell, scrollPositions }}
        >
            {children}
        </TableContext.Provider>
    );
};

const TableComponent = forwardRef<HTMLTableElement, TableProps>(
    ({ children, component = 'table', ...rest }, ref) => {
        const { cx, classes } = useTableStyles();

        const containerRef = useRef<HTMLTableElement>(null);
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

        console.log({ isAtTop, isAtBottom });

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

const SectionProvider: FC<SectionContextType> = ({
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

const RowProvider: FC<RowContextType> = ({ children, index }) => {
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

const SectionBase = (sectionType: SectionType) => {
    return forwardRef<HTMLTableSectionElement, TableSectionProps>(
        ({ children, withSticky = false, ...rest }, ref) => {
            const { scrollPositions } = useTableContext();
            const { cx, classes } = useTableSectionStyles({
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
        },
    );
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

const BaseCell = (cellType: CellType) => {
    return forwardRef<HTMLTableCellElement, TableCellProps>(
        (
            {
                children,
                withAlignRight = false,
                withTooltip = false,
                withBoldFont = false,
                withInteractions = false,
                withColor = false,
                withBackground = false,
                ...rest
            },
            ref,
        ) => {
            const cellId = useId();
            const clipboard = useClipboard({ timeout: 200 });

            console.log(clipboard);

            const { selectedCell, setSelectedCell } = useTableContext();
            const { index } = useRowContext();
            const { sectionType, withSticky } = useSectionContext();

            const isSelected = selectedCell === cellId;

            const handleCopy = useCallback(() => {
                if (isSelected) {
                    clipboard.copy(children);
                }
            }, [clipboard, children, isSelected]);

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
                isSelected,
                withColor,
                withBackground,
            });

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

            const content = useMemo(() => {
                return withTooltip ? (
                    <Tooltip
                        withinPortal
                        label={withTooltip}
                        multiline
                        maw={400}
                    >
                        <span>{children}</span>
                    </Tooltip>
                ) : (
                    children
                );
            }, [children, withTooltip]);

            const floatingElement = useMemo(
                () => (
                    <Box
                        className={cx(classes.floatingElement, {
                            [classes.withInteractions]: withInteractions,
                            [classes.withBackground]: withBackground,
                            [classes.withCopying]: clipboard.copied,
                        })}
                    />
                ),
                [
                    clipboard.copied,
                    classes,
                    withBackground,
                    withInteractions,
                    cx,
                ],
            );

            return (
                <Box
                    component={component}
                    ref={ref}
                    {...rest}
                    className={cx(classes.root, rest.className, {
                        [classes.withSticky]: withSticky,
                        [classes.withAlignRight]: withAlignRight,
                        [classes.withBoldFont]: withBoldFont,
                        [classes.withColor]: withColor,
                    })}
                    onClick={
                        withInteractions
                            ? () =>
                                  isSelected
                                      ? setSelectedCell(null)
                                      : setSelectedCell(cellId)
                            : undefined
                    }
                >
                    {floatingElement}
                    {content}
                </Box>
            );
        },
    );
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

Table.displayName = 'Table';
Table.Head.displayName = 'Table.Head';
Table.Body.displayName = 'Table.Body';
Table.Footer.displayName = 'Table.Footer';
Table.Row.displayName = 'Table.Row';
Table.CellHead.displayName = 'Table.CellHead';
Table.Cell.displayName = 'Table.Cell';

export default Table;
