import {
    assertUnreachable,
    WarehouseTableType,
    type PartitionColumn,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { type TablesBySchema } from '../hooks/useTables';

export type SchemaTables = NonNullable<TablesBySchema>[number] & {
    database: string;
};

export type TableRef = {
    database: string;
    schema: string;
    table: string;
};

export type TableRow =
    | {
          type: 'section';
          id: string;
          label: string;
      }
    | {
          type: 'recent';
          id: string;
          database: string;
          schema: string;
          table: string;
          partitionColumn: PartitionColumn | undefined;
          tableType: WarehouseTableType | undefined;
      }
    | {
          type: 'group';
          id: string;
          label: string;
          isExpanded: boolean;
          schemaCount: number;
      }
    | {
          type: 'schema';
          id: string;
          database: string;
          schema: string;
          databaseLabel: string | null;
          isExpanded: boolean;
          tableCount: number;
          depth: number;
      }
    | {
          type: 'table';
          id: string;
          database: string;
          schema: string;
          table: string;
          partitionColumn: PartitionColumn | undefined;
          tableType: WarehouseTableType | undefined;
          depth: number;
      };

export type TableTypeFilter = 'tables' | 'views';

export const MIN_TABLE_SEARCH_LENGTH = 2;

export const DEV_SCHEMAS_GROUP_ID = 'group:dev-schemas';
const DEV_SCHEMAS_GROUP_LABEL = 'dev & pr schemas';

// dbt Cloud CI schemas pile up fast and are rarely what someone is looking for
const DEV_SCHEMA_PATTERN = /^dbt_cloud_pr_/i;

export const isDevSchema = (schema: string): boolean =>
    DEV_SCHEMA_PATTERN.test(schema);

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

export const catalogHasViews = (tablesBySchema: SchemaTables[]): boolean =>
    tablesBySchema.some(({ tables }) =>
        Object.values(tables).some(({ tableType }) => isView(tableType)),
    );

export const catalogHasDevSchemas = (tablesBySchema: SchemaTables[]): boolean =>
    tablesBySchema.some(({ schema }) => isDevSchema(String(schema)));

const searchTableNames = (tableNames: string[], search: string): string[] => {
    if (!search) return tableNames;
    const fuse = new Fuse(tableNames, {
        threshold: 0.3,
        isCaseSensitive: false,
        ignoreLocation: true,
    });
    return fuse.search(search).map((result) => result.item);
};

const plainMatch = (value: string, search: string) =>
    search !== '' && value.toLowerCase().includes(search.toLowerCase());

const schemaNameMatches = (
    { database, schema }: { database: string; schema: string },
    search: string,
): boolean =>
    plainMatch(String(schema), search.trim()) ||
    plainMatch(database, search.trim());

// A schema whose own name (or database) matches keeps every table;
// otherwise tables are searched by name and empty schemas are dropped
export const filterTablesBySchema = (
    tablesBySchema: SchemaTables[],
    search: string,
    typeFilter: TableTypeFilter | null,
): SchemaTables[] =>
    tablesBySchema
        .map(({ database, schema, tables }) => {
            const typed = Object.keys(tables).filter((table) =>
                matchesTableTypeFilter(tables[table].tableType, typeFilter),
            );
            const matches = schemaNameMatches(
                { database, schema: String(schema) },
                search,
            )
                ? typed
                : searchTableNames(typed, search);
            return {
                database,
                schema,
                tables: Object.fromEntries(
                    matches.map((table) => [table, tables[table]]),
                ),
            };
        })
        .filter(({ tables }) => Object.keys(tables).length > 0);

// An active table saved without its database matches the schema in any database
export const isActiveSchema = (
    { database, schema }: { database: string; schema: string },
    active: {
        activeDatabase: string | undefined;
        activeSchema: string | undefined;
    },
): boolean =>
    schema === active.activeSchema &&
    (active.activeDatabase === undefined || database === active.activeDatabase);

const buildSchemaRows = (
    schemaTables: SchemaTables,
    isExpanded: boolean,
    showDatabase: boolean,
    depth: number,
): TableRow[] => {
    const { database, schema, tables } = schemaTables;
    const schemaName = String(schema);
    const tableNames = Object.keys(tables);
    const header: TableRow = {
        type: 'schema',
        id: `schema:${database}.${schemaName}`,
        database,
        schema: schemaName,
        databaseLabel: showDatabase && database !== '' ? database : null,
        isExpanded,
        tableCount: tableNames.length,
        depth,
    };
    if (!isExpanded) return [header];
    return [
        header,
        ...tableNames.map(
            (table): TableRow => ({
                type: 'table',
                id: `table:${database}.${schemaName}.${table}`,
                database,
                schema: schemaName,
                table,
                partitionColumn: tables[table].partitionColumn,
                tableType: tables[table].tableType,
                depth,
            }),
        ),
    ];
};

export type DevSchemaGrouping = {
    isGroupExpanded: boolean;
};

// Flattens the schema tree into the rows the virtualized list renders.
// With grouping on, dev schemas collapse into one node after the others.
export const buildTableRows = (
    tablesBySchema: SchemaTables[],
    isSchemaExpanded: (
        schemaRowId: string,
        schemaTables: SchemaTables,
    ) => boolean,
    showDatabase: boolean,
    grouping: DevSchemaGrouping | null = null,
): TableRow[] => {
    const rowsFor = (schemaTables: SchemaTables, depth: number) =>
        buildSchemaRows(
            schemaTables,
            isSchemaExpanded(
                `schema:${schemaTables.database}.${String(
                    schemaTables.schema,
                )}`,
                schemaTables,
            ),
            showDatabase,
            depth,
        );

    if (grouping === null) {
        return tablesBySchema.flatMap((schemaTables) =>
            rowsFor(schemaTables, 0),
        );
    }

    const devSchemas = tablesBySchema.filter(({ schema }) =>
        isDevSchema(String(schema)),
    );
    if (devSchemas.length === 0) {
        return tablesBySchema.flatMap((schemaTables) =>
            rowsFor(schemaTables, 0),
        );
    }
    const mainSchemas = tablesBySchema.filter(
        ({ schema }) => !isDevSchema(String(schema)),
    );
    const group: TableRow = {
        type: 'group',
        id: DEV_SCHEMAS_GROUP_ID,
        label: DEV_SCHEMAS_GROUP_LABEL,
        isExpanded: grouping.isGroupExpanded,
        schemaCount: devSchemas.length,
    };
    return [
        ...mainSchemas.flatMap((schemaTables) => rowsFor(schemaTables, 0)),
        group,
        ...(grouping.isGroupExpanded
            ? devSchemas.flatMap((schemaTables) => rowsFor(schemaTables, 1))
            : []),
    ];
};

export const RECENT_SECTION_ID = 'section:recent';
export const ALL_SCHEMAS_SECTION_ID = 'section:all-schemas';

// Recent tables that still exist in the catalog, headed by their own section
export const buildRecentRows = (
    recentTables: TableRef[],
    tablesBySchema: SchemaTables[],
): TableRow[] => {
    const rows = recentTables.flatMap((ref): TableRow[] => {
        const schemaTables = tablesBySchema.find(
            ({ database, schema }) =>
                database === ref.database && String(schema) === ref.schema,
        );
        const table = schemaTables?.tables[ref.table];
        if (!table) return [];
        return [
            {
                type: 'recent',
                id: `recent:${ref.database}.${ref.schema}.${ref.table}`,
                database: ref.database,
                schema: ref.schema,
                table: ref.table,
                partitionColumn: table.partitionColumn,
                tableType: table.tableType,
            },
        ];
    });
    if (rows.length === 0) return [];
    return [
        { type: 'section', id: RECENT_SECTION_ID, label: 'Recent' },
        ...rows,
        { type: 'section', id: ALL_SCHEMAS_SECTION_ID, label: 'All schemas' },
    ];
};
