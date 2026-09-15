import { lightdashDbtYamlSchema } from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { type TourEditable } from '../../components/common/GuidedTour/GuidedTour';
import Editor, {
    type BeforeMount,
    type Monaco,
    type OnMount,
} from '../../components/MonacoEditor';
import { useEditorTheme } from '../../hooks/useEditorTheme';
import { configureLightdashYaml } from '../../utils/monacoYaml';
import {
    getLightdashMonacoTheme,
    MONACO_DEFAULT_OPTIONS,
} from '../sqlRunner/utils/monaco';
// eslint-disable-next-line css-modules/no-unused-class -- classes used from FileTree.tsx
import styles from './LearnWorkspace.module.css';

/** Registers the dbt YAML schema against the single shared monaco-yaml
 * instance (see configureLightdashYaml — monaco-yaml only allows one
 * configured instance per monaco module, so every editor must route
 * through that shared singleton rather than holding its own). */
const configureLearnYaml = (monaco: Monaco) => {
    configureLightdashYaml(monaco, {
        enableSchemaRequest: false,
        schemas: [
            {
                uri: 'https://schemas.lightdash.com/lightdash/lightdash-dbt-2.0.json',
                fileMatch: ['*.yml', '*.yaml'],
                schema: lightdashDbtYamlSchema as Record<string, unknown>,
            },
        ],
    });
};

type EditorState = 'saved' | 'dirty' | 'saving' | 'readonly';

const STATE_LABELS: Record<EditorState, string> = {
    saved: 'Saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    readonly: 'Read-only',
};

type WorkspaceEditorProps = {
    path: string;
    content: string;
    editable: boolean;
    saving: boolean;
    dirty: boolean;
    onChange: (content: string) => void;
    onBlur: () => void;
};

/** Milliseconds per character when the tour types a snippet in. */
const TOUR_TYPE_INTERVAL_MS = 24;
/** How long the lines the tour added stay highlighted. */
const TOUR_INSERT_HIGHLIGHT_MS = 4000;

