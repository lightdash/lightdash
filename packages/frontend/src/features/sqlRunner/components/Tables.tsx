import {
    assertUnreachable,
    PartitionType,
    type PartitionColumn,
    type WarehouseTableType,
} from '@lightdash/common';
import {
    Box,
    Center,
    Group,
    Highlight,
    ScrollArea,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import isEmpty from 'lodash/isEmpty';
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useRecentTables } from '../hooks/useRecentTables';
import { useGroupDevSchemas } from '../hooks/useSidebarPreferences';
import { useTables } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql, toggleActiveTable } from '../store/sqlRunnerSlice';
import {
    buildRecentRows,
    buildTableRows,
    catalogHasDevSchemas,
    catalogHasViews,
    DEV_SCHEMAS_GROUP_ID,
    filterTablesBySchema,
    isActiveSchema,
    isDevSchema,
    MIN_TABLE_SEARCH_LENGTH,
    type SchemaTables,
    type TableRef,
    type TableRow,
    type TableTypeFilter,
} from '../utils/tableRows';
import { getTableTypeDisplay } from '../utils/tableTypeDisplay';
import styles from './Tables.module.css';
import { TablesToolbar } from './TablesToolbar';

const ROW_HEIGHT = 28;

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

type SelectTable = (
    ref: TableRef,
    partitionColumn: PartitionColumn | undefined,
) => void;

const TableName: FC<{ table: string; search: string }> = ({
    table,
    search,
}) => {
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Tooltip label={table} disabled={!isTruncated} maw={300}>
            <Text ref={truncatedRef} fz="sm" truncate>
                {search ? (
                    <Highlight component="span" highlight={search} inherit>
                        {table}
                    </Highlight>
                ) : (
                    table
                )}
            </Text>
        </Tooltip>
    );
};

