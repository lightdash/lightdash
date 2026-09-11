import {
    type PartitionColumn,
    type WarehouseTableType,
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

export const filterTablesBySchema = (
    tablesBySchema: SchemaTables[],
    search: string,
): SchemaTables[] =>
    tablesBySchema
        .map(({ schema, tables }) => {
            const fuse = new Fuse(Object.keys(tables), {
                threshold: 0.3,
                isCaseSensitive: false,
                ignoreLocation: true,
            });
            const matches = fuse.search(search).map((result) => result.item);
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
