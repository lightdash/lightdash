import {
    assertUnreachable,
    WarehouseTableType,
    type PartitionColumn,
    type WarehouseListedDatabase,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import Fuse from 'fuse.js';

export type SchemaTablesMap = WarehouseTablesCatalog[string][string];

export type TableIdentity = {
    connectionId: string;
    database: string;
    schema: string;
    table: string;
};

export type TableUnitState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'loaded'; catalog: WarehouseTablesCatalog };

export type TreeConnection = {
    connectionId: string;
    connectionName: string;
    databases: WarehouseListedDatabase[];
    truncated: boolean;
    limit: number;
};

export type WarehouseTreeRow =
    | {
          type: 'connection';
          id: string;
          depth: number;
          connectionId: string;
          connectionName: string;
          isExpanded: boolean;
          childCount: number;
      }
    | {
          type: 'database';
          id: string;
          depth: number;
          connectionId: string;
          database: string;
          listedDatabase: string | null;
          isExpanded: boolean;
          childCount: number | null;
      }
    | {
          type: 'schema';
          id: string;
          depth: number;
          connectionId: string;
          database: string;
          schema: string;
          listedDatabase: string | null;
          isExpanded: boolean;
          childCount: number | null;
      }
    | {
          type: 'table';
          id: string;
          depth: number;
          identity: TableIdentity;
          partitionColumn: PartitionColumn | undefined;
          tableType: WarehouseTableType | undefined;
      }
    | { type: 'loading'; id: string; depth: number }
    | {
          type: 'error';
          id: string;
          depth: number;
          listedDatabase: string;
          message: string;
      }
    | { type: 'truncation'; id: string; depth: number; limit: number };

export type TableTypeFilter = 'tables' | 'views';

const connectionRowId = (connectionId: string) => `connection:${connectionId}`;

const databaseRowId = (connectionId: string, database: string) =>
    `database:${connectionId}/${database}`;

const schemaRowId = (connectionId: string, database: string, schema: string) =>
    `schema:${connectionId}/${database}/${schema}`;

const tableRowId = (identity: TableIdentity) =>
    `table:${identity.connectionId}/${identity.database}/${identity.schema}/${identity.table}`;

export const qualifiedTableName = (
    identity: TableIdentity,
    quoteChar: string,
): string => {
    const quoted = (part: string) => `${quoteChar}${part}${quoteChar}`;
    // ClickHouse has no database level, so its rows carry an empty database
    return identity.database
        ? `${quoted(identity.database)}.${quoted(identity.schema)}.${quoted(
              identity.table,
          )}`
        : `${quoted(identity.schema)}.${quoted(identity.table)}`;
};

type DatabaseGroup = {
    database: string;
    lazyEntry: WarehouseListedDatabase | undefined;
    schemaEntries: WarehouseListedDatabase[];
};

const groupByDatabase = (
    databases: WarehouseListedDatabase[],
): DatabaseGroup[] => {
    const groups: DatabaseGroup[] = [];
    databases.forEach((entry) => {
        const existing = groups.find(
            (group) => group.database === entry.database,
        );
        const group = existing ?? {
            database: entry.database,
            lazyEntry: undefined,
            schemaEntries: [],
        };
        if (!existing) groups.push(group);
        if (entry.schema === null) {
            group.lazyEntry = group.lazyEntry ?? entry;
        } else {
            group.schemaEntries.push(entry);
        }
    });
    return groups;
};

export const defaultExpandedRowIds = (
    connections: TreeConnection[],
): Record<string, boolean> => {
    const expanded: Record<string, boolean> = {};
    connections.forEach((connection) => {
        expanded[connectionRowId(connection.connectionId)] = true;
        connection.databases.forEach((entry) => {
            if (!entry.isDefault) return;
            expanded[databaseRowId(connection.connectionId, entry.database)] =
                true;
            if (entry.schema !== null) {
                expanded[
                    schemaRowId(
                        connection.connectionId,
                        entry.database,
                        entry.schema,
                    )
                ] = true;
            }
        });
    });
    return expanded;
};

