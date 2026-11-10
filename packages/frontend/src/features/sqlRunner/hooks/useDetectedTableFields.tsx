import { useMemo } from 'react';
import { extractTableReferences } from '../utils/sqlCompletion/analyze';
import { type SqlCatalog } from '../utils/sqlCompletionScope';
import {
    useMultipleTableFields,
    type TableReference,
} from './useMultipleTableFields';

// A bare table name can match the same table in several schemas
const MAX_SCHEMAS_PER_BARE_TABLE = 5;

const equalsIgnoreCase = (a: string, b: string) =>
    a.toLowerCase() === b.toLowerCase();

/**
 * Resolves table paths from SQL against the catalog, using the catalog's
 * database as the default. Returns catalog-cased schema and table names.
 */
export const resolveCatalogTables = (
    paths: string[][],
    catalog: SqlCatalog,
): Array<{ schema: string; table: string }> => {
    const resolved = new Map<string, { schema: string; table: string }>();
    const add = (schema: string, table: string) =>
        resolved.set(`${schema}.${table}`.toLowerCase(), { schema, table });
    const schemas = catalog.tablesBySchema ?? [];
    const findTable = (tables: Record<string, unknown>, name: string) =>
        Object.keys(tables).find((table) => equalsIgnoreCase(table, name));

    paths.forEach((path) => {
        const [table, schema, database] = [...path].reverse();
        if (!table) return;
        if (database && !equalsIgnoreCase(database, catalog.database)) return;
        if (path.length > 3) return;

        if (schema) {
            const match = schemas.find((s) =>
                equalsIgnoreCase(s.schema.toString(), schema),
            );
            const actualTable = match && findTable(match.tables, table);
            if (match && actualTable) add(match.schema.toString(), actualTable);
            return;
        }
        schemas
            .flatMap((s) => {
                const actualTable = findTable(s.tables, table);
                return actualTable
                    ? [{ schema: s.schema.toString(), actualTable }]
                    : [];
            })
            .slice(0, MAX_SCHEMAS_PER_BARE_TABLE)
            .forEach((match) => add(match.schema, match.actualTable));
    });
    return [...resolved.values()];
};

export const useDetectedTableFields = ({
    sql,
    quoteChar,
    projectUuid,
    transformedData,
    connectionId,
}: {
    sql: string;
    quoteChar: string;
    projectUuid: string;
    transformedData?: SqlCatalog;
    connectionId?: string;
}) => {
    const detectedPaths = useMemo(() => {
        if (!sql || !quoteChar) return [];
        return extractTableReferences(sql, quoteChar);
    }, [sql, quoteChar]);

    const tableReferences = useMemo((): TableReference[] => {
        if (!transformedData || !projectUuid) return [];
        return resolveCatalogTables(detectedPaths, transformedData).map(
            ({ schema, table }) => ({
                projectUuid,
                tableName: table,
                schema,
                ...(connectionId
                    ? {
                          connection: {
                              connectionId,
                              database: transformedData.database,
                          },
                      }
                    : {}),
            }),
        );
    }, [detectedPaths, transformedData, projectUuid, connectionId]);

    return useMultipleTableFields(tableReferences);
};
