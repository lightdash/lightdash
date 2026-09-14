import {
    assertUnreachable,
    PartitionType,
    WarehouseTableType,
    type PartitionColumn,
} from '@lightdash/common';
import {
    TextInput,
    Box,
    Center,
    Group,
    Loader,
    Text,
    UnstyledButton,
    ActionIcon,
    Highlight,
    ScrollArea,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconCloudDataConnection,
    IconEye,
    IconEyeTable,
    IconSearch,
    IconTable,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import isEmpty from 'lodash/isEmpty';
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useTables } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql, toggleActiveTable } from '../store/sqlRunnerSlice';
import {
    buildTableRows,
    catalogHasViews,
    filterTablesBySchema,
    type SchemaTables,
    type TableRow,
    type TableTypeFilter,
} from '../utils/tableRows';
import styles from './Tables.module.css';

const SCHEMA_ROW_HEIGHT = 34;
const TABLE_ROW_HEIGHT = 30;
const MIN_SEARCH_LENGTH = 3;

interface TableItemProps {
    table: string;
    search: string;
    schema: string;
    database: string;
    isActive: boolean;
    partitionColumn: PartitionColumn | undefined;
    tableType: WarehouseTableType | undefined;
}

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

const TableItem: FC<TableItemProps> = memo(
    ({
        table,
        search,
        schema,
        database,
        isActive,
        partitionColumn,
        tableType,
    }) => {
        const { ref: hoverRef, hovered } = useHover();
        const typeDisplay = getTableTypeDisplay(tableType);
        const { ref: truncatedRef, isTruncated } =
            useIsTruncated<HTMLDivElement>();
        const dispatch = useAppDispatch();
        const sql = useAppSelector((state) => state.sqlRunner.sql);
        const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
        const quotedTable = database
            ? `${quoteChar}${database}${quoteChar}.${quoteChar}${schema}${quoteChar}.${quoteChar}${table}${quoteChar}`
            : `${quoteChar}${schema}${quoteChar}.${quoteChar}${table}${quoteChar}`;
        return (
            <Box ref={hoverRef} pos="relative">
                <UnstyledButton
                    ff="inherit"
                    onClick={() => {
                        if (!sql || sql.match(/SELECT \* FROM (.+)/)) {
                            dispatch(
                                setSql(
                                    `SELECT * FROM ${quotedTable} ${partitionFilter(
                                        partitionColumn,
                                    )}`,
                                ),
                            );
                        }

                        dispatch(toggleActiveTable({ table, schema }));
                    }}
                    w="100%"
                    fz="sm"
                    data-active={isActive || undefined}
                    className={styles.tableButton}
                >
                    <Group gap="xs" wrap="nowrap">
                        <Tooltip label={typeDisplay.label} openDelay={400}>
                            <MantineIcon
                                icon={typeDisplay.icon}
                                size="sm"
                                className={styles.tableIcon}
                                aria-label={typeDisplay.label}
                            />
                        </Tooltip>
                        <Tooltip
                            label={table}
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
                                        {table}
                                    </Highlight>
                                </Text>
                            ) : (
                                <Text ref={truncatedRef} fz="sm" truncate>
                                    {table}
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

const SchemaItem: FC<{
    schema: string;
    isExpanded: boolean;
    count: number | null;
    onToggle: (schema: string, isExpanded: boolean) => void;
}> = memo(({ schema, isExpanded, count, onToggle }) => (
    <UnstyledButton
        onClick={() => onToggle(schema, isExpanded)}
        className={styles.schemaButton}
        ff="inherit"
    >
        <Group wrap="nowrap" gap="xs">
            <MantineIcon
                icon={isExpanded ? IconChevronDown : IconChevronRight}
                size="sm"
                className={styles.chevron}
            />
            <Text fz="sm" fw={500} truncate>
                {schema}
            </Text>
            {count !== null && (
                <Text fz="xs" c="dimmed" ml="auto" pr="xs">
                    {count}
                </Text>
            )}
        </Group>
    </UnstyledButton>
));

// Manual expand/collapse choices, keyed by the search and type filter they were made under
type SchemaExpansion = {
    key: string;
    overrides: Record<string, boolean>;
};
const NO_OVERRIDES: Record<string, boolean> = {};

const TYPE_FILTER_TOGGLES: {
    filter: TableTypeFilter;
    icon: Icon;
    label: string;
}[] = [
    { filter: 'tables', icon: IconTable, label: 'Only tables' },
    { filter: 'views', icon: IconEye, label: 'Only views' },
];

// One toggle active at a time; clicking the active one shows everything again
const TableTypeToggle: FC<{
    value: TableTypeFilter | null;
    onChange: (value: TableTypeFilter | null) => void;
}> = ({ value, onChange }) => (
    <ActionIcon.Group>
        {TYPE_FILTER_TOGGLES.map(({ filter, icon, label }) => {
            const isActive = value === filter;
            return (
                <Tooltip
                    key={filter}
                    label={isActive ? 'Show all' : label}
                    openDelay={400}
                >
                    <ActionIcon
                        variant={isActive ? 'light' : 'default'}
                        size="input-sm"
                        aria-label={label}
                        aria-pressed={isActive}
                        onClick={() => onChange(isActive ? null : filter)}
                    >
                        <MantineIcon icon={icon} />
                    </ActionIcon>
                </Tooltip>
            );
        })}
    </ActionIcon.Group>
);

const VirtualRow: FC<{
    row: TableRow;
    search: string;
    showCounts: boolean;
    database: string;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    onToggleSchema: (schema: string, isExpanded: boolean) => void;
}> = ({
    row,
    search,
    showCounts,
    database,
    activeTable,
    activeSchema,
    onToggleSchema,
}) => {
    if (row.type === 'schema') {
        return (
            <SchemaItem
                schema={row.schema}
                isExpanded={row.isExpanded}
                count={showCounts ? row.tableCount : null}
                onToggle={onToggleSchema}
            />
        );
    }
    return (
        <TableItem
            table={row.table}
            schema={row.schema}
            database={database}
            search={search}
            isActive={row.table === activeTable && row.schema === activeSchema}
            partitionColumn={row.partitionColumn}
            tableType={row.tableType}
        />
    );
};

export const Tables: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 500);
    const effectiveSearch =
        debouncedSearch.trim().length >= MIN_SEARCH_LENGTH
            ? debouncedSearch
            : '';

    const [typeFilter, setTypeFilter] = useState<TableTypeFilter | null>(null);
    const isFiltering = effectiveSearch !== '' || typeFilter !== null;
    const filterKey = `${typeFilter ?? 'all'}:${effectiveSearch}`;

    const [expansion, setExpansion] = useState<SchemaExpansion>({
        key: filterKey,
        overrides: {},
    });
    const overrides = useMemo(
        () =>
            expansion.key === filterKey ? expansion.overrides : NO_OVERRIDES,
        [expansion, filterKey],
    );
    const toggleSchema = useCallback(
        (schema: string, isExpanded: boolean) => {
            setExpansion((previous) => ({
                key: filterKey,
                overrides: {
                    ...(previous.key === filterKey ? previous.overrides : {}),
                    [schema]: !isExpanded,
                },
            }));
        },
        [filterKey],
    );

    const { data, isLoading, isSuccess } = useTables({ projectUuid });

    const catalog = useMemo<
        { database: string; tablesBySchema: SchemaTables[] } | undefined
    >(() => {
        if (!data || isEmpty(data)) return undefined;
        const [database] = Object.keys(data);
        if (database === undefined) return undefined;
        const tablesBySchema = Object.entries(data).flatMap(([, schemas]) =>
            Object.entries(schemas).map(([schema, tables]) => ({
                schema,
                tables,
            })),
        );
        return { database, tablesBySchema };
    }, [data]);

    const hasViews = useMemo(
        () => (catalog ? catalogHasViews(catalog.tablesBySchema) : false),
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
        return buildTableRows(
            tablesBySchema,
            (schema) =>
                overrides[schema] ?? (isFiltering || schema === activeSchema),
        );
    }, [
        catalog,
        isFiltering,
        effectiveSearch,
        typeFilter,
        overrides,
        activeSchema,
    ]);

    const viewportRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: (index) =>
            rows[index]?.type === 'schema'
                ? SCHEMA_ROW_HEIGHT
                : TABLE_ROW_HEIGHT,
        getItemKey: (index) => rows[index]?.id ?? index,
        overscan: 10,
    });

    return (
        <>
            <Group gap="xs" wrap="nowrap">
                <Tooltip
                    opened={
                        search.length > 0 && search.length < MIN_SEARCH_LENGTH
                    }
                    label={`Enter at least ${MIN_SEARCH_LENGTH} characters to search`}
                >
                    <TextInput
                        size="sm"
                        flex={1}
                        disabled={!data && !debouncedSearch}
                        leftSection={
                            isLoading ? (
                                <Loader size="xs" />
                            ) : (
                                <MantineIcon icon={IconSearch} />
                            )
                        }
                        rightSectionPointerEvents="all"
                        rightSection={
                            search ? (
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
                {hasViews && (
                    <TableTypeToggle
                        value={typeFilter}
                        onChange={setTypeFilter}
                    />
                )}
            </Group>

            <ScrollArea
                viewportRef={viewportRef}
                offsetScrollbars
                scrollbars="y"
                classNames={{ content: scrollAreaClasses.verticalContent }}
                flex={1}
                type="auto"
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
                                        showCounts={typeFilter !== null}
                                        database={catalog.database}
                                        activeTable={activeTable}
                                        activeSchema={activeSchema}
                                        onToggleSchema={toggleSchema}
                                    />
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </ScrollArea>

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
