import {
    assertUnreachable,
    WarehouseTableType,
    type PartitionColumn,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { type TablesBySchema } from '../hooks/useTables';

export type SchemaTables = NonNullable<TablesBySchema>[number];

export type TableRow =
    | {
          type: 'schema';
          id: string;
          schema: string;
          isExpanded: boolean;
          tableCount: number;
      }
    | {
          type: 'table';
          id: string;
          schema: string;
          table: string;
          partitionColumn: PartitionColumn | undefined;
          tableType: WarehouseTableType | undefined;
      };

export type TableTypeFilter = 'tables' | 'views';

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

const searchTableNames = (tableNames: string[], search: string): string[] => {
    if (!search) return tableNames;
    const fuse = new Fuse(tableNames, {
        threshold: 0.3,
        isCaseSensitive: false,
        ignoreLocation: true,
    });
    return fuse.search(search).map((result) => result.item);
};

// Schemas left with no matching table are dropped
export const filterTablesBySchema = (
    tablesBySchema: SchemaTables[],
    search: string,
    typeFilter: TableTypeFilter | null,
): SchemaTables[] =>
    tablesBySchema
        .map(({ schema, tables }) => {
            const typed = Object.keys(tables).filter((table) =>
                matchesTableTypeFilter(tables[table].tableType, typeFilter),
            );
            const matches = searchTableNames(typed, search);
            return {
                schema,
                tables: Object.fromEntries(
                    matches.map((table) => [table, tables[table]]),
                ),
            };
        })
        .filter(({ tables }) => Object.keys(tables).length > 0);

// Flattens the schema tree into the rows the virtualized list renders
export const buildTableRows = (
    tablesBySchema: SchemaTables[],
    isSchemaExpanded: (schema: string) => boolean,
): TableRow[] =>
    tablesBySchema.flatMap(({ schema, tables }) => {
        const schemaName = String(schema);
        const tableNames = Object.keys(tables);
        const isExpanded = isSchemaExpanded(schemaName);
        const header: TableRow = {
            type: 'schema',
            id: `schema:${schemaName}`,
            schema: schemaName,
            isExpanded,
            tableCount: tableNames.length,
        };
        if (!isExpanded) return [header];
        return [
            header,
            ...tableNames.map(
                (table): TableRow => ({
                    type: 'table',
                    id: `table:${schemaName}.${table}`,
                    schema: schemaName,
                    table,
                    partitionColumn: tables[table].partitionColumn,
                    tableType: tables[table].tableType,
                }),
            ),
        ];
    });
