import {
    assertUnreachable,
    PartitionType,
    WarehouseTableType,
    type PartitionColumn,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Center,
    Group,
    Highlight,
    Loader,
    ScrollArea,
    SegmentedControl,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronRight,
    IconCloudDataConnection,
    IconDatabase,
    IconEye,
    IconEyeTable,
    IconFolder,
    IconList,
    IconLock,
    IconPlugConnected,
    IconSearch,
    IconTable,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useReportMissingConnection } from '../hooks/useConnectionReconciliation';
import { useWarehouseTree } from '../hooks/useWarehouseTree';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql, toggleActiveTable } from '../store/sqlRunnerSlice';
import { tableClickOutcome } from '../utils/activeConnection';
import {
    buildWarehouseTreeRows,
    catalogHasViews,
    qualifiedTableName,
    type TableIdentity,
    type TableTypeFilter,
    type TableUnitKey,
    type WarehouseTreeRow,
} from '../utils/tableRows';
import {
    ConnectionSwitchPrompt,
    type PendingConnectionSwitch,
} from './ConnectionSwitchPrompt';
import styles from './Tables.module.css';

const GROUP_ROW_HEIGHT = 34;
const TABLE_ROW_HEIGHT = 30;
const MESSAGE_ROW_HEIGHT = 32;
const MIN_SEARCH_LENGTH = 3;

// Rows cached before the type was stored fall back to the table icon
const getTableTypeDisplay = (
    tableType: WarehouseTableType | undefined,
): { icon: Icon; label: string } => {
    switch (tableType) {
        case WarehouseTableType.VIEW:
            return { icon: IconEye, label: 'View' };
        case WarehouseTableType.MATERIALIZED_VIEW:
            return { icon: IconEyeTable, label: 'Materialized view' };
        case WarehouseTableType.EXTERNAL:
            return { icon: IconCloudDataConnection, label: 'External table' };
        case WarehouseTableType.TABLE:
        case undefined:
            return { icon: IconTable, label: 'Table' };
        default:
            return assertUnreachable(tableType, 'Unknown table type');
    }
};

const partitionFilter = (partitionColumn: PartitionColumn | undefined) => {
    if (partitionColumn) {
        const hint =
            partitionColumn.partitionType === PartitionType.DATE
                ? `This table has a date partition on this field`
                : `This table has a range partition on this field`;

        const defaultValue =
            partitionColumn.partitionType === PartitionType.DATE
                ? `'${dayjs().format('YYYY-MM-DD')}'` // Default to today's date
                : `0`;

        return `\nWHERE ${partitionColumn.field} = ${defaultValue} -- ${hint}`;
    }
    return '';
};

const depthStyle = (depth: number) =>
    ({ '--tree-depth': depth }) as React.CSSProperties;

const TableItem: FC<{
    identity: TableIdentity;
    depth: number;
    search: string;
    isActive: boolean;
    partitionColumn: PartitionColumn | undefined;
    tableType: WarehouseTableType | undefined;
    onSelect: (
        identity: TableIdentity,
        partitionColumn: PartitionColumn | undefined,
    ) => void;
}> = memo(
    ({
        identity,
        depth,
        search,
        isActive,
        partitionColumn,
        tableType,
        onSelect,
    }) => {
        const { ref: hoverRef, hovered } = useHover();
        const typeDisplay = getTableTypeDisplay(tableType);
        const { ref: truncatedRef, isTruncated } =
            useIsTruncated<HTMLDivElement>();
        const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
        const quotedTable = qualifiedTableName(identity, quoteChar);
        return (
            <Box ref={hoverRef} pos="relative">
                <UnstyledButton
                    ff="inherit"
                    onClick={() => onSelect(identity, partitionColumn)}
                    w="100%"
                    fz="sm"
                    style={depthStyle(depth)}
                    data-active={isActive || undefined}
                    className={styles.tableButton}
                >
                    <Group gap="xs" wrap="nowrap">
                        <Tooltip label={typeDisplay.label} openDelay={400}>
                            <MantineIcon
                                icon={typeDisplay.icon}
                                size="sm"
                                className={styles.rowIcon}
                                aria-label={typeDisplay.label}
                            />
                        </Tooltip>
                        <Tooltip
                            label={identity.table}
                            disabled={!isTruncated}
                            maw={300}
                        >
                            {search ? (
                                <Text ref={truncatedRef} truncate fz="sm">
                                    <Highlight
                                        component="span"
                                        highlight={search}
                                        inherit
                                    >
                                        {identity.table}
                                    </Highlight>
                                </Text>
                            ) : (
                                <Text ref={truncatedRef} fz="sm" truncate>
                                    {identity.table}
                                </Text>
                            )}
                        </Tooltip>
                    </Group>
                </UnstyledButton>

                <Box
                    className={styles.copyButton}
                    display={hovered ? 'block' : 'none'}
                >
                    <CopyActionIcon
                        value={quotedTable}
                        copiedLabel="Copied to clipboard"
                        tooltipPosition="right"
                        size="xs"
                        bg="body"
                    />
                </Box>
            </Box>
        );
    },
);