const TableItem: FC<{
    tableRef: TableRef;
    depth: number;
    search: string;
    isActive: boolean;
    partitionColumn: PartitionColumn | undefined;
    tableType: WarehouseTableType | undefined;
    quotedTable: string;
    onSelect: SelectTable;
}> = memo(
    ({
        tableRef,
        depth,
        search,
        isActive,
        partitionColumn,
        tableType,
        quotedTable,
        onSelect,
    }) => {
        const { ref: hoverRef, hovered } = useHover();
        const typeDisplay = getTableTypeDisplay(tableType);
        return (
            <Box ref={hoverRef} pos="relative">
                <UnstyledButton
                    ff="inherit"
                    onClick={() => onSelect(tableRef, partitionColumn)}
                    fz="sm"
                    data-active={isActive || undefined}
                    data-depth={depth}
                    className={styles.tableButton}
                >
                    <Tooltip label={typeDisplay.label} openDelay={400}>
                        <MantineIcon
                            icon={typeDisplay.icon}
                            size="sm"
                            className={styles.rowIcon}
                            aria-label={typeDisplay.label}
                        />
                    </Tooltip>
                    <TableName table={tableRef.table} search={search} />
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

const RecentItem: FC<{
    tableRef: TableRef;
    partitionColumn: PartitionColumn | undefined;
    tableType: WarehouseTableType | undefined;
    onSelect: SelectTable;
}> = memo(({ tableRef, partitionColumn, tableType, onSelect }) => {
    const typeDisplay = getTableTypeDisplay(tableType);
    return (
        <UnstyledButton
            ff="inherit"
            onClick={() => onSelect(tableRef, partitionColumn)}
            fz="sm"
            className={styles.recentButton}
        >
            <MantineIcon
                icon={typeDisplay.icon}
                size="sm"
                className={styles.rowIcon}
                aria-label={typeDisplay.label}
            />
            <TableName table={tableRef.table} search="" />
            <Text fz="xs" c="ldGray.5" ml="auto" flex="0 0 auto">
                {tableRef.schema}
            </Text>
        </UnstyledButton>
    );
});

const SchemaItem: FC<{
    id: string;
    schema: string;
    databaseLabel: string | null;
    depth: number;
    search: string;
    isExpanded: boolean;
    count: number;
    onToggle: (rowId: string, isExpanded: boolean) => void;
}> = memo(
    ({
        id,
        schema,
        databaseLabel,
        depth,
        search,
        isExpanded,
        count,
        onToggle,
    }) => {
        const { ref: databaseRef, isTruncated: isDatabaseTruncated } =
            useIsTruncated<HTMLParagraphElement>();
        const { ref: schemaRef, isTruncated: isSchemaTruncated } =
            useIsTruncated<HTMLParagraphElement>();
        return (
            <UnstyledButton
                onClick={() => onToggle(id, isExpanded)}
                className={styles.schemaButton}
                data-depth={depth}
                ff="inherit"
            >
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronRight}
                    size="sm"
                    className={styles.rowIcon}
                />
                <Tooltip
                    label={
                        databaseLabel === null
                            ? schema
                            : `${databaseLabel}.${schema}`
                    }
                    disabled={!isDatabaseTruncated && !isSchemaTruncated}
                    multiline
                    maw={300}
                    classNames={{ tooltip: styles.labelTooltip }}
                >
                    <Box className={styles.schemaLabel}>
                        {databaseLabel !== null && (
                            <>
                                <Text
                                    ref={databaseRef}
                                    fz="sm"
                                    c="dimmed"
                                    truncate
                                    className={styles.databaseLabel}
                                >
                                    {databaseLabel}
                                </Text>
                                <Text fz="sm" c="dimmed" flex="0 0 auto">
                                    .
                                </Text>
                            </>
                        )}
                        <Text
                            ref={schemaRef}
                            fz="sm"
                            fw={500}
                            truncate
                            className={styles.schemaName}
                        >
                            {search ? (
                                <Highlight
                                    component="span"
                                    highlight={search}
                                    inherit
                                >
                                    {schema}
                                </Highlight>
                            ) : (
                                schema
                            )}
                        </Text>
                    </Box>
                </Tooltip>
                <Text fz="xs" c="ldGray.5" ml="auto" flex="0 0 auto">
                    {count}
                </Text>
            </UnstyledButton>
        );
    },
);

const GroupItem: FC<{
    id: string;
    label: string;
    isExpanded: boolean;
    count: number;
    onToggle: (rowId: string, isExpanded: boolean) => void;
}> = memo(({ id, label, isExpanded, count, onToggle }) => (
    <UnstyledButton
        onClick={() => onToggle(id, isExpanded)}
        className={styles.groupButton}
        ff="inherit"
    >
        <MantineIcon
            icon={isExpanded ? IconChevronDown : IconChevronRight}
            size="sm"
            className={styles.rowIcon}
        />
        <Text fz="sm" fw={500} truncate>
            {label}
        </Text>
        <Text fz="xs" c="ldGray.5" ml="auto" flex="0 0 auto">
            {count}
        </Text>
    </UnstyledButton>
));

const SectionItem: FC<{ label: string }> = ({ label }) => (
    <Group className={styles.section}>
        <Text fz="xs" fw={500} c="inherit">
            {label}
        </Text>
    </Group>
);

// Manual expand/collapse choices, keyed by the search and type filter they were made under
type Expansion = {
    key: string;
    overrides: Record<string, boolean>;
};
const NO_OVERRIDES: Record<string, boolean> = {};

const VirtualRow: FC<{
    row: TableRow;
    search: string;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    activeDatabase: string | undefined;
    quoteChar: string;
    onToggle: (rowId: string, isExpanded: boolean) => void;
    onSelect: SelectTable;
}> = ({
    row,
    search,
    activeTable,
    activeSchema,
    activeDatabase,
    quoteChar,
    onToggle,
    onSelect,
}) => {
    switch (row.type) {
        case 'section':
            return <SectionItem label={row.label} />;
        case 'recent':
            return (
                <RecentItem
                    tableRef={row}
                    partitionColumn={row.partitionColumn}
                    tableType={row.tableType}
                    onSelect={onSelect}
                />
            );
        case 'group':
            return (
                <GroupItem
                    id={row.id}
                    label={row.label}
                    isExpanded={row.isExpanded}
                    count={row.schemaCount}
                    onToggle={onToggle}
                />
            );
        case 'schema':
            return (
                <SchemaItem
                    id={row.id}
                    schema={row.schema}
                    databaseLabel={row.databaseLabel}
                    depth={row.depth}
                    search={search}
                    isExpanded={row.isExpanded}
                    count={row.tableCount}
                    onToggle={onToggle}
                />
            );
        case 'table':
            return (
                <TableItem
                    tableRef={row}
                    depth={row.depth}
                    search={search}
                    isActive={
                        row.table === activeTable &&
                        isActiveSchema(row, { activeDatabase, activeSchema })
                    }
                    partitionColumn={row.partitionColumn}
                    tableType={row.tableType}
                    quotedTable={quoteTable(row, quoteChar)}
                    onSelect={onSelect}
                />
            );
        default:
            return assertUnreachable(row, 'Unknown table row');
    }
};

const quoteParts = (parts: string[], quoteChar: string): string =>
    parts
        .filter((part) => part !== '')
        .map((part) => `${quoteChar}${part}${quoteChar}`)
        .join('.');

const quoteTable = ({ database, schema, table }: TableRef, quoteChar: string) =>
    quoteParts([database, schema, table], quoteChar);

// schema.table is enough unless the catalog spans several databases
const quoteTableForQuery = (
    { database, schema, table }: TableRef,
    quoteChar: string,
    hasSeveralDatabases: boolean,
): string =>
    quoteParts(
        hasSeveralDatabases ? [database, schema, table] : [schema, table],
        quoteChar,
    );

export const Tables: FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );
    const activeDatabase = useAppSelector(
        (state) => state.sqlRunner.activeDatabase,
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 500);
    const effectiveSearch =
        debouncedSearch.trim().length >= MIN_TABLE_SEARCH_LENGTH
            ? debouncedSearch
            : '';

    const [typeFilter, setTypeFilter] = useState<TableTypeFilter | null>(null);
    const [groupDevSchemas, setGroupDevSchemas] = useGroupDevSchemas();
    const isFiltering = effectiveSearch !== '' || typeFilter !== null;
    const filterKey = `${typeFilter ?? 'all'}:${effectiveSearch}`;

    const [expansion, setExpansion] = useState<Expansion>({
        key: filterKey,
        overrides: {},
    });
    const overrides = useMemo(
        () =>
            expansion.key === filterKey ? expansion.overrides : NO_OVERRIDES,
        [expansion, filterKey],
    );
    const toggleRow = useCallback(
        (rowId: string, isExpanded: boolean) => {
            setExpansion((previous) => ({
                key: filterKey,
                overrides: {
                    ...(previous.key === filterKey ? previous.overrides : {}),
                    [rowId]: !isExpanded,
                },
            }));
        },
        [filterKey],
    );

    const { data, isLoading, isSuccess } = useTables({ projectUuid });
    const { recentTables, addRecentTable } = useRecentTables(projectUuid);
    const selectTable = useCallback<SelectTable>(
        (ref, partitionColumn) => {
            if (!sql || sql.match(/SELECT \* FROM (.+)/)) {
                const hasSeveralDatabases = data
                    ? Object.keys(data).length > 1
                    : false;
                dispatch(
                    setSql(
                        `SELECT * FROM ${quoteTableForQuery(
                            ref,
                            quoteChar,
                            hasSeveralDatabases,
                        )} ${partitionFilter(partitionColumn)}`,
                    ),
                );
            }
            dispatch(toggleActiveTable(ref));
            addRecentTable(ref);
        },
        [dispatch, sql, quoteChar, addRecentTable, data],
    );

    const catalog = useMemo<
        | { hasSeveralDatabases: boolean; tablesBySchema: SchemaTables[] }
        | undefined
    >(() => {
        if (!data || isEmpty(data)) return undefined;
        const tablesBySchema = Object.entries(data).flatMap(
            ([database, schemas]) =>
                Object.entries(schemas).map(([schema, tables]) => ({
                    database,
                    schema,
                    tables,
                })),
        );
        return {
            hasSeveralDatabases:
                new Set(tablesBySchema.map(({ database }) => database)).size >
                1,
            tablesBySchema,
        };
    }, [data]);

    const hasViews = useMemo(
        () => (catalog ? catalogHasViews(catalog.tablesBySchema) : false),
        [catalog],
    );
    const hasDevSchemas = useMemo(
        () => (catalog ? catalogHasDevSchemas(catalog.tablesBySchema) : false),
        [catalog],
    );

    const rows = useMemo<TableRow[]>(() => {
        if (!catalog) return [];
        const tablesBySchema = isFiltering
            ? filterTablesBySchema(
                  catalog.tablesBySchema,
                  effectiveSearch,
                  typeFilter,
              )
            : catalog.tablesBySchema;
        // Filtering expands every matching schema; otherwise only the active one
        const treeRows = buildTableRows(
            tablesBySchema,
            (schemaRowId, { database, schema }) =>
                overrides[schemaRowId] ??
                (isFiltering ||
                    isActiveSchema(
                        { database, schema: String(schema) },
                        { activeDatabase, activeSchema },
                    )),
            catalog.hasSeveralDatabases,
            groupDevSchemas
                ? {
                      isGroupExpanded:
                          overrides[DEV_SCHEMAS_GROUP_ID] ??
                          (isFiltering || isDevSchema(activeSchema ?? '')),
                  }
                : null,
        );
        const recentRows = isFiltering
            ? []
            : buildRecentRows(recentTables, catalog.tablesBySchema);
        return [...recentRows, ...treeRows];
    }, [
        catalog,
        isFiltering,
        effectiveSearch,
        typeFilter,
        overrides,
        activeSchema,
        activeDatabase,
        groupDevSchemas,
        recentTables,
    ]);

    const viewportRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => ROW_HEIGHT,
        getItemKey: (index) => rows[index]?.id ?? index,
        overscan: 10,
    });

    const [isScrolled, setIsScrolled] = useState(false);

    return (
        <>
            <TablesToolbar
                search={search}
                onSearchChange={setSearch}
                isSearchDisabled={!data && !debouncedSearch}
                isLoading={isLoading}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                hasViews={hasViews}
                groupDevSchemas={
                    hasDevSchemas
                        ? {
                              value: groupDevSchemas,
                              onChange: setGroupDevSchemas,
                          }
                        : null
                }
                onRefresh={onRefresh}
                isRefreshDisabled={isLoading}
            />

            <Box className={styles.list}>
                <Box
                    className={styles.fade}
                    data-visible={isScrolled || undefined}
                />
                <ScrollArea
                    viewportRef={viewportRef}
                    offsetScrollbars
                    scrollbars="y"
                    classNames={{ content: scrollAreaClasses.verticalContent }}
                    flex={1}
                    type="auto"
                    onScrollPositionChange={({ y }) => setIsScrolled(y > 0)}
                >
                    {catalog && (
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
                                            search={effectiveSearch}
                                            activeTable={activeTable}
                                            activeSchema={activeSchema}
                                            activeDatabase={activeDatabase}
                                            quoteChar={quoteChar}
                                            onToggle={toggleRow}
                                            onSelect={selectTable}
                                        />
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </ScrollArea>
            </Box>

            {isSuccess && rows.length === 0 && (
                <Center p="sm">
                    <Text c="dimmed" fz="sm">
                        No results found
                    </Text>
                </Center>
            )}
        </>
    );
};