// The listed databases whose tables the tree has asked for, by expansion alone
export const collectEnabledUnits = (
    connections: TreeConnection[],
    isExpanded: (rowId: string) => boolean,
): string[] => {
    const showConnectionLevel = connections.length > 1;
    return connections.flatMap((connection) => {
        const { connectionId } = connection;
        if (showConnectionLevel && !isExpanded(connectionRowId(connectionId))) {
            return [];
        }
        return groupByDatabase(connection.databases).flatMap((group) => {
            const databaseExpanded =
                group.database === ''
                    ? true
                    : isExpanded(databaseRowId(connectionId, group.database));
            if (!databaseExpanded) return [];
            const units = group.lazyEntry ? [group.lazyEntry.name] : [];
            group.schemaEntries.forEach((entry) => {
                if (entry.schema === null) return;
                if (
                    isExpanded(
                        schemaRowId(connectionId, group.database, entry.schema),
                    )
                ) {
                    units.push(entry.name);
                }
            });
            return units;
        });
    });
};

const findCatalogDatabase = (
    catalog: WarehouseTablesCatalog,
    database: string,
): WarehouseTablesCatalog[string] | undefined => {
    if (database in catalog) return catalog[database];
    const needle = database.toLowerCase();
    const key = Object.keys(catalog).find((k) => k.toLowerCase() === needle);
    return key === undefined ? undefined : catalog[key];
};

const isView = (tableType: WarehouseTableType | undefined) =>
    tableType === WarehouseTableType.VIEW ||
    tableType === WarehouseTableType.MATERIALIZED_VIEW;

// Untyped rows (cached before the type existed) count as tables
const matchesTableTypeFilter = (
    tableType: WarehouseTableType | undefined,
    filter: TableTypeFilter | null,
): boolean => {
    switch (filter) {
        case null:
            return true;
        case 'views':
            return isView(tableType);
        case 'tables':
            return !isView(tableType);
        default:
            return assertUnreachable(filter, 'Unknown table type filter');
    }
};

export const catalogHasViews = (catalog: WarehouseTablesCatalog): boolean =>
    Object.values(catalog).some((schemas) =>
        Object.values(schemas).some((tables) =>
            Object.values(tables).some(({ tableType }) => isView(tableType)),
        ),
    );

const searchTableNames = (tableNames: string[], search: string): string[] => {
    if (!search) return tableNames;
    const fuse = new Fuse(tableNames, {
        threshold: 0.3,
        isCaseSensitive: false,
        ignoreLocation: true,
    });
    return fuse.search(search).map((result) => result.item);
};

const plainMatch = (value: string, needle: string) =>
    needle !== '' && value.toLowerCase().includes(needle);

type SchemaSource =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'loaded'; tables: SchemaTablesMap };

const schemaSourceFromUnit = (
    state: TableUnitState,
    database: string,
    schema: string,
): SchemaSource => {
    switch (state.status) {
        case 'idle':
        case 'loading':
        case 'error':
            return state;
        case 'loaded':
            return {
                status: 'loaded',
                tables:
                    findCatalogDatabase(state.catalog, database)?.[schema] ??
                    {},
            };
        default:
            return assertUnreachable(state, 'Unknown table unit state');
    }
};

export type BuildWarehouseTreeArgs = {
    connections: TreeConnection[];
    getUnitState: (listedDatabase: string) => TableUnitState;
    isExpanded: (rowId: string) => boolean;
    search: string;
    typeFilter: TableTypeFilter | null;
};