const GroupItem: FC<{
    id: string;
    label: string;
    icon: Icon;
    depth: number;
    isExpanded: boolean;
    count: number | null;
    search: string;
    strong: boolean;
    badge?: string;
    onToggle: (rowId: string, isExpanded: boolean) => void;
}> = memo(
    ({
        id,
        label,
        icon,
        depth,
        isExpanded,
        count,
        search,
        strong,
        badge,
        onToggle,
    }) => (
        <UnstyledButton
            onClick={() => onToggle(id, isExpanded)}
            className={styles.groupButton}
            style={depthStyle(depth)}
            ff="inherit"
        >
            <Group wrap="nowrap" gap="xs">
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronRight}
                    size="sm"
                    className={styles.chevron}
                />
                <MantineIcon icon={icon} size="sm" className={styles.rowIcon} />
                <Text fz="sm" fw={strong ? 600 : 500} truncate>
                    {search ? (
                        <Highlight component="span" highlight={search} inherit>
                            {label}
                        </Highlight>
                    ) : (
                        label
                    )}
                </Text>
                {badge && (
                    <Badge size="xs" variant="light" color="blue">
                        {badge}
                    </Badge>
                )}
                {count !== null && (
                    <Text fz="xs" c="dimmed" ml="auto" pr="xs">
                        {count}
                    </Text>
                )}
            </Group>
        </UnstyledButton>
    ),
);

const LoadingItem: FC<{ depth: number }> = ({ depth }) => (
    <Group
        gap="xs"
        wrap="nowrap"
        className={styles.messageRow}
        style={depthStyle(depth)}
    >
        <Loader size="xs" />
        <Text fz="xs" c="dimmed">
            Loading tables...
        </Text>
    </Group>
);

const CANNOT_BROWSE_MESSAGE = 'You cannot browse this connection';

const ErrorItem: FC<{
    depth: number;
    message: string;
    forbidden?: boolean;
    onRetry: () => void;
}> = ({ depth, message, forbidden = false, onRetry }) => (
    <Group
        gap="xs"
        wrap="nowrap"
        className={styles.messageRow}
        style={depthStyle(depth)}
    >
        <MantineIcon
            icon={forbidden ? IconLock : IconAlertTriangle}
            size="sm"
            color={forbidden ? 'gray' : 'red'}
        />
        {forbidden ? (
            <Text fz="xs" c="dimmed" truncate>
                {CANNOT_BROWSE_MESSAGE}
            </Text>
        ) : (
            <>
                <Tooltip label={message} maw={300} multiline>
                    <Text fz="xs" c="dimmed" truncate>
                        Could not load tables
                    </Text>
                </Tooltip>
                <Button variant="subtle" size="compact-xs" onClick={onRetry}>
                    Retry
                </Button>
            </>
        )}
    </Group>
);

const TruncationItem: FC<{ depth: number; limit: number }> = ({
    depth,
    limit,
}) => (
    <Box className={styles.messageRow} style={depthStyle(depth)}>
        <Text fz="xs" c="dimmed">
            {`Showing the first ${limit} databases. Name others in the connection settings.`}
        </Text>
    </Box>
);

// Manual expand/collapse choices, keyed by the search and type filter they were made under
type RowExpansion = {
    key: string;
    overrides: Record<string, boolean>;
};
const NO_OVERRIDES: Record<string, boolean> = {};

const TYPE_FILTER_OPTIONS: {
    value: 'all' | TableTypeFilter;
    icon: Icon;
    label: string;
}[] = [
    { value: 'all', icon: IconList, label: 'Show all' },
    { value: 'tables', icon: IconTable, label: 'Only tables' },
    { value: 'views', icon: IconEye, label: 'Only views' },
];

