import { lightdashDbtYamlSchema } from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import type { editor } from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';
import { useCallback, useRef, type FC } from 'react';
import { type TourEditable } from '../../components/common/GuidedTour/GuidedTour';
import Editor, {
    type BeforeMount,
    type Monaco,
    type OnMount,
} from '../../components/MonacoEditor';
import { useEditorTheme } from '../../hooks/useEditorTheme';
import {
    getLightdashMonacoTheme,
    MONACO_DEFAULT_OPTIONS,
} from '../sqlRunner/utils/monaco';
// eslint-disable-next-line css-modules/no-unused-class -- classes used from FileTree.tsx
import styles from './LearnWorkspace.module.css';

/** Registers the dbt YAML schema against Monaco once per session (see
 * CodeEditorPane's configureYamlSchema, which isn't exported). Re-running
 * `update` on an existing registration is harmless. */
let yamlConfiguration: ReturnType<typeof configureMonacoYaml> | undefined;
const configureLearnYaml = (monaco: Monaco) => {
    const options = {
        enableSchemaRequest: false,
        schemas: [
            {
                uri: 'https://schemas.lightdash.com/lightdash/lightdash-dbt-2.0.json',
                fileMatch: ['*.yml', '*.yaml'],
                schema: lightdashDbtYamlSchema as Record<string, unknown>,
            },
        ],
    };
    if (yamlConfiguration) {
        void yamlConfiguration.update(options);
    } else {
        yamlConfiguration = configureMonacoYaml(monaco, options);
    }
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
    tourSuggestion?: string;
};

const WorkspaceEditor: FC<WorkspaceEditorProps> = ({
    path,
    content,
    editable,
    saving,
    dirty,
    onChange,
    onBlur,
    tourSuggestion,
}) => {
    const wrapperRef = useRef<HTMLDivElement & TourEditable>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const { monaco: monacoTheme } = useEditorTheme();

    const appendToEditor = useCallback(
        (value: string) => {
            const ed = editorRef.current;
            if (!ed) return;
            const model = ed.getModel();
            if (!model) return;
            const current = model.getValue();
            const prefix =
                current.length === 0 || current.endsWith('\n') ? '' : '\n';
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
                    text: prefix + value,
                    forceMoveMarkers: true,
                },
            ]);
            onChange(model.getValue());
        },
        [onChange],
    );

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
            ed.onDidBlurEditorText(() => onBlur());
        },
        [appendToEditor, onBlur],
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
                {...(tourSuggestion
                    ? { 'data-tour-suggest': tourSuggestion }
                    : {})}
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
