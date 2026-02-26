import { lightdashDbtYamlSchema } from '@lightdash/common';
import {
    Box,
    Loader,
    Stack,
    Text,
    useMantineColorScheme,
} from '@mantine-8/core';
import Editor, {
    type BeforeMount,
    type Monaco,
    type OnMount,
} from '@monaco-editor/react';
import { IconFileOff } from '@tabler/icons-react';
import type { editor } from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    getLightdashMonacoTheme,
    MONACO_DEFAULT_OPTIONS,
} from '../../../sqlRunner/utils/monaco';
import { detectLanguage } from '../../utils/fileLanguageDetection';
// eslint-disable-next-line css-modules/no-unused-class -- classes used in this component
import styles from './CodeEditorPane.module.css';
import EditorToolbar from './EditorToolbar';

// Configure monaco-yaml with schema once at module level
let yamlConfigured = false;
const configureYamlSchema = (monaco: Monaco) => {
    if (yamlConfigured) return;
    yamlConfigured = true;

    configureMonacoYaml(monaco, {
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

type CodeEditorPaneProps = {
    filePath: string | null;
    content: string;
    isLoading: boolean;
    hasUnsavedChanges: boolean;
    isProtectedBranch: boolean;
    canManage: boolean;
    isSaving: boolean;
    onChange: (content: string) => void;
    onSave: () => void;
    onCreatePR: () => void;
};

const CodeEditorPane: FC<CodeEditorPaneProps> = ({
    filePath,
    content,
    isLoading,
    hasUnsavedChanges,
    isProtectedBranch,
    canManage,
    isSaving,
    onChange,
    onSave,
    onCreatePR,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    const language = useMemo(
        () => (filePath ? detectLanguage(filePath) : 'plaintext'),
        [filePath],
    );

    const isReadOnly = !canManage || isProtectedBranch;

    // Update Monaco theme when color scheme changes
    useEffect(() => {
        if (monacoRef.current) {
            const themeName =
                colorScheme === 'dark' ? 'lightdash-dark' : 'lightdash-light';
            monacoRef.current.editor.setTheme(themeName);
        }
    }, [colorScheme]);

    const handleBeforeMount: BeforeMount = useCallback((monaco) => {
        // Define both light and dark themes
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

        // Configure YAML schema validation
        configureYamlSchema(monaco);
    }, []);

    const handleEditorMount: OnMount = useCallback((editorInstance, monaco) => {
        editorRef.current = editorInstance;
        monacoRef.current = monaco;

        // Focus the editor when mounted
        editorInstance.focus();
    }, []);

    const handleEditorChange = useCallback(
        (value: string | undefined) => {
            onChange(value ?? '');
        },
        [onChange],
    );

    const editorOptions = useMemo(
        () => ({
            ...MONACO_DEFAULT_OPTIONS,
            readOnly: isReadOnly,
            lineNumbers: 'on' as const,
            renderLineHighlight: 'all' as const,
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            wordWrap: 'on' as const,
            scrollbar: {
                horizontal: 'hidden' as const,
                verticalScrollbarSize: 8,
            },
        }),
        [isReadOnly],
    );

    return (
        <Box className={styles.editorPane}>
            <Box className={styles.toolbar}>
                <EditorToolbar
                    filePath={filePath}
                    hasUnsavedChanges={hasUnsavedChanges}
                    isProtectedBranch={isProtectedBranch}
                    canManage={canManage}
                    isSaving={isSaving}
                    onSave={onSave}
                    onCreatePR={onCreatePR}
                />
            </Box>

            {isLoading ? (
                <Stack align="center" justify="center" flex={1}>
                    <Loader size="lg" color="gray" />
                    <Text c="ldGray.5">Loading file...</Text>
                </Stack>
            ) : filePath ? (
                <Box className={styles.editorContainer}>
                    <Editor
                        height="100%"
                        language={language}
                        value={content}
                        theme={
                            colorScheme === 'dark'
                                ? 'lightdash-dark'
                                : 'lightdash-light'
                        }
                        options={editorOptions}
                        beforeMount={handleBeforeMount}
                        onMount={handleEditorMount}
                        onChange={handleEditorChange}
                        loading={<Loader color="gray" size="sm" />}
                    />
                </Box>
            ) : (
                <Stack className={styles.emptyState}>
                    <MantineIcon
                        icon={IconFileOff}
                        size={48}
                        color="ldGray.4"
                    />
                    <Text c="ldGray.5" fz="lg">
                        Select a file from the sidebar
                    </Text>
                </Stack>
            )}
        </Box>
    );
};

export default CodeEditorPane;
