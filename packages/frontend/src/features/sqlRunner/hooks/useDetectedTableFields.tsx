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

        const filteredTables: Required<ParsedTableReference>[] =
            detectedTables.filter(
                (tableRef): tableRef is Required<ParsedTableReference> => {
                    // Only include tables that exist in our catalog
                    if (!isValidTableReference(tableRef)) {
                        return false;
                    }

                    const matchesCurrentDatabase =
                        tableRef.database === transformedData.database;
                    const schemaExists = transformedData.tablesBySchema?.some(
                        (s) => s.schema === tableRef.schema,
                    );
                    const tableExists = transformedData.tablesBySchema
                        ?.find((s) => s.schema === tableRef.schema)
                        ?.tables.hasOwnProperty(tableRef.table);

                    return (
                        matchesCurrentDatabase &&
                        !!schemaExists &&
                        !!tableExists
                    );
                },
            );
        return filteredTables.map((tableRef) => ({
            projectUuid,
            tableName: tableRef.table,
            schema: tableRef.schema,
        }));
    }, [detectedTables, transformedData, projectUuid]);

    // Use the new multi-table fields hook
    const result = useMultipleTableFields(tableReferences);

    return {
        ...result,
        detectedTableCount: detectedTables.length,
        validTableCount: tableReferences.length,
    };
};