const TableTypeToggle: FC<{
    value: TableTypeFilter | null;
    onChange: (value: TableTypeFilter | null) => void;
}> = ({ value, onChange }) => (
    <SegmentedControl
        size="xs"
        withItemsBorders={false}
        value={value ?? 'all'}
        aria-label="Filter tables by type"
        classNames={{
            root: styles.typeFilter,
            label: styles.typeFilterLabel,
        }}
        onChange={(next) =>
            onChange(next === 'all' ? null : (next as TableTypeFilter))
        }
        data={TYPE_FILTER_OPTIONS.map((option) => ({
            value: option.value,
            label: (
                <Tooltip label={option.label} openDelay={400}>
                    <Box component="span" lh={0} display="flex">
                        <MantineIcon
                            icon={option.icon}
                            size={14}
                            aria-label={option.label}
                        />
                    </Box>
                </Tooltip>
            ),
        }))}
    />
);

const VirtualRow: FC<{
    row: WarehouseTreeRow;
    search: string;
    showCounts: boolean;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    activeDatabase: string | undefined;
    onToggle: (rowId: string, isExpanded: boolean) => void;
    onRetry: (row: { connectionId: string; listedDatabase: string }) => void;
    onSelect: (
        identity: TableIdentity,
        partitionColumn: PartitionColumn | undefined,
    ) => void;
}> = ({
    row,
    search,
    showCounts,
    activeTable,
    activeSchema,
    activeDatabase,
    onToggle,
    onRetry,
    onSelect,
}) => {
    switch (row.type) {
        case 'connection':
            return (
                <GroupItem
                    id={row.id}
                    label={row.connectionName}
                    icon={IconPlugConnected}
                    depth={row.depth}
                    isExpanded={row.isExpanded}
                    count={showCounts ? row.childCount : null}
                    search={search}
                    strong
                    badge={row.isActive ? 'Active' : undefined}
                    onToggle={onToggle}
                />
            );
        case 'database':
            return (
                <GroupItem
                    id={row.id}
                    label={row.database}
                    icon={IconDatabase}
                    depth={row.depth}
                    isExpanded={row.isExpanded}
                    count={showCounts ? row.childCount : null}
                    search={search}
                    strong
                    onToggle={onToggle}
                />
            );
        case 'schema':
            return (
                <GroupItem
                    id={row.id}
                    label={row.schema}
                    icon={IconFolder}
                    depth={row.depth}
                    isExpanded={row.isExpanded}
                    count={showCounts ? row.childCount : null}
                    search={search}
                    strong={false}
                    onToggle={onToggle}
                />
            );
        case 'table':
            return (
                <TableItem
                    identity={row.identity}
                    depth={row.depth}
                    search={search}
                    isActive={
                        row.identity.table === activeTable &&
                        row.identity.schema === activeSchema &&
                        row.identity.database === activeDatabase
                    }
                    partitionColumn={row.partitionColumn}
                    tableType={row.tableType}
                    onSelect={onSelect}
                />
            );
        case 'loading':
            return <LoadingItem depth={row.depth} />;
        case 'error':
            return (
                <ErrorItem
                    depth={row.depth}
                    message={row.message}
                    forbidden={row.forbidden}
                    onRetry={() =>
                        onRetry({
                            connectionId: row.connectionId,
                            listedDatabase: row.listedDatabase,
                        })
                    }
                />
            );
        case 'truncation':
            return <TruncationItem depth={row.depth} limit={row.limit} />;
        default:
            return assertUnreachable(row, 'Unknown warehouse tree row');
    }
};

const rowHeight = (row: WarehouseTreeRow | undefined): number => {
    switch (row?.type) {
        case 'table':
            return TABLE_ROW_HEIGHT;
        case 'loading':
        case 'error':
        case 'truncation':
            return MESSAGE_ROW_HEIGHT;
        default:
            return GROUP_ROW_HEIGHT;
    }
};

const VirtualTreeList: FC<{
    rows: WarehouseTreeRow[];
    viewportRef: React.RefObject<HTMLDivElement | null>;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
    search: string;
    showCounts: boolean;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    activeDatabase: string | undefined;
    onToggle: (rowId: string, isExpanded: boolean) => void;
    onRetry: (unit: TableUnitKey) => void;
    onSelect: (
        identity: TableIdentity,
        partitionColumn: PartitionColumn | undefined,
    ) => void;
}> = ({
    rows,
    viewportRef,
    virtualizer,
    search,
    showCounts,
    activeTable,
    activeSchema,
    activeDatabase,
    onToggle,
    onRetry,
    onSelect,
}) => (
    <ScrollArea
        viewportRef={viewportRef}
        offsetScrollbars
        scrollbars="y"
        classNames={{ content: scrollAreaClasses.verticalContent }}
        flex={1}
        type="auto"
    >
        {rows.length > 0 && (
            <Box
                style={{
                    height: virtualizer.getTotalSize(),
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    return (
                        <Box
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <VirtualRow
                                row={row}
                                search={search}
                                showCounts={showCounts}
                                activeTable={activeTable}
                                activeSchema={activeSchema}
                                activeDatabase={activeDatabase}
                                onToggle={onToggle}
                                onRetry={({ connectionId, listedDatabase }) =>
                                    onRetry({
                                        connectionId,
                                        database: listedDatabase,
                                    })
                                }
                                onSelect={onSelect}
                            />
                        </Box>
                    );
                })}
            </Box>
        )}
    </ScrollArea>
);

