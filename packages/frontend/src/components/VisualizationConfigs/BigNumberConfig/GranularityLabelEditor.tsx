import {
    getDefaultZIndex,
    Input,
    Paper,
    Text,
    useMantineColorScheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    Editor,
    type BeforeMount,
    type EditorProps,
    type Monaco,
    type OnMount,
} from '@monaco-editor/react';
import { type editor, type IDisposable, type languages } from 'monaco-editor';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useDeepCompareEffect } from 'react-use';
import { getLightdashMonacoTheme } from '../../../features/sqlRunner/utils/monaco';
import '../../../styles/monaco.css';
import styles from './GranularityLabelEditor.module.css';

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
    automaticLayout: true,
    tabSize: 2,
    lineNumbers: 'off',
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    fixedOverflowWidgets: true,
};

let completionProviderDisposable: IDisposable | null = null;

const registerGranularityCompletionProvider = (
    monaco: Monaco,
    language: string,
    fields: string[],
) => {
    if (completionProviderDisposable) {
        completionProviderDisposable.dispose();
    }
    completionProviderDisposable =
        monaco.languages.registerCompletionItemProvider(language, {
            provideCompletionItems: (model, position) => {
                const wordUntilPosition = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: wordUntilPosition.startColumn,
                    endColumn: wordUntilPosition.endColumn,
                };

                const suggestions: languages.CompletionItem[] = fields.map(
                    (field) => {
                        const textBeforeCursor = model.getValueInRange({
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: position.column - 1,
                            endColumn: position.column,
                        });
                        const insertText =
                            textBeforeCursor === '$'
                                ? `{${field}.granularity} `
                                : `\${${field}.granularity}`;

                        return {
                            label: `${field}.granularity`,
                            kind: monaco.languages.CompletionItemKind.Variable,
                            insertText,
                            range,
                            detail: 'Date granularity (day, week, month...)',
                        };
                    },
                );

                return { suggestions };
            },
            triggerCharacters: ['$'],
        });
};

const EDITOR_HEIGHT = 35;

type GranularityLabelEditorProps = {
    label: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    fields: string[];
    readOnly?: boolean;
};

export const GranularityLabelEditor: FC<GranularityLabelEditorProps> = ({
    label,
    value,
    placeholder,
    onChange,
    fields,
    readOnly = false,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const [localValue, setLocalValue] = useState(value);
    const [debouncedValue] = useDebouncedValue(localValue, 500);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    // Sync external value changes (e.g., reset)
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Push debounced value to parent
    useEffect(() => {
        if (debouncedValue !== value) {
            onChange(debouncedValue);
        }
    }, [debouncedValue, onChange, value]);

    const [monacoOptions, setMonacoOptions] = useState<
        EditorProps['options'] | undefined
    >();

    useDeepCompareEffect(() => {
        const containerId = 'monaco-overflow-container';
        let container = document.getElementById(containerId);
        if (!container) {
            const wrapper = document.createElement('div');
            wrapper.className = 'monaco-editor';
            container = document.createElement('div');
            container.id = containerId;
            wrapper.appendChild(container);
            document.getElementById('root')?.appendChild(wrapper);
        }
        setMonacoOptions({
            ...MONACO_DEFAULT_OPTIONS,
            overflowWidgetsDomNode: container,
            readOnly,
        });
    }, [monacoOptions, readOnly]);

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerGranularityCompletionProvider(monaco, 'plaintext', fields);

            const lightTheme = getLightdashMonacoTheme('light');
            const darkTheme = getLightdashMonacoTheme('dark');

            monaco.editor.defineTheme('lightdash-light', {
                base: 'vs',
                inherit: true,
                rules: [],
                colors: { ...lightTheme.colors },
            });
            monaco.editor.defineTheme('lightdash-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: { ...darkTheme.colors },
            });
        },
        [fields],
    );

    const onMount: OnMount = useCallback((editor) => {
        editorRef.current = editor;
    }, []);

    if (!monacoOptions) return null;

    return (
        <Input.Wrapper label={label}>
            <Paper
                className={styles.editorWrapper}
                radius="sm"
                withBorder
                pos="relative"
            >
                {localValue.length === 0 && placeholder ? (
                    <Text
                        ml="sm"
                        pos="absolute"
                        c="ldGray.5"
                        fz="sm"
                        className={styles.placeholderText}
                        style={{ zIndex: getDefaultZIndex('overlay') }}
                    >
                        {placeholder}
                    </Text>
                ) : null}
                <Editor
                    beforeMount={beforeMount}
                    onMount={onMount}
                    value={localValue}
                    options={monacoOptions}
                    onChange={(v) => setLocalValue(v ?? '')}
                    language="plaintext"
                    height={`${EDITOR_HEIGHT}px`}
                    width="100%"
                    theme={
                        colorScheme === 'dark'
                            ? 'lightdash-dark'
                            : 'lightdash-light'
                    }
                    wrapperProps={{
                        id: 'granularity-label-editor',
                    }}
                />
            </Paper>
        </Input.Wrapper>
    );
};
