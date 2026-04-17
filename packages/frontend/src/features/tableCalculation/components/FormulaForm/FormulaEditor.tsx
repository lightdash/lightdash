import {
    getItemMap,
    isField,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { listFunctions } from '@lightdash/formula';
import { Box, Text, useMantineColorScheme } from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    Editor,
    type BeforeMount,
    type EditorProps,
    type Monaco,
    type OnMount,
} from '@monaco-editor/react';
import type { IDisposable } from 'monaco-editor';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { getLightdashMonacoTheme } from '../../../sqlRunner/utils/monaco';
import '../../../../styles/monaco.css';
import styles from './FormulaEditor.module.css';
import {
    registerFormulaCompletions,
    type FieldCompletionItem,
} from './monaco/completions';
import { registerFormulaHover } from './monaco/hover';
import {
    FORMULA_LANGUAGE_ID,
    registerFormulaLanguage,
} from './monaco/language';

const stripEqualsPrefix = (value: string): string =>
    value.replace(/^=+\s*/, '');

const MONACO_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    quickSuggestions: true,
    contextmenu: false,
    automaticLayout: true,
    tabSize: 2,
    lineNumbers: 'off',
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    fixedOverflowWidgets: true,
    renderLineHighlight: 'none',
    fontFamily: 'var(--mantine-font-family-monospace)',
    fontSize: 13,
    scrollbar: {
        horizontal: 'hidden',
        vertical: 'auto',
        alwaysConsumeMouseWheel: false,
    },
};

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    initialContent?: string;
    onTextChange?: (text: string) => void;
    onBlur?: () => void;
    parseError?: string | null;
    isFullScreen?: boolean;
};

export const FormulaEditor: FC<Props> = ({
    explore,
    metricQuery,
    initialContent,
    onTextChange,
    onBlur,
    parseError,
    isFullScreen,
}) => {
    const { colorScheme } = useMantineColorScheme();

    const fieldItems: FieldCompletionItem[] = useMemo(() => {
        if (!explore) return [];

        const itemsMap = getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
            metricQuery.customDimensions,
        );

        const usedFieldIds = new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
        ]);

        return Object.entries(itemsMap)
            .filter(([id]) => usedFieldIds.has(id))
            .map(([id, fieldItem]) => ({
                id,
                label: isField(fieldItem)
                    ? fieldItem.label
                    : 'displayName' in fieldItem
                      ? (fieldItem.displayName ?? fieldItem.name)
                      : fieldItem.name,
            }));
    }, [explore, metricQuery]);

    const functionItems = useMemo(() => listFunctions(), []);

    // The `=` prefix is editor chrome, not part of the formula grammar. Strip
    // it from anything entering local state so the buffer and the stored
    // formula are always in sync, regardless of whether the user types `=X`
    // or we receive a legacy value that was double-prefixed.
    const [localValue, setLocalValue] = useState(
        stripEqualsPrefix(initialContent ?? ''),
    );
    const [debouncedValue] = useDebouncedValue(localValue, 250);
    const [monaco, setMonaco] = useState<Monaco | null>(null);

    // Keep latest callbacks accessible without retriggering effects when the
    // parent passes new function references on each render.
    const onBlurRef = useRef(onBlur);
    onBlurRef.current = onBlur;
    const onTextChangeRef = useRef(onTextChange);
    onTextChangeRef.current = onTextChange;

    useEffect(() => {
        if (initialContent === undefined) return;
        const stripped = stripEqualsPrefix(initialContent);
        if (stripped !== localValue) {
            setLocalValue(stripped);
        }
        // Only sync when parent-driven initialContent changes, not on local edits
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialContent]);

    useEffect(() => {
        onTextChangeRef.current?.(debouncedValue);
    }, [debouncedValue]);

    useEffect(() => {
        if (!monaco) return undefined;
        const completions = registerFormulaCompletions(monaco, {
            fields: fieldItems,
            functions: functionItems,
        });
        const hover = registerFormulaHover(monaco, {
            fields: fieldItems,
            functions: functionItems,
        });
        return () => {
            completions.dispose();
            hover.dispose();
        };
    }, [monaco, fieldItems, functionItems]);

    const monacoOptions = useMemo<EditorProps['options']>(() => {
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
        return {
            ...MONACO_OPTIONS,
            overflowWidgetsDomNode: container,
        };
    }, []);

    const beforeMount: BeforeMount = useCallback((m) => {
        registerFormulaLanguage(m);

        const lightTheme = getLightdashMonacoTheme('light');
        const darkTheme = getLightdashMonacoTheme('dark');

        m.editor.defineTheme('lightdash-light', {
            base: 'vs',
            inherit: true,
            rules: lightTheme.rules,
            colors: { ...lightTheme.colors },
        });
        m.editor.defineTheme('lightdash-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: darkTheme.rules,
            colors: { ...darkTheme.colors },
        });

        setMonaco(m);
    }, []);

    const blurDisposableRef = useRef<IDisposable | null>(null);
    const onMount: OnMount = useCallback((monacoEditor) => {
        blurDisposableRef.current?.dispose();
        blurDisposableRef.current = monacoEditor.onDidBlurEditorWidget(() => {
            // Flush latest editor text to the parent before validation fires.
            // Without this, a user who edits and blurs within the 250ms debounce
            // window would trigger validation against the stale parent state.
            onTextChangeRef.current?.(
                stripEqualsPrefix(monacoEditor.getValue()),
            );
            onBlurRef.current?.();
        });
    }, []);

    useEffect(() => {
        return () => {
            blurDisposableRef.current?.dispose();
        };
    }, []);

    if (!monacoOptions) return null;

    return (
        <Box className={styles.container}>
            <Box className={styles.editorWithPrefix}>
                <span className={styles.equalsPrefix}>=</span>
                <Box className={styles.editorInner}>
                    {localValue.length === 0 ? (
                        <Text
                            pos="absolute"
                            c="ldGray.5"
                            fz="xs"
                            className={styles.placeholderText}
                        >
                            e.g. IF(revenue {'>'} 1000, "high", "low")
                        </Text>
                    ) : null}
                    <Editor
                        beforeMount={beforeMount}
                        onMount={onMount}
                        value={localValue}
                        options={monacoOptions}
                        onChange={(v) =>
                            setLocalValue(stripEqualsPrefix(v ?? ''))
                        }
                        language={FORMULA_LANGUAGE_ID}
                        height={isFullScreen ? '300px' : '120px'}
                        width="100%"
                        theme={
                            colorScheme === 'dark'
                                ? 'lightdash-dark'
                                : 'lightdash-light'
                        }
                        wrapperProps={{ id: 'formula-editor' }}
                    />
                </Box>
            </Box>
            {parseError && (
                <Text className={styles.errorText}>{parseError}</Text>
            )}
        </Box>
    );
};