/** The sidebar's one-line states: waiting, loading, failed, or nothing found. */
const TablesStatus: FC<{
    needsConnectionChoice: boolean;
    isLoading: boolean;
    errorMessage: string | undefined;
    isForbidden: boolean;
    isEmpty: boolean;
}> = ({
    needsConnectionChoice,
    isLoading,
    errorMessage,
    isForbidden,
    isEmpty,
}) => {
    if (needsConnectionChoice) {
        return (
            <Center p="sm">
                <Text c="dimmed" fz="sm" ta="center">
                    Choose a connection to start writing SQL
                </Text>
            </Center>
        );
    }
    if (isLoading) {
        return (
            <Center p="sm">
                <Loader size="sm" />
            </Center>
        );
    }
    if (isForbidden) {
        return (
            <Center p="sm">
                <Text c="dimmed" fz="sm" ta="center">
                    {CANNOT_BROWSE_MESSAGE}
                </Text>
            </Center>
        );
    }
    if (errorMessage) {
        return (
            <Center p="sm">
                <Text c="red" fz="sm" ta="center">
                    {errorMessage}
                </Text>
            </Center>
        );
    }
    if (isEmpty) {
        return (
            <Center p="sm">
                <Text c="dimmed" fz="sm">
                    No results found
                </Text>
            </Center>
        );
    }
    return null;
};

