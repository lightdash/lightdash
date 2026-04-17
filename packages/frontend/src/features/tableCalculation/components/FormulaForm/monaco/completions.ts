import type { FunctionDefinition } from '@lightdash/formula';
import type { Monaco } from '@monaco-editor/react';
import type { IDisposable, languages } from 'monaco-editor';
import { FORMULA_LANGUAGE_ID } from './language';

export type FieldCompletionItem = {
    id: string;
    label: string;
};

type FormulaCompletionData = {
    fields: FieldCompletionItem[];
    functions: readonly FunctionDefinition[];
};

function buildFunctionSnippet(fn: FunctionDefinition): string {
    if (fn.maxArgs === 0) return `${fn.name}()$0`;
    return `${fn.name}($0)`;
}

function formatFunctionArgs(fn: FunctionDefinition): string {
    if (fn.maxArgs === 0) return '()';
    if (fn.maxArgs === Infinity) return '(arg1, arg2, ...)';
    const required = Array.from(
        { length: fn.minArgs },
        (_, i) => `arg${i + 1}`,
    ).join(', ');
    const optional =
        fn.maxArgs > fn.minArgs
            ? `, [${Array.from(
                  { length: fn.maxArgs - fn.minArgs },
                  (_, i) => `optional${i + 1}`,
              ).join(', ')}]`
            : '';
    return `(${required}${optional})`;
}

export function registerFormulaCompletions(
    monaco: Monaco,
    { fields, functions }: FormulaCompletionData,
): IDisposable {
    return monaco.languages.registerCompletionItemProvider(
        FORMULA_LANGUAGE_ID,
        {
            provideCompletionItems: (model, position) => {
                const wordUntilPosition = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: wordUntilPosition.startColumn,
                    endColumn: wordUntilPosition.endColumn,
                };

                const fieldSuggestions: languages.CompletionItem[] = fields.map(
                    (field) => ({
                        label: { label: field.label, description: field.id },
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: field.id,
                        filterText: `${field.id} ${field.label}`,
                        detail: 'Field',
                        sortText: `0_${field.label}`,
                        range,
                    }),
                );

                const functionSuggestions: languages.CompletionItem[] =
                    functions.map((fn) => ({
                        label: { label: fn.name, description: fn.description },
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: buildFunctionSnippet(fn),
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule
                                .InsertAsSnippet,
                        detail: `${fn.category} · ${fn.name}${formatFunctionArgs(fn)}`,
                        documentation: { value: fn.description },
                        sortText: `1_${fn.name}`,
                        range,
                    }));

                return {
                    suggestions: [...fieldSuggestions, ...functionSuggestions],
                };
            },
        },
    );
}
