import { WarehouseTypes, type ParameterValue } from '@lightdash/common';
import type { ColorScheme } from '@mantine/core';
import type { EditorProps, Monaco } from '@monaco-editor/react';
import {
    bigqueryLanguageDefinition,
    snowflakeLanguageDefinition,
} from '@popsql/monaco-sql-languages';
import type { languages } from 'monaco-editor';
import { LanguageIdEnum, setupLanguageFeatures } from 'monaco-sql-languages';
import type { SqlEditorPreferences } from '../hooks/useSqlEditorPreferences';
import type { WarehouseTableFieldWithContext } from '../hooks/useTableFields';
import type { TablesBySchema } from '../hooks/useTables';

export const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
    automaticLayout: true,
    tabSize: 2,
};

export const getMonacoLanguage = (warehouseType?: WarehouseTypes): string => {
    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return bigqueryLanguageDefinition.id;
        case WarehouseTypes.SNOWFLAKE:
            return snowflakeLanguageDefinition.id;
        case WarehouseTypes.TRINO:
            return LanguageIdEnum.TRINO;
        case WarehouseTypes.DATABRICKS:
            return LanguageIdEnum.SPARK;
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return LanguageIdEnum.PG;
        default:
            return snowflakeLanguageDefinition.id;
    }
};

export const registerMonacoLanguage = (monaco: Monaco, language: string) => {
    if (
        [
            bigqueryLanguageDefinition.id,
            snowflakeLanguageDefinition.id,
        ].includes(language)
    ) {
        const languageDefinition =
            language === bigqueryLanguageDefinition.id
                ? bigqueryLanguageDefinition
                : snowflakeLanguageDefinition;
        monaco.languages.register(languageDefinition);
        monaco.languages.onLanguage(languageDefinition.id, () => {
            void languageDefinition.loader().then((mod) => {
                monaco.languages.setMonarchTokensProvider(
                    languageDefinition.id,
                    mod.language,
                );
                monaco.languages.setLanguageConfiguration(
                    languageDefinition.id,
                    mod.conf,
                );
            });
        });
    } else if (language in LanguageIdEnum) {
        setupLanguageFeatures(language as LanguageIdEnum, {
            completionItems: {
                enable: true,
                triggerCharacters: [' ', '.'],
            },
        });
    }
};

