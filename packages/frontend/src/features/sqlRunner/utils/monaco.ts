import { WarehouseTypes } from '@lightdash/common';
import type { EditorProps, Monaco } from '@monaco-editor/react';
import {
    bigqueryLanguageDefinition,
    snowflakeLanguageDefinition,
} from '@popsql/monaco-sql-languages';
import type { languages } from 'monaco-editor';
import { LanguageIdEnum, setupLanguageFeatures } from 'monaco-sql-languages';
import { analyzeCompletionContext } from './sqlCompletion/analyze';
import {
    getSqlSuggestions,
    type SqlSuggestionData,
    type SqlSuggestionKind,
} from './sqlCompletion/suggest';

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
            // Lightdash's context-aware provider replaces the generic one
            completionItems: { enable: false },
        });
    }
};

export const getLightdashMonacoTheme = (colorScheme: 'light' | 'dark') => {
    if (colorScheme === 'dark') {
        // Dracula-inspired dark theme with Lightdash purple accent
        return {
            rules: [
                { token: '', foreground: 'f8f8f2' },
                { token: 'keyword', foreground: '7262FF', fontStyle: 'bold' },
                {
                    token: 'operator.sql',
                    foreground: 'ffb86c',
                    fontStyle: 'bold',
                },
                { token: 'number', foreground: '50fa7b' },
                { token: 'string', foreground: 'ff79c6' },
                { token: 'delimiter', foreground: 'ff79c6' },
                { token: 'identifier', foreground: '8be9fd' },
                { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
            ],
            colors: {
                'editor.background': '#1e1e21',
                'editor.foreground': '#f8f8f2',
                'editor.lineHighlightBackground': '#26262a',
                'editor.lineHighlight': '#26262a',
                'editorCursor.foreground': '#7262FF',
                'editorWhitespace.foreground': '#3b3b3b',
                'editor.selectionBackground': '#3d3d5c',
                'editor.selectionForeground': '#ffffff',
                'editor.wordHighlightBackground': '#454545',
                'editor.selectionHighlightBorder': '#7262FF',
                // Subtle indentation guides
                'editorIndentGuide.background': '#303034',
                'editorIndentGuide.activeBackground': '#3a3a3a',
                // Bracket pair colors
                'editorBracketHighlight.foreground1': '#7262FF',
                'editorBracketHighlight.foreground2': '#ff79c6',
                'editorBracketHighlight.foreground3': '#50fa7b',
                'editorBracketHighlight.foreground4': '#ffb86c',
                'editorBracketHighlight.foreground5': '#8be9fd',
                'editorBracketHighlight.foreground6': '#bd93f9',
                // Line numbers
                'editorLineNumber.foreground': '#55555c',
                'editorLineNumber.activeForeground': '#9a9aa3',
                // Gutter
                'editorGutter.background': '#1e1e21',
            },
        };
    }

    // Vibrant light theme with Lightdash purple accent
    return {
        rules: [
            { token: '', foreground: '24292e' },
            { token: 'keyword', foreground: '7262FF', fontStyle: 'bold' },
            { token: 'operator.sql', foreground: 'e85d04', fontStyle: 'bold' },
            { token: 'number', foreground: '0d9649' },
            { token: 'string', foreground: 'd6336c' },
            { token: 'delimiter', foreground: 'd6336c' },
            { token: 'identifier', foreground: '0078d4' },
            { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        ],
        colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#24292e',
            'editor.lineHighlightBackground': '#f4f4f5',
            'editor.lineHighlight': '#f4f4f5',
            'editorCursor.foreground': '#7262FF',
            'editorWhitespace.foreground': '#e1e4e8',
            'editor.selectionBackground': '#E6E3FF',
            'editor.selectionForeground': '#24292e',
            'editor.wordHighlightBackground': '#dce6f0',
            'editor.selectionHighlightBorder': '#7262FF',
            // Subtle indentation guides
            'editorIndentGuide.background': '#ebebee',
            'editorIndentGuide.activeBackground': '#dcdce0',
            // Bracket pair colors
            'editorBracketHighlight.foreground1': '#7262FF',
            'editorBracketHighlight.foreground2': '#d6336c',
            'editorBracketHighlight.foreground3': '#0d9649',
            'editorBracketHighlight.foreground4': '#e85d04',
            'editorBracketHighlight.foreground5': '#0078d4',
            'editorBracketHighlight.foreground6': '#8b5cf6',
            // Line numbers
            'editorLineNumber.foreground': '#a1a1aa',
            'editorLineNumber.activeForeground': '#71717a',
            // Gutter
            'editorGutter.background': '#ffffff',
        },
    };
};

export const registerCustomCompletionProvider = (
    monaco: Monaco,
    language: string,
    data: SqlSuggestionData,
) => {
    const { CompletionItemKind, CompletionItemInsertTextRule } =
        monaco.languages;
    const kinds: Record<SqlSuggestionKind, languages.CompletionItemKind> = {
        keyword: CompletionItemKind.Keyword,
        function: CompletionItemKind.Function,
        column: CompletionItemKind.Field,
        table: CompletionItemKind.Class,
        schema: CompletionItemKind.Module,
        database: CompletionItemKind.Folder,
        alias: CompletionItemKind.Variable,
        parameter: CompletionItemKind.Variable,
    };
    return monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: ['.', '{', ' ', '$'],
        provideCompletionItems: (model, position, completionContext) => {
            const line = model.getLineContent(position.lineNumber);
            const context = analyzeCompletionContext(
                model.getValue(),
                model.getOffsetAt(position),
                data.quoteChar,
            );
            const suggestions = getSqlSuggestions({
                context,
                linePrefix: line.slice(0, position.column - 1),
                nextChar: line.charAt(position.column - 1),
                triggerCharacter: completionContext.triggerCharacter ?? null,
                data,
            });
            return {
                suggestions: suggestions.map(
                    (item): languages.CompletionItem => ({
                        label: {
                            label: item.label,
                            detail: item.detail ?? undefined,
                            description: item.description ?? undefined,
                        },
                        kind: kinds[item.kind],
                        insertText: item.insertText,
                        insertTextRules: item.isSnippet
                            ? CompletionItemInsertTextRule.InsertAsSnippet
                            : undefined,
                        filterText: item.filterText ?? undefined,
                        command: item.triggersSuggest
                            ? {
                                  id: 'editor.action.triggerSuggest',
                                  title: 'Suggest',
                              }
                            : undefined,
                        sortText: item.sortText,
                        documentation: item.documentation ?? undefined,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: item.range.startColumn,
                            endColumn: item.range.endColumn,
                        },
                    }),
                ),
            };
        },
    });
};
