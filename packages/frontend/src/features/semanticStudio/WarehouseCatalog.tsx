import { assertUnreachable } from '@lightdash/common';
import { Box, Group, Highlight, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { Fragment, useMemo, useState, type FC } from 'react';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import sqlRunnerClasses from '../sqlRunner/components/Tables.module.css';
import { TablesToolbar } from '../sqlRunner/components/TablesToolbar';
import { useRecentTables } from '../sqlRunner/hooks/useRecentTables';
import { useGroupDevSchemas } from '../sqlRunner/hooks/useSidebarPreferences';
import { useTableFields } from '../sqlRunner/hooks/useTableFields';
import { useRefreshTables } from '../sqlRunner/hooks/useTables';
import {
    buildRecentRows,
    buildTableRows,
    catalogHasDevSchemas,
    catalogHasViews,
    DEV_SCHEMAS_GROUP_ID,
    filterTablesBySchema,
    MIN_TABLE_SEARCH_LENGTH,
    type TableRow,
    type TableTypeFilter,
} from '../sqlRunner/utils/tableRows';
import { getTableTypeDisplay } from '../sqlRunner/utils/tableTypeDisplay';
import { KindTypeIcon } from './KindTypeIcon';
import { useCatalogTables } from './useCatalogTables';
import classes from './WarehouseCatalog.module.css';

const TableColumns: FC<{
    projectUuid: string;
    schema: string;
    name: string;
}> = ({ projectUuid, schema, name }) => {
    const {
        data: columns,
        isLoading,
        error,
    } = useTableFields({
        projectUuid,
        tableName: name,
        schema,
        search: undefined,
    });
    if (isLoading || error) {
        return (
            <Text fz="xs" c="dimmed" className={classes.catalogColumns}>
                {error
                    ? `The columns could not be read: ${error.error.message}`
                    : 'Reading columns…'}
            </Text>
        );
    }
    return (
        <Box className={classes.catalogColumns}>
            {(columns ?? []).map((column) => (
                <Box key={column.name} className={classes.catalogColumn}>
                    <KindTypeIcon
                        fieldKind="dimension"
                        type={column.type}
                        name={column.name}
                    />
                    <Text fz="xs" ff="monospace" truncate title={column.name}>
                        {column.name}
                    </Text>
                    <Text fz="xs" c="dimmed" flex="none">
                        {column.type}
                    </Text>
                </Box>
            ))}
        </Box>
    );
};

const SEVERAL_SCHEMAS = 1;

/** The warehouse's page lists what nothing models yet, the way SQL Runner lists tables; a row opens on its columns and its name copies for the chat. */
export const WarehouseCatalog: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { mutate: refresh, isLoading: isRefreshing } = useRefreshTables({
        projectUuid,
    });
    const { recentTables, addRecentTable } = useRecentTables(projectUuid);
    const [groupDevSchemas, setGroupDevSchemas] = useGroupDevSchemas();
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<TableTypeFilter | null>(null);
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});
    const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
    const query = search.trim().length >= MIN_TABLE_SEARCH_LENGTH ? search : '';
    const isFiltering = query !== '' || typeFilter !== null;

    const {
        catalog,
        isLoading,
        unmodelled,
        modelledNames,
        modelledSchemas,
        hasSeveralDatabases,
    } = useCatalogTables(projectUuid);

    // Not virtualised like SQL Runner's list, since rows open to different heights; add it if a schema of thousands is slow
    const rows = useMemo((): TableRow[] => {
        const shown = isFiltering
            ? filterTablesBySchema(unmodelled, query, typeFilter)
            : unmodelled;
        return [
            ...(isFiltering ? [] : buildRecentRows(recentTables, unmodelled)),
            ...buildTableRows(
                shown,
                (id, { schema }) =>
                    overrides[id] ??
                    (isFiltering ||
                        shown.length <= SEVERAL_SCHEMAS ||
                        modelledSchemas.has(String(schema))),
                hasSeveralDatabases,
                groupDevSchemas
                    ? {
                          isGroupExpanded:
                              overrides[DEV_SCHEMAS_GROUP_ID] ?? isFiltering,
                      }
                    : null,
            ),
        ];
    }, [
        unmodelled,
        isFiltering,
        query,
        typeFilter,
        recentTables,
        overrides,
        modelledSchemas,
        hasSeveralDatabases,
        groupDevSchemas,
    ]);
    const count = unmodelled.reduce(
        (sum, entry) => sum + Object.keys(entry.tables).length,
        0,
    );
    if (count === 0) return null;
    // A search for a table that already has a model would otherwise look like the table doesn't exist
    const modelledMatches = query
        ? modelledNames.filter((name) =>
              name.toLowerCase().includes(query.trim().toLowerCase()),
          ).length
        : 0;
    const toggle = (id: string, isExpanded: boolean) =>
        setOverrides({ ...overrides, [id]: !isExpanded });
    const tableRow = (
        row: Extract<TableRow, { type: 'table' | 'recent' }>,
        className: string,
        depth: number,
    ) => {
        const display = getTableTypeDisplay(row.tableType);
        const isOpen = openRows[row.id] ?? false;
        const reference = [
            ...(hasSeveralDatabases ? [row.database] : []),
            row.schema,
            row.table,
        ].join('.');
        return (
            <Fragment key={row.id}>
                <Box pos="relative" className={classes.catalogRow}>
                    <UnstyledButton
                        ff="inherit"
                        fz="sm"
                        className={className}
                        data-depth={depth}
                        data-active={isOpen || undefined}
                        aria-expanded={isOpen}
                        onClick={() => {
                            setOpenRows({ ...openRows, [row.id]: !isOpen });
                            if (!isOpen) addRecentTable(row);
                        }}
                    >
                        <MantineIcon
                            icon={display.icon}
                            size="sm"
                            className={sqlRunnerClasses.rowIcon}
                            aria-label={display.label}
                        />
                        <Text fz="sm" truncate>
                            {query ? (
                                <Highlight
                                    component="span"
                                    highlight={query}
                                    inherit
                                >
                                    {row.table}
                                </Highlight>
                            ) : (
                                row.table
                            )}
                        </Text>
                        {row.type === 'recent' ? (
                            <Text
                                fz="xs"
                                c="dimmed"
                                ml="auto"
                                flex="0 0 auto"
                                className={classes.catalogRecentSchema}
                            >
                                {row.schema}
                            </Text>
                        ) : null}
                    </UnstyledButton>
                    <Box
                        className={`${sqlRunnerClasses.copyButton} ${classes.catalogAction}`}
                    >
                        <CopyActionIcon
                            value={reference}
                            copyLabel={`Copy ${reference}`}
                            copiedLabel="Copied to clipboard"
                            tooltipPosition="left"
                            size="xs"
                            bg="body"
                        />
                    </Box>
                </Box>
                {isOpen ? (
                    <TableColumns
                        projectUuid={projectUuid}
                        schema={row.schema}
                        name={row.table}
                    />
                ) : null}
            </Fragment>
        );
    };
    return (
        <Box>
            <Text fz="sm" fw={500} mb={6}>
                Not modelled yet
                <Text span c="dimmed" inherit fw={400}>
                    {' '}
                    · {count}
                </Text>
            </Text>
            <Box>
                <Box className={classes.catalogToolbar}>
                    <TablesToolbar
                        search={search}
                        onSearchChange={setSearch}
                        isSearchDisabled={!catalog}
                        isLoading={isLoading || isRefreshing}
                        typeFilter={typeFilter}
                        onTypeFilterChange={setTypeFilter}
                        hasViews={catalogHasViews(unmodelled)}
                        groupDevSchemas={
                            catalogHasDevSchemas(unmodelled)
                                ? {
                                      value: groupDevSchemas,
                                      onChange: setGroupDevSchemas,
                                  }
                                : null
                        }
                        onRefresh={() => refresh()}
                        isRefreshDisabled={isLoading || isRefreshing}
                    />
                </Box>
                <Box>
                    {rows.length === 0 && modelledMatches === 0 ? (
                        <Text fz="sm" c="dimmed" p="sm" ta="center">
                            No results found
                        </Text>
                    ) : null}
                    {modelledMatches > 0 ? (
                        <Text fz="xs" c="dimmed" px={8} py={6}>
                            {modelledMatches === 1
                                ? '1 matching table already has a model.'
                                : `${modelledMatches} matching tables already have a model.`}
                        </Text>
                    ) : null}
                    {rows.map((row) => {
                        switch (row.type) {
                            case 'section':
                                return (
                                    <Group
                                        key={row.id}
                                        className={sqlRunnerClasses.section}
                                    >
                                        <Text fz="xs" fw={500} c="inherit">
                                            {row.label}
                                        </Text>
                                    </Group>
                                );
                            case 'recent':
                                return tableRow(
                                    row,
                                    sqlRunnerClasses.recentButton,
                                    0,
                                );
                            case 'table':
                                return tableRow(
                                    row,
                                    sqlRunnerClasses.tableButton,
                                    row.depth,
                                );
                            case 'group':
                            case 'schema':
                                return (
                                    <UnstyledButton
                                        key={row.id}
                                        ff="inherit"
                                        className={
                                            row.type === 'group'
                                                ? sqlRunnerClasses.groupButton
                                                : sqlRunnerClasses.schemaButton
                                        }
                                        data-depth={
                                            row.type === 'schema'
                                                ? row.depth
                                                : 0
                                        }
                                        aria-expanded={row.isExpanded}
                                        onClick={() =>
                                            toggle(row.id, row.isExpanded)
                                        }
                                    >
                                        <MantineIcon
                                            icon={
                                                row.isExpanded
                                                    ? IconChevronDown
                                                    : IconChevronRight
                                            }
                                            size="sm"
                                            className={sqlRunnerClasses.rowIcon}
                                        />
                                        <Text fz="sm" fw={500} truncate>
                                            {row.type === 'group'
                                                ? row.label
                                                : [
                                                      row.databaseLabel,
                                                      row.schema,
                                                  ]
                                                      .filter(Boolean)
                                                      .join('.')}
                                        </Text>
                                        <Text
                                            fz="xs"
                                            c="dimmed"
                                            ml="auto"
                                            flex="0 0 auto"
                                        >
                                            {row.type === 'group'
                                                ? row.schemaCount
                                                : row.tableCount}
                                        </Text>
                                    </UnstyledButton>
                                );
                            default:
                                return assertUnreachable(
                                    row,
                                    'Unknown table row',
                                );
                        }
                    })}
                </Box>
            </Box>
        </Box>
    );
};