export const getLightdashMonacoTheme = (colorScheme: ColorScheme) => {
    if (colorScheme === 'dark') {
        return {
            rules: [
                { token: '', foreground: 'd4d4d4' },
                { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
                {
                    token: 'operator.sql',
                    foreground: 'd4d4d4',
                    fontStyle: 'bold',
                },
                { token: 'number', foreground: 'b5cea8' },
                { token: 'string', foreground: 'ce9178' },
                { token: 'delimiter', foreground: 'ce9178' },
                { token: 'identifier', foreground: '9cdcfe' },
                { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
            ],
            colors: {
                'editor.background': '#25262b',
                'editor.foreground': '#d4d4d4',
                'editor.lineHighlightBackground': '#2a2a2a',
                'editor.lineHighlight': '#2a2a2a',
                'editorCursor.foreground': '#569cd6',
                'editorWhitespace.foreground': '#3b3b3b',
                'editor.selectionBackground': '#264f78',
                'editor.selectionForeground': '#ffffff',
                'editor.wordHighlightBackground': '#575757',
                'editor.selectionHighlightBorder': '#569cd6',
            },
        };
    }

    // Light theme (default)
    return {
        rules: [
            { token: '', foreground: '333333' },
            { token: 'keyword', foreground: '7262FF', fontStyle: 'bold' },
            { token: 'operator.sql', foreground: '#24cf62', fontStyle: 'bold' },
            { token: 'number', foreground: '098658' },
            { token: 'string', foreground: 'A31515' },
            { token: 'delimiter', foreground: 'A31515' },
            { token: 'identifier', foreground: '001080' },
            { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        ],
        colors: {
            'editor.background': '#FFFFFF',
            'editor.foreground': '#333333',
            'editor.lineHighlightBackground': '#f8f8f8',
            'editor.lineHighlight': '#e0e0e0',
            'editorCursor.foreground': '#7262FF',
            'editorWhitespace.foreground': '#efefef',
            'editor.selectionBackground': '#E6E3FF',
            'editor.selectionForeground': '#333333',
            'editor.wordHighlightBackground': '#bcfeff',
            'editor.selectionHighlightBorder': '#7262FF',
        },
    };
};

export const registerCustomCompletionProvider = (
    monaco: Monaco,
    language: string,
    quoteChar: string,
    tables: string[],
    fields?: WarehouseTableFieldWithContext[],
    settings?: SqlEditorPreferences,
    availableParameters?: Record<
        string,
        {
            label: string;
            description?: string;
            default?: ParameterValue;
        }
    >,
) => {
    return monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems: (model, position) => {
            const wordUntilPosition = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: wordUntilPosition.startColumn,
                endColumn: wordUntilPosition.endColumn,
            };

            const textUntilPosition = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            const suggestions: languages.CompletionItem[] = [];

            // Add parameter completions with simplified logic
            if (availableParameters) {
                // Don't show parameter completions for $word patterns (like $param, $metric, $ld)
                // Only show for clean patterns: ${...}, ld.parameters, or plain $
                const isDollarWord =
                    /\$\w+$/.test(textUntilPosition) &&
                    !/\$$/.test(textUntilPosition);
                if (!isDollarWord) {
                    // Only add parameter completions for clean patterns
                    Object.keys(availableParameters).forEach((paramName) => {
                        const paramConfig = availableParameters[paramName];

                        // Use regex patterns to detect context and what to replace
                        const parameterPattern =
                            /\$\{(ld(?:\.(?:parameters(?:\.\w*)?|\w*))?)\}?$/;
                        const ldPattern =
                            /\b(ld(?:\.(?:parameters(?:\.\w*)?|\w*))?)$/;
                        // Pattern to detect any content inside ${} brackets
                        const insideBracketsPattern = /\$\{([^}]*?)$/;

                        const parameterMatch =
                            textUntilPosition.match(parameterPattern);
                        const ldMatch = textUntilPosition.match(ldPattern);
                        const insideBracketsMatch = textUntilPosition.match(
                            insideBracketsPattern,
                        );

                        let insertText: string;
                        let customRange = range;

                        if (parameterMatch) {
                            // Inside ${} with ld prefix - replace from the start of the match
                            const matchStart = textUntilPosition.lastIndexOf(
                                parameterMatch[1],
                            );
                            insertText = `ld.parameters.${paramName}`;
                            customRange = {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn: matchStart + 1,
                                endColumn: position.column,
                            };
                        } else if (insideBracketsMatch) {
                            // Inside ${} but not ld prefix - replace content inside brackets
                            const matchStart = insideBracketsMatch.index! + 2; // +2 to skip "${
                            insertText = `ld.parameters.${paramName}`;
                            customRange = {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn: matchStart + 1,
                                endColumn: position.column,
                            };
                        } else if (ldMatch) {
                            // Outside ${} - wrap with ${} and replace from start of ld
                            const matchStart = textUntilPosition.lastIndexOf(
                                ldMatch[1],
                            );
                            insertText = `\${ld.parameters.${paramName}}`;
                            customRange = {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn: matchStart + 1,
                                endColumn: position.column,
                            };
                        } else {
                            // Default case - be smart about existing $ prefix
                            const hasDollarPrefix = /\$$/.test(
                                textUntilPosition,
                            );
                            if (hasDollarPrefix) {
                                // If line ends with $, just add the bracketed parameter
                                insertText = `{ld.parameters.${paramName}}`;
                            } else {
                                // Otherwise add full parameter
                                insertText = `\${ld.parameters.${paramName}}`;
                            }
                        }

                        // Prioritize parameters when typing ld/parameters related text
                        const isRelevantContext =
                            parameterMatch ||
                            insideBracketsMatch ||
                            ldMatch ||
                            /(?:^|\W)(?:ld|parameters|\$)/i.test(
                                textUntilPosition,
                            );
                        const sortText = isRelevantContext
                            ? `0_param_${paramName}`
                            : `param_${paramName}`;

                        suggestions.push({
                            label: {
                                label: `ld.parameters.${paramName}`,
                                detail: paramConfig.description
                                    ? ` - ${paramConfig.description}`
                                    : '',
                            },
                            kind: monaco.languages.CompletionItemKind.Variable,
                            insertText,
                            range: customRange,
                            sortText,
                            detail: `Parameter: ${
                                paramConfig.label || paramName
                            }`,
                            documentation: paramConfig.description,
                        });
                    });
                }
            }

            const formatFieldName = (fieldName: string): string => {
                let formattedName = fieldName;

                // Apply quote preference (only always or never)
                // First apply case preference
                if (settings?.casePreference === 'lowercase') {
                    formattedName = formattedName.toLowerCase();
                } else if (settings?.casePreference === 'uppercase') {
                    formattedName = formattedName.toUpperCase();
                }

                // Then apply quote preference
                if (!settings || settings?.quotePreference === 'always') {
                    return `${quoteChar}${formattedName}${quoteChar}`;
                }

                return formattedName;
            };

            // Add field suggestions first (top priority)
            if (fields && fields.length > 0) {
                const fieldSuggestions: languages.CompletionItem[] = [];

                fields.forEach((field) => {
                    // Check if field has table context information
                    const hasTableContext =
                        'table' in field && 'schema' in field;
                    const tableContext = hasTableContext
                        ? ` from ${field.schema}.${field.table}`
                        : '';

                    const formattedFieldName = formatFieldName(field.name);
                    const displayName =
                        settings?.casePreference === 'lowercase'
                            ? field.name.toLowerCase()
                            : settings?.casePreference === 'uppercase'
                            ? field.name.toUpperCase()
                            : field.name;

                    fieldSuggestions.push({
                        label: `${displayName} (${field.type})${tableContext}`,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: formattedFieldName,
                        range,
                        sortText: `0${displayName}`, // High priority
                        detail: `Column: ${field.type}${tableContext}`,
                    });
                });

                // Deduplicate by label
                const fieldMap = new Map();
                fieldSuggestions.forEach((suggestion) => {
                    fieldMap.set(suggestion.label, suggestion);
                });
                suggestions.push(...fieldMap.values());
            }

            // Add table suggestions (lower priority)
            const tableSuggestions = tables.map((table) => {
                const parts = table.split('.');
                const typedParts = textUntilPosition.split('.');
                const insertParts = parts.slice(typedParts.length - 1);

                // Check if the last typed part is already quoted
                const lastTypedPart = typedParts[typedParts.length - 1];
                const isLastPartQuoted =
                    lastTypedPart.startsWith(`${quoteChar}`) &&
                    !lastTypedPart.endsWith(`${quoteChar}`);

                let insertText = insertParts.join('.');
                if (isLastPartQuoted) {
                    // Remove the opening quote from the first part to insert
                    insertText = insertText.replace(
                        new RegExp(`^${quoteChar}`),
                        '',
                    );
                }

                return {
                    label: table,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText,
                    range,
                    sortText: `1${table}`, // Lower priority with '1' prefix
                    detail: 'Table',
                };
            });
            suggestions.push(...tableSuggestions);

            return { suggestions };
        },
        triggerCharacters: ['.', '{'],
    });
};