export const buildWarehouseTreeRows = ({
    connections,
    getUnitState,
    isExpanded,
    search,
    typeFilter,
}: BuildWarehouseTreeArgs): WarehouseTreeRow[] => {
    const trimmedSearch = search.trim();
    const needle = trimmedSearch.toLowerCase();
    const isFiltering = trimmedSearch !== '' || typeFilter !== null;
    const showConnectionLevel = connections.length > 1;
    const baseDepth = showConnectionLevel ? 1 : 0;

    // Filtering reveals what is already in hand; it never expands an unloaded unit
    const isRowExpanded = (rowId: string, childrenInHand: boolean) =>
        isFiltering ? childrenInHand || isExpanded(rowId) : isExpanded(rowId);

    const selectTableNames = (tables: SchemaTablesMap, keepAll: boolean) => {
        const typed = Object.keys(tables).filter((table) =>
            matchesTableTypeFilter(tables[table].tableType, typeFilter),
        );
        if (keepAll) return typed;
        return searchTableNames(typed, trimmedSearch);
    };

    const buildSchemaRows = (params: {
        connectionId: string;
        database: string;
        schema: string;
        depth: number;
        listedDatabase: string | null;
        source: SchemaSource;
        keepAllTables: boolean;
    }): WarehouseTreeRow[] => {
        const {
            connectionId,
            database,
            schema,
            depth,
            listedDatabase,
            source,
            keepAllTables,
        } = params;
        const id = schemaRowId(connectionId, database, schema);
        const nameMatches = plainMatch(schema, needle);
        const keepAll = keepAllTables || nameMatches;
        const isLoaded = source.status === 'loaded';

        const tableNames =
            source.status === 'loaded'
                ? selectTableNames(source.tables, keepAll)
                : [];

        if (isFiltering) {
            const keep = isLoaded
                ? tableNames.length > 0 || nameMatches || keepAllTables
                : needle === '' || nameMatches || keepAllTables;
            if (!keep) return [];
        }

        const isExpandedRow = isRowExpanded(id, isLoaded);
        const header: WarehouseTreeRow = {
            type: 'schema',
            id,
            depth,
            connectionId,
            database,
            schema,
            listedDatabase,
            isExpanded: isExpandedRow,
            childCount: isLoaded ? tableNames.length : null,
        };
        if (!isExpandedRow) return [header];

        switch (source.status) {
            case 'idle':
            case 'loading':
                return [
                    header,
                    { type: 'loading', id: `loading:${id}`, depth: depth + 1 },
                ];
            case 'error':
                return [
                    header,
                    {
                        type: 'error',
                        id: `error:${id}`,
                        depth: depth + 1,
                        listedDatabase: listedDatabase ?? '',
                        message: source.message,
                    },
                ];
            case 'loaded':
                return [
                    header,
                    ...tableNames.map((table): WarehouseTreeRow => {
                        const identity: TableIdentity = {
                            connectionId,
                            database,
                            schema,
                            table,
                        };
                        return {
                            type: 'table',
                            id: tableRowId(identity),
                            depth: depth + 1,
                            identity,
                            partitionColumn:
                                source.tables[table].partitionColumn,
                            tableType: source.tables[table].tableType,
                        };
                    }),
                ];
            default:
                return assertUnreachable(source, 'Unknown schema source');
        }
    };

    const buildDatabaseRows = (
        connection: TreeConnection,
        group: DatabaseGroup,
    ): WarehouseTreeRow[] => {
        const { connectionId } = connection;
        const { database, lazyEntry, schemaEntries } = group;
        // ClickHouse has no database level, so its schemas sit at the top
        const hasDatabaseRow = database !== '';
        const id = databaseRowId(connectionId, database);
        const unitState = lazyEntry ? getUnitState(lazyEntry.name) : undefined;
        const childrenInHand = lazyEntry
            ? unitState?.status === 'loaded'
            : true;
        const nameMatches =
            plainMatch(database, needle) ||
            (lazyEntry ? plainMatch(lazyEntry.name, needle) : false);

        const isExpandedRow = hasDatabaseRow
            ? isRowExpanded(id, childrenInHand)
            : true;

        const schemaDepth = hasDatabaseRow ? baseDepth + 1 : baseDepth;
        const buildChildren = (): WarehouseTreeRow[] => {
            const listedSchemaNames = new Set(
                schemaEntries.map((entry) => entry.schema),
            );
            const listedRows = schemaEntries.flatMap((entry) =>
                entry.schema === null
                    ? []
                    : buildSchemaRows({
                          connectionId,
                          database,
                          schema: entry.schema,
                          depth: schemaDepth,
                          listedDatabase: entry.name,
                          source: schemaSourceFromUnit(
                              getUnitState(entry.name),
                              database,
                              entry.schema,
                          ),
                          keepAllTables: nameMatches,
                      }),
            );
            if (!lazyEntry || unitState === undefined) return listedRows;
            if (unitState.status !== 'loaded') {
                const pending: WarehouseTreeRow =
                    unitState.status === 'error'
                        ? {
                              type: 'error',
                              id: `error:${id}`,
                              depth: schemaDepth,
                              listedDatabase: lazyEntry.name,
                              message: unitState.message,
                          }
                        : {
                              type: 'loading',
                              id: `loading:${id}`,
                              depth: schemaDepth,
                          };
                return [...listedRows, pending];
            }
            const derivedDatabase = findCatalogDatabase(
                unitState.catalog,
                database,
            );
            const derivedRows = Object.keys(derivedDatabase ?? {}).flatMap(
                (schema) =>
                    listedSchemaNames.has(schema)
                        ? []
                        : buildSchemaRows({
                              connectionId,
                              database,
                              schema,
                              depth: schemaDepth,
                              listedDatabase: null,
                              source: {
                                  status: 'loaded',
                                  tables: derivedDatabase?.[schema] ?? {},
                              },
                              keepAllTables: nameMatches,
                          }),
            );
            return [...listedRows, ...derivedRows];
        };

        const children =
            isExpandedRow || isFiltering ? buildChildren() : undefined;

        if (!hasDatabaseRow) return children ?? [];

        if (isFiltering) {
            const hasChildren = (children ?? []).length > 0;
            const keep = childrenInHand
                ? hasChildren || nameMatches
                : hasChildren || nameMatches || needle === '';
            if (!keep) return [];
        }

        const schemaRowCount = (children ?? []).filter(
            (row) => row.type === 'schema',
        ).length;
        const header: WarehouseTreeRow = {
            type: 'database',
            id,
            depth: baseDepth,
            connectionId,
            database,
            listedDatabase: lazyEntry?.name ?? null,
            isExpanded: isExpandedRow,
            childCount:
                children !== undefined
                    ? schemaRowCount
                    : lazyEntry === undefined
                      ? schemaEntries.length
                      : null,
        };
        if (!isExpandedRow) return [header];
        return [header, ...(children ?? [])];
    };

    return connections.flatMap((connection) => {
        const { connectionId } = connection;
        const groups = groupByDatabase(connection.databases);
        const rowId = connectionRowId(connectionId);
        const isConnectionExpanded = showConnectionLevel
            ? isRowExpanded(rowId, true)
            : true;
        const databaseRows = isConnectionExpanded
            ? groups.flatMap((group) => buildDatabaseRows(connection, group))
            : [];
        const truncationRows: WarehouseTreeRow[] =
            connection.truncated && (!isFiltering || databaseRows.length > 0)
                ? [
                      {
                          type: 'truncation',
                          id: `truncation:${connectionId}`,
                          depth: baseDepth,
                          limit: connection.limit,
                      },
                  ]
                : [];

        if (!showConnectionLevel) return [...databaseRows, ...truncationRows];

        const header: WarehouseTreeRow = {
            type: 'connection',
            id: rowId,
            depth: 0,
            connectionId,
            connectionName: connection.connectionName,
            isExpanded: isConnectionExpanded,
            childCount: groups.length,
        };
        if (!isConnectionExpanded) return [header];
        return [header, ...databaseRows, ...truncationRows];
    });
};
