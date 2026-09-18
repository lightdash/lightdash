import { type WarehouseTablesCatalog } from '@lightdash/common';
import { useMemo } from 'react';
import {
    useMultipleTableFields,
    type TableReference,
} from './useMultipleTableFields';

type ParsedTableReference = {
    database?: string;
    schema?: string;
    table: string;
    fullReference: string;
};

const isValidTableReference = (
    tableRef: ParsedTableReference,
): tableRef is Required<ParsedTableReference> => {
    return !!(tableRef.database && tableRef.schema);
};

const parseTableReferencesFromSQL = (
    sql: string,
    quoteChar: string,
): Array<ParsedTableReference> => {
    if (!sql) return [];

    const tableReferences: Array<ParsedTableReference> = [];

    // Regex to match quoted identifiers in SQL
    // This matches patterns like: "database"."schema"."table" or schema.table or just table
    const quotedIdentifierRegex = new RegExp(
        `\\${quoteChar}([^${quoteChar}]+)\\${quoteChar}(?:\\.\\${quoteChar}([^${quoteChar}]+)\\${quoteChar})?(?:\\.\\${quoteChar}([^${quoteChar}]+)\\${quoteChar})?`,
        'gi',
    );

    // Also match unquoted identifiers (word.word.word pattern)
    const unquotedIdentifierRegex =
        /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*){1,2})\b/g;

    let match;

    // Parse quoted identifiers
    while ((match = quotedIdentifierRegex.exec(sql)) !== null) {
        const parts = [match[1], match[2], match[3]].filter(Boolean);
        const fullReference = match[0];

        if (parts.length === 3) {
            // database.schema.table
            tableReferences.push({
                database: parts[0],
                schema: parts[1],
                table: parts[2],
                fullReference,
            });
        } else if (parts.length === 2) {
            // schema.table
            tableReferences.push({
                schema: parts[0],
                table: parts[1],
                fullReference,
            });
        } else if (parts.length === 1) {
            // just table
            tableReferences.push({
                table: parts[0],
                fullReference,
            });
        }
    }

    // Parse unquoted identifiers
    while ((match = unquotedIdentifierRegex.exec(sql)) !== null) {
        const parts = match[1].split('.');
        const fullReference = match[0];

        if (parts.length === 3) {
            // database.schema.table
            tableReferences.push({
                database: parts[0],
                schema: parts[1],
                table: parts[2],
                fullReference,
            });
        } else if (parts.length === 2) {
            // schema.table
            tableReferences.push({
                schema: parts[0],
                table: parts[1],
                fullReference,
            });
        }
    }

    // Remove duplicates based on fullReference
    const uniqueReferences = tableReferences.filter(
        (ref, index, self) =>
            index ===
            self.findIndex((r) => r.fullReference === ref.fullReference),
    );

    return uniqueReferences;
};

export const useDetectedTableFields = ({
    sql,
    quoteChar,
    projectUuid,
    connectionUuid,
    catalog,
    isConnectionSettled = true,
}: {
    sql: string;
    quoteChar: string;
    projectUuid: string;
    connectionUuid?: string;
    catalog: WarehouseTablesCatalog;
    isConnectionSettled?: boolean;
}) => {
    // Parse SQL to detect table references
    const detectedTables = useMemo(() => {
        if (!sql || !quoteChar) return [];
        return parseTableReferencesFromSQL(sql, quoteChar);
    }, [sql, quoteChar]);

    // Filter and prepare table references for React Query
    const tableReferences = useMemo((): TableReference[] => {
        if (!projectUuid || detectedTables.length === 0) {
            return [];
        }

        return detectedTables.reduce<TableReference[]>((acc, tableRef) => {
            // Only include tables that exist in one of the loaded catalogs
            if (!isValidTableReference(tableRef)) {
                return acc;
            }

            const matchingDatabase = Object.keys(catalog).find(
                (database) =>
                    database.toLowerCase() === tableRef.database.toLowerCase(),
            );
            if (matchingDatabase === undefined) {
                return acc;
            }

            const schemas = catalog[matchingDatabase];
            const matchingSchema = Object.keys(schemas).find(
                (schema) =>
                    schema.toLowerCase() === tableRef.schema.toLowerCase(),
            );
            if (matchingSchema === undefined) {
                return acc;
            }

            const actualTableName = Object.keys(schemas[matchingSchema]).find(
                (tableName) =>
                    tableName.toLowerCase() === tableRef.table.toLowerCase(),
            );
            if (actualTableName === undefined) {
                return acc;
            }

            // Add the validated and transformed table reference
            acc.push({
                projectUuid,
                connectionUuid,
                tableName: actualTableName,
                schema: matchingSchema,
                database: matchingDatabase,
            });

            return acc;
        }, []);
    }, [detectedTables, catalog, connectionUuid, projectUuid]);

    // Use the new multi-table fields hook
    const result = useMultipleTableFields(tableReferences, isConnectionSettled);

    return {
        ...result,
        detectedTableCount: detectedTables.length,
        validTableCount: tableReferences.length,
    };
};
