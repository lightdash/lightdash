import type { FunctionDefinition } from '@lightdash/formula';
import type { Monaco } from '@monaco-editor/react';
import type { IDisposable, languages } from 'monaco-editor';
import type { FieldCompletionItem } from './completions';
import { FORMULA_LANGUAGE_ID } from './language';

type FormulaHoverData = {
    fields: FieldCompletionItem[];
    functions: readonly FunctionDefinition[];
};

function formatFunctionSignature(fn: FunctionDefinition): string {
    if (fn.maxArgs === 0) return `${fn.name}()`;
    if (fn.maxArgs === Infinity) return `${fn.name}(arg1, arg2, ...)`;
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
    return `${fn.name}(${required}${optional})`;
}

export function registerFormulaHover(
    monaco: Monaco,
    { fields, functions }: FormulaHoverData,
): IDisposable {
    const functionsByName = new Map(
        functions.map((fn) => [fn.name.toUpperCase(), fn]),
    );
    const fieldsById = new Map(fields.map((f) => [f.id, f]));

    return monaco.languages.registerHoverProvider(FORMULA_LANGUAGE_ID, {
        provideHover: (model, position): languages.Hover | null => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const fn = functionsByName.get(word.word.toUpperCase());
            if (fn) {
                return {
                    range,
                    contents: [
                        { value: `**${formatFunctionSignature(fn)}**` },
                        { value: fn.description },
                        { value: `_${fn.category}_` },
                    ],
                };
            }

            const field = fieldsById.get(word.word);
            if (field) {
                return {
                    range,
                    contents: [
                        { value: `**${field.label}**` },
                        { value: `\`${field.id}\`` },
                    ],
                };
            }

            return null;
        },
    });
}