const WorkspaceEditor: FC<WorkspaceEditorProps> = ({
    path,
    content,
    editable,
    saving,
    dirty,
    onChange,
    onBlur,
}) => {
    const wrapperRef = useRef<HTMLDivElement & TourEditable>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const { monaco: monacoTheme } = useEditorTheme();

    // onMount/appendToEditor are wired up once (Monaco calls onMount a
    // single time, and the tour attaches appendToEditor to the DOM node
    // once), so they must read the latest onChange/onBlur through a ref
    // rather than close over the props from the render that created them.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onBlurRef = useRef(onBlur);
    onBlurRef.current = onBlur;

    // The tour's "Use it" types the snippet in rather than dropping it in:
    // one character a tick, scrolled into view and highlighted for a moment
    // afterwards, so the learner sees what was added and where. Each tick
    // fires an input event on the wrapper, which holds the tour's typed-step
    // advance until the last character has landed.
    const typingRef = useRef<{ cancel: () => void } | null>(null);
    useEffect(() => () => typingRef.current?.cancel(), []);
    const appendToEditor = useCallback((value: string) => {
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (!model) return;
        // A second press while the snippet is still being typed, or once it
        // is already there, adds nothing: the learner (and the smoke) can
        // press Use it again without doubling the metric.
        if (typingRef.current) return;
        if (model.getValue().endsWith(value)) return;
        const insertAtEnd = (text: string) => {
            const line = model.getLineCount();
            const col = model.getLineMaxColumn(line);
            ed.executeEdits('learn-tour', [
                {
                    range: {
                        startLineNumber: line,
                        startColumn: col,
                        endLineNumber: line,
                        endColumn: col,
                    },
                    text,
                    forceMoveMarkers: true,
                },
            ]);
        };
        const current = model.getValue();
        const prefix =
            current.length === 0 || current.endsWith('\n') ? '' : '\n';
        if (prefix) insertAtEnd(prefix);
        const firstLine = model.getLineCount();
        const chars = [...value];
        const wrapper = wrapperRef.current;
        let index = 0;
        let timer: number | undefined;
        let cancelled = false;
        const finish = () => {
            const lastLine = model.getLineCount();
            onChangeRef.current(model.getValue());
            ed.setPosition({
                lineNumber: lastLine,
                column: model.getLineMaxColumn(lastLine),
            });
            ed.revealLineInCenter(lastLine);
            const added = ed.createDecorationsCollection([
                {
                    range: {
                        startLineNumber: firstLine,
                        startColumn: 1,
                        endLineNumber: lastLine,
                        endColumn: 1,
                    },
                    options: { isWholeLine: true, className: styles.tourInsert },
                },
            ]);
            window.setTimeout(() => added.clear(), TOUR_INSERT_HIGHLIGHT_MS);
            // The caret has to end up where typing would leave it: the page
            // autosaves on blur, and text dropped into an editor that never
            // held focus would never blur, so it would sit unsaved until the
            // learner ran a command.
            ed.focus();
            typingRef.current = null;
        };
        const tick = () => {
            if (cancelled) return;
            insertAtEnd(chars[index]);
            index += 1;
            ed.revealLineInCenter(model.getLineCount());
            wrapper?.dispatchEvent(new Event('input', { bubbles: true }));
            if (index < chars.length) {
                timer = window.setTimeout(tick, TOUR_TYPE_INTERVAL_MS);
            } else {
                finish();
            }
        };
        typingRef.current = {
            cancel: () => {
                cancelled = true;
                window.clearTimeout(timer);
            },
        };
        if (chars.length === 0) finish();
        else tick();
    }, []);

    const handleBeforeMount: BeforeMount = useCallback((monaco) => {
        monaco.editor.defineTheme('lightdash-light', {
            base: 'vs',
            inherit: true,
            ...getLightdashMonacoTheme('light'),
        });
        monaco.editor.defineTheme('lightdash-dark', {
            base: 'vs-dark',
            inherit: true,
            ...getLightdashMonacoTheme('dark'),
        });
        configureLearnYaml(monaco);
    }, []);

    const onMount: OnMount = useCallback(
        (ed) => {
            editorRef.current = ed;
            if (wrapperRef.current) {
                wrapperRef.current.tourEditor = {
                    getValue: () => ed.getValue(),
                    setValue: appendToEditor,
                };
            }
            ed.onDidBlurEditorText(() => onBlurRef.current());
        },
        [appendToEditor],
    );

    const state: EditorState = !editable
        ? 'readonly'
        : saving
          ? 'saving'
          : dirty
            ? 'dirty'
            : 'saved';

    return (
        <Box className={styles.editorPane}>
            <Box className={styles.editorHead} data-learn-editor-state={state}>
                <Text
                    className={styles.editorPath}
                    fz="sm"
                    c="ldGray.6"
                    title={path}
                >
                    {path}
                </Text>
                <Text fz="xs" c={editable ? 'ldGray.6' : 'ldGray.5'}>
                    {editable ? STATE_LABELS[state] : 'Read-only'}
                </Text>
            </Box>
            <Box
                ref={wrapperRef}
                className={styles.editorBody}
                data-tour-anchor="workspace-editor"
                data-tour-hint="Edit the file"
                data-tour-input="true"
                data-tour-suggest="# Edited in the Learn workspace"
            >
                <Editor
                    path={path}
                    language="yaml"
                    value={content}
                    theme={monacoTheme}
                    beforeMount={handleBeforeMount}
                    onMount={onMount}
                    onChange={(v) => onChange(v ?? '')}
                    options={{
                        ...MONACO_DEFAULT_OPTIONS,
                        readOnly: !editable,
                    }}
                />
            </Box>
        </Box>
    );
};

export default WorkspaceEditor;
