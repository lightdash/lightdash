import type { CompletionSource } from '@codemirror/autocomplete';
import type { Diagnostic } from '@codemirror/lint';

export type CodeMirrorLanguage = 'sql' | 'json' | 'html' | 'text';

export interface BaseCodeMirrorProps {
    value: string;
    onChange?: (value: string) => void;
    onBlur?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    height?: string;
    showLineNumbers?: boolean;
    placeholder?: string;
}

export interface CodeMirrorEditorProps extends BaseCodeMirrorProps {
    language?: CodeMirrorLanguage;
    autocompletions?: CompletionSource[];
    diagnostics?: Diagnostic[];
    debounceMs?: number;
    wrapEnabled?: boolean;
}
