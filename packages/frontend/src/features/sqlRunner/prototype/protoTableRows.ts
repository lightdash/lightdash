import {
    type PartitionColumn,
    type WarehouseTableType,
} from '@lightdash/common';
import { type ProtoConnection } from './protoConnections';

export type ProtoTableIdentity = {
    connectionId: string;
    connectionName: string;
    database: string;
    schema: string;
    table: string;
};

export type ProtoTreeRow =
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
          connectionName: string;
          database: string;
          isExpanded: boolean;
          childCount: number;
      }
    | {
          type: 'schema';
          id: string;
          depth: number;
          connectionId: string;
          connectionName: string;
          database: string;
          schema: string;
          isExpanded: boolean;
          childCount: number;
      }
    | {
          type: 'table';
          id: string;
          depth: number;
          identity: ProtoTableIdentity;
          partitionColumn: PartitionColumn | undefined;
          tableType: WarehouseTableType | undefined;
      };

const connectionRowId = (connectionId: string) => `connection:${connectionId}`;
const databaseRowId = (connectionId: string, database: string) =>
    `database:${connectionId}/${database}`;
const schemaRowId = (connectionId: string, database: string, schema: string) =>
    `schema:${connectionId}/${database}/${schema}`;
const tableRowId = (identity: ProtoTableIdentity) =>
    `table:${identity.connectionId}/${identity.database}/${identity.schema}/${identity.table}`;

export const buildConnectionTreeRows = (
    connections: ProtoConnection[],
    isExpanded: (rowId: string) => boolean,
): ProtoTreeRow[] => {
    const showConnectionLevel = connections.length > 1;
    const baseDepth = showConnectionLevel ? 1 : 0;

    return connections.flatMap((connection) => {
        const databases = Object.entries(connection.catalog);
        const connectionId = connection.id;
        const connectionName = connection.name;

        const databaseRows = databases.flatMap(([database, schemas]) => {
            const schemaEntries = Object.entries(schemas);
            const databaseId = databaseRowId(connectionId, database);
            const isDatabaseExpanded = isExpanded(databaseId);

            const databaseRow: ProtoTreeRow = {
                type: 'database',
                id: databaseId,
                depth: baseDepth,
                connectionId,
                connectionName,
                database,
                isExpanded: isDatabaseExpanded,
                childCount: schemaEntries.length,
            };
            if (!isDatabaseExpanded) return [databaseRow];

            const schemaRows = schemaEntries.flatMap(([schema, tables]) => {
                const tableEntries = Object.entries(tables);
                const schemaId = schemaRowId(connectionId, database, schema);
                const isSchemaExpanded = isExpanded(schemaId);

                const schemaRow: ProtoTreeRow = {
                    type: 'schema',
                    id: schemaId,
                    depth: baseDepth + 1,
                    connectionId,
                    connectionName,
                    database,
                    schema,
                    isExpanded: isSchemaExpanded,
                    childCount: tableEntries.length,
                };
                if (!isSchemaExpanded) return [schemaRow];

                const tableRows = tableEntries.map(
                    ([tableName, tableInfo]): ProtoTreeRow => {
                        const identity: ProtoTableIdentity = {
                            connectionId,
                            connectionName,
                            database,
                            schema,
                            table: tableName,
                        };
                        return {
                            type: 'table',
                            id: tableRowId(identity),
                            depth: baseDepth + 2,
                            identity,
                            partitionColumn: tableInfo.partitionColumn,
                            tableType: tableInfo.tableType,
                        };
                    },
                );
                return [schemaRow, ...tableRows];
            });
            return [databaseRow, ...schemaRows];
        });

        if (!showConnectionLevel) return databaseRows;

        const connectionRowKey = connectionRowId(connectionId);
        const isConnectionExpanded = isExpanded(connectionRowKey);
        const connectionRow: ProtoTreeRow = {
            type: 'connection',
            id: connectionRowKey,
            depth: 0,
            connectionId,
            connectionName,
            isExpanded: isConnectionExpanded,
            childCount: databases.length,
        };
        return isConnectionExpanded
            ? [connectionRow, ...databaseRows]
            : [connectionRow];
    });
};

export const defaultExpandedRowIds = (
    connections: ProtoConnection[],
): Record<string, boolean> =>
    Object.fromEntries(
        connections.flatMap((connection) => [
            [connectionRowId(connection.id), true],
            ...Object.keys(connection.catalog).map(
                (database): [string, boolean] => [
                    databaseRowId(connection.id, database),
                    true,
                ],
            ),
        ]),
    );

export const qualifiedTableName = (
    identity: ProtoTableIdentity,
    quoteChar: string,
): string =>
    [identity.database, identity.schema, identity.table]
        .map((part) => `${quoteChar}${part}${quoteChar}`)
        .join('.');

export const filterConnectionsBySearch = (
    connections: ProtoConnection[],
    search: string,
): ProtoConnection[] => {
    const needle = search.trim().toLowerCase();
    if (!needle) return connections;

    return connections
        .map((connection) => {
            const catalog = Object.fromEntries(
                Object.entries(connection.catalog)
                    .map(([database, schemas]) => {
                        const filteredSchemas = Object.fromEntries(
                            Object.entries(schemas)
                                .map(([schema, tables]) => [
                                    schema,
                                    Object.fromEntries(
                                        Object.entries(tables).filter(
                                            ([tableName]) =>
                                                tableName
                                                    .toLowerCase()
                                                    .includes(needle),
                                        ),
                                    ),
                                ])
                                .filter(
                                    ([, tables]) =>
                                        Object.keys(tables).length > 0,
                                ),
                        );
                        return [database, filteredSchemas];
                    })
                    .filter(([, schemas]) => Object.keys(schemas).length > 0),
            );
            return { ...connection, catalog };
        })
        .filter((connection) => Object.keys(connection.catalog).length > 0);
};
