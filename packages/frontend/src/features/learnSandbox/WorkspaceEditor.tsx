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
import { insertSnippet, insertionPoint } from './snippetInsertion';

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
    // one character a tick, directly under the key it extends (see
    // snippetInsertion.ts), scrolled into view and highlighted for a moment
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
        const before = model.getValue();
        const point = insertionPoint(before, value);
        if (before.includes(point.text)) return;
        // What the file must read once the snippet is in, whatever happens
        // on the way there.
        const intended = insertSnippet(before, value);
        const start = point.offset + point.prefix.length;
        let offset = point.offset;
        const insertHere = (text: string) => {
            const at = model.getPositionAt(offset);
            ed.executeEdits('learn-tour', [
                {
                    range: {
                        startLineNumber: at.lineNumber,
                        startColumn: at.column,
                        endLineNumber: at.lineNumber,
                        endColumn: at.column,
                    },
                    text,
                    forceMoveMarkers: true,
                },
            ]);
            offset += text.length;
        };
        const chars = [...point.text];
        const wrapper = wrapperRef.current;
        let index = 0;
        let timer: number | undefined;
        let cancelled = false;
        let firstLine = 1;
        const finish = (written = false) => {
            const end = model.getPositionAt(offset);
            if (point.suffix && !written) insertHere(point.suffix);
            onChangeRef.current(model.getValue());
            ed.setPosition(end);
            ed.revealLineInCenter(end.lineNumber);
            const added = ed.createDecorationsCollection([
                {
                    range: {
                        startLineNumber: firstLine,
                        startColumn: 1,
                        endLineNumber: end.lineNumber,
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
            // Anything else touching the model while the snippet types (the
            // learner's own keystrokes, a reset from outside) would leave
            // the running offset pointing at the wrong place. Stop animating
            // and write the intended content in one edit instead.
            const typedSoFar = chars.slice(0, index).join('');
            if (
                model.getValue().slice(start, start + typedSoFar.length) !==
                    typedSoFar ||
                model.getValue().length !==
                    before.length + point.prefix.length + typedSoFar.length
            ) {
                ed.executeEdits('learn-tour', [
                    {
                        range: model.getFullModelRange(),
                        text: intended,
                        forceMoveMarkers: true,
                    },
                ]);
                offset = start + point.text.length;
                index = chars.length;
                finish(true);
                return;
            }
            insertHere(chars[index]);
            index += 1;
            ed.revealLineInCenter(model.getPositionAt(offset).lineNumber);
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
        if (point.prefix) insertHere(point.prefix);
        firstLine = model.getPositionAt(offset).lineNumber;
        if (chars.length === 0) finish();
        else tick();
        // `typingRef` is set before the first tick returns control, and
        // stays set until `finish`: while it is, the editor's own change
        // events are not passed up (see `handleEditorChange`).
    }, []);

    // The page holds the file as a controlled value. Reporting every typed
    // character would have it hand Monaco back a value already a character
    // or two stale, Monaco would reset to it, and the snippet would land
    // scrambled (seen on slower machines). While the tour types, changes
    // stay here; `finish` reports the final content once.
    const handleEditorChange = useCallback((next: string | undefined) => {
        if (typingRef.current) return;
        onChangeRef.current(next ?? '');
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
                    onChange={handleEditorChange}
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
