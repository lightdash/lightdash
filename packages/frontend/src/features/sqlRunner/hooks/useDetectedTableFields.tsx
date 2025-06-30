import { useMemo } from 'react';
import {
    useMultipleTableFields,
    type TableReference,
} from './useMultipleTableFields';
import { type TablesBySchema } from './useTables';

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
    transformedData,
}: {
    sql: string;
    quoteChar: string;
    projectUuid: string;
    transformedData?: { database: string; tablesBySchema: TablesBySchema };
}) => {
    // Parse SQL to detect table references
    const detectedTables = useMemo(() => {
        if (!sql || !quoteChar) return [];
        return parseTableReferencesFromSQL(sql, quoteChar);
    }, [sql, quoteChar]);

    // Filter and prepare table references for React Query
    const tableReferences = useMemo((): TableReference[] => {
        if (!transformedData || !projectUuid || detectedTables.length === 0) {
            return [];
        }

        return detectedTables.reduce<TableReference[]>((acc, tableRef) => {
            // Only include tables that exist in our catalog
            if (!isValidTableReference(tableRef)) {
                return acc;
            }

            const matchesCurrentDatabase =
                tableRef.database?.toLowerCase() ===
                transformedData.database.toLowerCase();

            // Find the matching schema (case-insensitive) - do this once
            const matchingSchema = transformedData.tablesBySchema?.find(
                (s) =>
                    s.schema.toString().toLowerCase() ===
                    tableRef.schema?.toLowerCase(),
            );

            if (!matchingSchema || !matchesCurrentDatabase) {
                return acc;
            }

            // Check if table exists in the matching schema (case-insensitive)
            const actualTableName = Object.keys(matchingSchema.tables).find(
                (tableName) =>
                    tableName.toLowerCase() === tableRef.table.toLowerCase(),
            );

            if (!actualTableName) {
                return acc;
            }

            // Add the validated and transformed table reference
            acc.push({
                projectUuid,
                tableName: actualTableName, // Use actual table name from catalog
                schema: matchingSchema.schema.toString(), // Use actual schema name from catalog
            });

            return acc;
        }, []);
    }, [detectedTables, transformedData, projectUuid]);

    // Use the new multi-table fields hook
    const result = useMultipleTableFields(tableReferences);

    return {
        ...result,
        detectedTableCount: detectedTables.length,
        validTableCount: tableReferences.length,
    };
};
