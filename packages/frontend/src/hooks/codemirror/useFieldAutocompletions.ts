import {
    type CompletionContext,
    type CompletionSource,
} from '@codemirror/autocomplete';
import { useMemo } from 'react';

/**
 * Hook for field variable autocompletions
 * Used by: Custom Vis, Tooltip Config
 */
export const useFieldAutocompletions = (
    fields: string[],
): CompletionSource | undefined => {
    return useMemo(() => {
        if (!fields || fields.length === 0) return undefined;

        return (context: CompletionContext) => {
            const textUntilPosition = context.state.doc.sliceString(
                Math.max(0, context.pos - 10),
                context.pos,
            );

            // Check if we're typing a field variable
            const match = textUntilPosition.match(/\$\{?[\w.]*$/);
            if (!match) return null;

            const word = context.matchBefore(/[\w.${}]*$/);
            if (!word) return null;

            // Determine the appropriate insert text based on context
            const endsWithDollar = textUntilPosition.endsWith('$');
            const insideBrackets = textUntilPosition.includes('${');

            return {
                from: word.from,
                options: fields.map((field) => {
                    let insertText: string;
                    if (insideBrackets) {
                        // Already inside ${}, just add the field name
                        insertText = `${field}}`;
                    } else if (endsWithDollar) {
                        // Just typed $, add {field}
                        insertText = `{${field}}`;
                    } else {
                        // Default case, add full ${field}
                        insertText = `\${${field}}`;
                    }

                    return {
                        label: field,
                        type: 'variable',
                        apply: insertText,
                    };
                }),
            };
        };
    }, [fields]);
};
