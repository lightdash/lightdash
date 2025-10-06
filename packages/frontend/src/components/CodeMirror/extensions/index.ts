import {
    autocompletion,
    type CompletionSource,
} from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { linter, type Diagnostic } from '@codemirror/lint';
import { type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { lightdashExtension } from '../themes/lightdash';
import type { CodeMirrorLanguage } from '../types';

export interface ExtensionsConfig {
    language?: CodeMirrorLanguage;
    autocompletions?: CompletionSource[];
    diagnostics?: Diagnostic[];
    additionalExtensions?: Extension[];
    readOnly?: boolean;
    wrapEnabled?: boolean;
    showLineNumbers?: boolean;
    onSubmit?: () => void;
}

export const createExtensions = ({
    language,
    autocompletions,
    diagnostics,
    additionalExtensions = [],
    readOnly = false,
    wrapEnabled = false,
    showLineNumbers = true,
    onSubmit,
}: ExtensionsConfig) => {
    const extensions = [
        // Base extensions
        lightdashExtension,
        keymap.of([...defaultKeymap, indentWithTab]),

        // Editor settings
        EditorView.editable.of(!readOnly),

        // Additional extensions (e.g., JSON schema)
        ...additionalExtensions,
    ];

    // Line wrapping
    if (wrapEnabled) {
        extensions.push(EditorView.lineWrapping);
    }

    // Line numbers
    if (!showLineNumbers) {
        extensions.push(
            EditorView.theme({
                '.cm-gutters': {
                    display: 'none',
                },
            }),
        );
    }

    // Language support
    if (language === 'sql') {
        extensions.push(sql());
    } else if (language === 'json') {
        extensions.push(json());
    } else if (language === 'html') {
        extensions.push(html());
    }

    // Autocomplete
    if (autocompletions && autocompletions.length > 0) {
        extensions.push(
            autocompletion({
                override: autocompletions,
                activateOnTyping: true,
            }),
        );
    }

    // Diagnostics/Linting
    if (diagnostics && diagnostics.length > 0) {
        extensions.push(linter(() => diagnostics));
    }

    // Custom keyboard shortcuts
    if (onSubmit) {
        extensions.push(
            keymap.of([
                {
                    key: 'Mod-Enter',
                    run: () => {
                        onSubmit();
                        return true;
                    },
                },
            ]),
        );
    }

    return extensions;
};

// SQL dialect helpers - currently unused but kept for future warehouse-specific features
// export const getSQLDialect = (_dialect?: string): SQLDialect | undefined => {
//     // CodeMirror's SQL mode has built-in support for different dialects
//     // We can extend this as needed for warehouse-specific features
//     return undefined; // Use default SQL for now
// };