export const Tables: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );
    const activeDatabase = useAppSelector(
        (state) => state.sqlRunner.activeDatabase,
    );

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 500);
    const effectiveSearch =
        debouncedSearch.trim().length >= MIN_SEARCH_LENGTH
            ? debouncedSearch
            : '';

    const [typeFilter, setTypeFilter] = useState<TableTypeFilter | null>(null);
    const filterKey = `${typeFilter ?? 'all'}:${effectiveSearch}`;

    const [expansion, setExpansion] = useState<RowExpansion>({
        key: filterKey,
        overrides: {},
    });
    const overrides = useMemo(
        () =>
            expansion.key === filterKey ? expansion.overrides : NO_OVERRIDES,
        [expansion, filterKey],
    );
    const {
        activeConnectionUuid,
        activeConnection,
        connectionNameFor,
        switchConnection,
        hasSeveralConnections,
        isConnectionSettled,
    } = useActiveConnection();

    const isRowExpandedByOverride = useCallback(
        (rowId: string) => overrides[rowId],
        [overrides],
    );

    const {
        connections,
        getUnitState,
        loadedCatalogs,
        retry,
        isRowExpanded,
        onConnectionExpanded,
        isLoading,
        listingError,
        listingForbidden,
        isSuccess,
    } = useWarehouseTree({
        projectUuid,
        warehouseConnectionType,
        isRowExpandedByOverride,
    });

    const reportMissingConnection = useReportMissingConnection();
    useEffect(() => {
        reportMissingConnection(listingError);
    }, [listingError, reportMissingConnection]);

    const toggleRow = useCallback(
        (rowId: string, isExpanded: boolean) => {
            setExpansion((previous) => ({
                key: filterKey,
                overrides: {
                    ...(previous.key === filterKey ? previous.overrides : {}),
                    [rowId]: !isExpanded,
                },
            }));
            // Opening a connection is what asks for its databases
            if (rowId.startsWith('connection:') && !isExpanded) {
                onConnectionExpanded(rowId.slice('connection:'.length));
            }
        },
        [filterKey, onConnectionExpanded],
    );

    const dispatch = useAppDispatch();
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const [pendingSwitch, setPendingSwitch] =
        useState<PendingConnectionSwitch | null>(null);

    const openTable = useCallback(
        (
            identity: TableIdentity,
            partitionColumn: PartitionColumn | undefined,
        ) => {
            dispatch(
                setSql(
                    `SELECT * FROM ${qualifiedTableName(
                        identity,
                        quoteChar,
                    )} ${partitionFilter(partitionColumn)}`,
                ),
            );
            dispatch(
                toggleActiveTable({
                    table: identity.table,
                    schema: identity.schema,
                    database: identity.database,
                }),
            );
        },
        [dispatch, quoteChar],
    );

    const handleTableSelect = useCallback(
        (
            identity: TableIdentity,
            partitionColumn: PartitionColumn | undefined,
        ) => {
            const outcome = tableClickOutcome({
                sql,
                activeConnectionUuid,
                tableConnectionUuid: identity.connectionId,
            });

            if (outcome === 'insert') {
                openTable(identity, partitionColumn);
                return;
            }

            if (outcome === 'select-only') {
                dispatch(
                    toggleActiveTable({
                        table: identity.table,
                        schema: identity.schema,
                        database: identity.database,
                    }),
                );
                return;
            }

            if (outcome === 'switch-and-insert') {
                switchConnection(identity.connectionId);
                openTable(identity, partitionColumn);
                return;
            }

            setPendingSwitch({
                connectionUuid: identity.connectionId,
                connectionName:
                    connectionNameFor(identity.connectionId) ?? 'connection',
                qualifiedName: qualifiedTableName(identity, quoteChar),
                identity,
                partitionColumn,
            });
        },
        [
            activeConnectionUuid,
            sql,
            quoteChar,
            openTable,
            switchConnection,
            connectionNameFor,
            dispatch,
        ],
    );

    const confirmPendingSwitch = useCallback(() => {
        if (!pendingSwitch) return;
        switchConnection(pendingSwitch.connectionUuid);
        openTable(pendingSwitch.identity, pendingSwitch.partitionColumn);
        setPendingSwitch(null);
    }, [pendingSwitch, switchConnection, openTable]);

    const hasViews = useMemo(
        () => loadedCatalogs.some(catalogHasViews),
        [loadedCatalogs],
    );

    const rows = useMemo(
        () =>
            buildWarehouseTreeRows({
                connections,
                getUnitState,
                isExpanded: isRowExpanded,
                search: effectiveSearch,
                typeFilter,
            }),
        [connections, getUnitState, isRowExpanded, effectiveSearch, typeFilter],
    );

    const viewportRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: (index) => rowHeight(rows[index]),
        getItemKey: (index) => rows[index]?.id ?? index,
        overscan: 10,
    });

    const showClear = search.length > 0;

    return (
        <>
            {pendingSwitch && (
                <ConnectionSwitchPrompt
                    pendingSwitch={pendingSwitch}
                    activeConnectionName={activeConnection?.name}
                    onConfirm={confirmPendingSwitch}
                    onCancel={() => setPendingSwitch(null)}
                />
            )}

            <Group gap="xs" wrap="nowrap">
                <Tooltip
                    opened={
                        search.length > 0 && search.length < MIN_SEARCH_LENGTH
                    }
                    label={`Enter at least ${MIN_SEARCH_LENGTH} characters to search`}
                >
                    <TextInput
                        className={styles.searchInput}
                        size="sm"
                        disabled={!isSuccess && !debouncedSearch}
                        classNames={{ section: styles.searchSection }}
                        leftSection={
                            isLoading ? (
                                <Loader size="xs" />
                            ) : (
                                <MantineIcon icon={IconSearch} />
                            )
                        }
                        rightSectionPointerEvents="all"
                        rightSection={
                            showClear ? (
                                <ActionIcon
                                    aria-label="Clear search"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    size="xs"
                                    onClick={() => setSearch('')}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder="Search tables"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </Tooltip>

                {hasViews ? (
                    <TableTypeToggle
                        value={typeFilter}
                        onChange={setTypeFilter}
                    />
                ) : null}
            </Group>

            <VirtualTreeList
                rows={rows}
                viewportRef={viewportRef}
                virtualizer={virtualizer}
                search={effectiveSearch}
                showCounts={typeFilter !== null}
                activeTable={activeTable}
                activeSchema={activeSchema}
                activeDatabase={activeDatabase}
                onToggle={toggleRow}
                onRetry={retry}
                onSelect={handleTableSelect}
            />

            <TablesStatus
                needsConnectionChoice={
                    hasSeveralConnections && !isConnectionSettled
                }
                isLoading={isLoading && isConnectionSettled}
                errorMessage={listingError?.error.message}
                isForbidden={listingForbidden && isConnectionSettled}
                isEmpty={isSuccess && isConnectionSettled && rows.length === 0}
            />
        </>
    );
};
