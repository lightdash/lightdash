import {
    type CompletionContext,
    type CompletionSource,
} from '@codemirror/autocomplete';
import type { ParameterValue } from '@lightdash/common';
import { useMemo } from 'react';
import type { WarehouseTableFieldWithContext } from './useTableFields';
import type { TablesBySchema } from './useTables';

interface SqlAutocompletionsConfig {
    quoteChar?: string;
    tables?: string[];
    fields?: WarehouseTableFieldWithContext[];
    availableParameters?: Record<
        string,
        {
            label: string;
            description?: string;
            default?: ParameterValue;
        }
    >;
}

export const useSqlAutocompletions = ({
    quoteChar: _quoteChar = '"',
    tables = [],
    fields = [],
    availableParameters,
}: SqlAutocompletionsConfig): CompletionSource[] => {
    return useMemo(() => {
        const sources: CompletionSource[] = [];

        // Table completions
        if (tables.length > 0) {
            sources.push((context: CompletionContext) => {
                const beforeCursor = context.state.doc.sliceString(
                    0,
                    context.pos,
                );

                // Check if we're in a position where a table name makes sense
                const isAfterFrom = /(?:FROM|JOIN)\s+[\w.]*$/i.test(
                    beforeCursor,
                );
                if (!isAfterFrom) return null;

                const word = context.matchBefore(/[\w.]+$/);
                if (!word) return null;

                return {
                    from: word.from,
                    options: tables.map((table) => ({
                        label: table,
                        type: 'class',
                        detail: 'Table',
                    })),
                };
            });
        }

        // Field completions
        if (fields.length > 0) {
            sources.push((context: CompletionContext) => {
                const word = context.matchBefore(/[\w.]+$/);
                if (!word) return null;

                return {
                    from: word.from,
                    options: fields.map((field) => {
                        const hasTableContext =
                            'table' in field && 'schema' in field;
                        const tableContext = hasTableContext
                            ? ` from ${field.schema}.${field.table}`
                            : '';

                        return {
                            label: field.name,
                            type: 'property',
                            detail: `Column: ${field.type}${tableContext}`,
                        };
                    }),
                };
            });
        }

        // Parameter completions
        if (availableParameters) {
            sources.push((context: CompletionContext) => {
                const textUntilPosition = context.state.doc.sliceString(
                    Math.max(0, context.pos - 100),
                    context.pos,
                );

                // Don't show parameter completions for $word patterns (like $param, $metric, $ld)
                // Only show for clean patterns: ${...}, ld.parameters, or plain $
                const isDollarWord =
                    /\$\w+$/.test(textUntilPosition) &&
                    !/\$$/.test(textUntilPosition);
                if (isDollarWord) return null;

                // Patterns to detect context
                const parameterPattern =
                    /\$\{(ld(?:\.(?:parameters(?:\.\w*)?|\w*))?)\}?$/;
                const ldPattern = /\b(ld(?:\.(?:parameters(?:\.\w*)?|\w*))?)$/;
                const insideBracketsPattern = /\$\{([^}]*?)$/;

                const parameterMatch =
                    textUntilPosition.match(parameterPattern);
                const ldMatch = textUntilPosition.match(ldPattern);
                const insideBracketsMatch = textUntilPosition.match(
                    insideBracketsPattern,
                );

                if (
                    !parameterMatch &&
                    !ldMatch &&
                    !insideBracketsMatch &&
                    !/\$$/.test(textUntilPosition)
                ) {
                    return null;
                }

                const word = context.matchBefore(/[\w.${}]*$/);
                if (!word) return null;

                return {
                    from: word.from,
                    options: Object.keys(availableParameters).map(
                        (paramName) => {
                            const paramConfig = availableParameters[paramName];
                            const insertText = `\${ld.parameters.${paramName}}`;

                            return {
                                label: `ld.parameters.${paramName}`,
                                detail: paramConfig.description
                                    ? `${paramConfig.label} - ${paramConfig.description}`
                                    : paramConfig.label,
                                type: 'variable',
                                apply: insertText,
                            };
                        },
                    ),
                };
            });
        }

        return sources;
    }, [tables, fields, availableParameters]);
};

export const generateTableCompletions = (
    quoteChar: string,
    data: { database: string; tablesBySchema: TablesBySchema },
): string[] => {
    const database = data.database;

    return (
        data.tablesBySchema
            ?.map((s) =>
                Object.keys(s.tables).map((t) => {
                    const schema = s.schema.toString();
                    return `${quoteChar}${database}${quoteChar}.${quoteChar}${schema}${quoteChar}.${quoteChar}${t}${quoteChar}`;
                }),
            )
            .flat() || []
    );
};