export const generateTableCompletions = (
    quoteChar: string,
    data: { database: string; tablesBySchema: TablesBySchema },
    settings?: SqlEditorPreferences,
) => {
    if (!data) return;

    const database = data.database;

    // Helper function to format table names based on settings
    const formatTableName = (
        db: string,
        schema: string,
        table: string,
    ): string => {
        let formattedDb = db;
        let formattedSchema = schema;
        let formattedTable = table;

        if (!settings) {
            return `${quoteChar}${formattedDb}${quoteChar}.${quoteChar}${formattedSchema}${quoteChar}.${quoteChar}${formattedTable}${quoteChar}`;
        }

        // Apply case preference (only lowercase or uppercase)
        if (settings.casePreference === 'lowercase') {
            formattedDb = formattedDb.toLowerCase();
            formattedSchema = formattedSchema.toLowerCase();
            formattedTable = formattedTable.toLowerCase();
        } else if (settings.casePreference === 'uppercase') {
            formattedDb = formattedDb.toUpperCase();
            formattedSchema = formattedSchema.toUpperCase();
            formattedTable = formattedTable.toUpperCase();
        }

        // Apply quote preference (only always or never)
        if (settings.quotePreference === 'always') {
            return `${quoteChar}${formattedDb}${quoteChar}.${quoteChar}${formattedSchema}${quoteChar}.${quoteChar}${formattedTable}${quoteChar}`;
        }

        return `${formattedDb}.${formattedSchema}.${formattedTable}`;
    };

    const tablesList = data.tablesBySchema
        ?.map((s) =>
            Object.keys(s.tables).map((t) =>
                formatTableName(database, s.schema.toString(), t),
            ),
        )
        .flat();

    return tablesList;
};
