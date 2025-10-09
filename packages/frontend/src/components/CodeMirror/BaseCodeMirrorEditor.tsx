import type { ViewUpdate } from '@codemirror/view';
import { useDebouncedValue } from '@mantine/hooks';
import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { useCallback, useEffect, useState, type FC } from 'react';
import { createExtensions, type ExtensionsConfig } from './extensions';

export interface BaseCodeMirrorEditorProps
    extends Omit<ReactCodeMirrorProps, 'extensions' | 'onSubmit'>,
        Omit<ExtensionsConfig, 'readOnly' | 'wrapEnabled' | 'showLineNumbers'> {
    debounceMs?: number;
    onSubmit?: () => void;
    readOnly?: boolean;
    wrapEnabled?: boolean;
    showLineNumbers?: boolean;
}

export const BaseCodeMirrorEditor: FC<BaseCodeMirrorEditorProps> = ({
    value,
    onChange,
    onBlur,
    debounceMs = 0,
    height,
    minHeight = '100px',
    maxHeight,
    placeholder,
    language,
    autocompletions,
    diagnostics,
    readOnly = false,
    wrapEnabled = false,
    showLineNumbers = true,
    onSubmit,
    ...rest
}) => {
    const [localValue, setLocalValue] = useState(value);
    const [debouncedValue] = useDebouncedValue(localValue, debounceMs);

    // Sync external value changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Call onChange with debounced value
    // Note: When debounced, we don't have a ViewUpdate object, so we pass undefined
    // This is acceptable since onChange from uiw/react-codemirror has ViewUpdate as optional in practice
    useEffect(() => {
        if (
            debounceMs > 0 &&
            debouncedValue !== value &&
            debouncedValue !== undefined &&
            onChange
        ) {
            onChange(debouncedValue, undefined as any);
        }
    }, [debouncedValue, debounceMs, onChange, value]);

    const handleChange = useCallback(
        (val: string, viewUpdate: ViewUpdate) => {
            setLocalValue(val);
            if (debounceMs === 0) {
                onChange?.(val, viewUpdate);
            }
        },
        [debounceMs, onChange],
    );

    const handleBlur = useCallback(
        (event: React.FocusEvent<HTMLDivElement>) => {
            onBlur?.(event);
        },
        [onBlur],
    );

    const extensions = createExtensions({
        language,
        autocompletions,
        diagnostics,
        readOnly,
        wrapEnabled,
        showLineNumbers,
        onSubmit,
    });

    return (
        <CodeMirror
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            extensions={extensions}
            height={height}
            minHeight={minHeight}
            maxHeight={maxHeight}
            placeholder={placeholder}
            basicSetup={{
                lineNumbers: showLineNumbers,
                highlightActiveLineGutter: showLineNumbers,
                highlightSpecialChars: true,
                history: true,
                foldGutter: true,
                drawSelection: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                syntaxHighlighting: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                closeBracketsKeymap: true,
                defaultKeymap: true,
                searchKeymap: true,
                historyKeymap: true,
                foldKeymap: true,
                completionKeymap: true,
                lintKeymap: true,
            }}
            {...rest}
        />
    );
};
