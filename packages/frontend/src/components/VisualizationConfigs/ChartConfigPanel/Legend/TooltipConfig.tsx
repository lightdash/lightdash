import {
    Collapse,
    getDefaultZIndex,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    Tooltip,
    useMantineColorScheme,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconHelpCircle } from '@tabler/icons-react';
import { type editor, type IDisposable, type languages } from 'monaco-editor';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useDeepCompareEffect } from 'react-use';
import { AiTooltipInput } from '../../../../ee/features/ambientAi/components/tooltip';
import { useAmbientAiEnabled } from '../../../../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import useIsEmbedded from '../../../../ee/providers/Embed/useIsEmbedded';
import { getLightdashMonacoTheme } from '../../../../features/sqlRunner/utils/monaco';
import {
    selectCartesianEditor,
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import MantineIcon from '../../../common/MantineIcon';
import {
    Editor,
    type BeforeMount,
    type EditorProps,
    type Monaco,
    type OnMount,
} from '../../../MonacoEditor';
import { Config } from '../../common/Config';
import styles from './TooltipConfig.module.css';
import '../../../../styles/monaco.css';

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

type Props = {
    fields: string[];
};

const registerCustomCompletionProvider = (
    monaco: Monaco,
    language: string,
    fields: string[],
) => {
    if (completionProviderDisposable) {
        console.debug('Clearing Monaco completion provider');
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
                                ? `{${field}} `
                                : `\${${field}}`;

                        return {
                            label: `${field}`,
                            kind: monaco.languages.CompletionItemKind.Class,
                            insertText,
                            range,
                        };
                    },
                );

                return { suggestions };
            },
            triggerCharacters: ['$'],
        });
};

const MONACO_LINE_HEIGHT = 19;
const MONACO_PADDING = 16;
const MAX_LINES = 10;

const calculateEditorHeight = (lineCount: number): number => {
    const lines = Math.min(lineCount || 1, MAX_LINES);
    return lines * MONACO_LINE_HEIGHT + MONACO_PADDING;
};
const selectTooltip = (state: VisualizationStoreState) =>
    selectCartesianEditor(state).tooltip;

export const TooltipConfig: FC<Props> = ({ fields }) => {
    const tooltip = useVisualizationSelector(selectTooltip);
    const { setTooltip } = useCartesianEditorActions();
    const { colorScheme } = useMantineColorScheme();
    const projectUuid = useProjectUuid();
    const isAmbientAiEnabled = useAmbientAiEnabled(projectUuid);
    const isEmbedded = useIsEmbedded();
    const [tooltipValue, setTooltipValue] = useState<string>(tooltip || '');
    const commitTooltip = useDebouncedCallback(setTooltip, {
        delay: 1000,
        flushOnUnmount: true,
    });
    const [editorHeight, setEditorHeight] = useState<number>(
        calculateEditorHeight(1),
    );
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const disposableRef = useRef<IDisposable | null>(null);

    const [show, setShow] = useState<boolean>(!!tooltip);

    // Toggling applies at once: on restores the typed value, off clears it
    const handleToggle = () => {
        commitTooltip.cancel();
        setTooltip(show ? '' : tooltipValue);
        setShow(!show);
    };

    const updateTooltipValue = (value: string) => {
        setTooltipValue(value);
        if (show) commitTooltip(value);
        // Update height based on line count
        setEditorHeight(calculateEditorHeight(value.split('\n').length));
    };

    const handleEditorOnChange = (value: string | undefined) =>
        updateTooltipValue(value ?? '');

    const [monacoOptions, setMonacoOptions] = useState<
        EditorProps['options'] | undefined
    >();

    useDeepCompareEffect(() => {
        /** Creates a container that belongs to body, outside of the sidebar
         * so we can place the autocomplete tooltip and it doesn't overflow
         * CSS for this component is set on `monaco.css`
         */
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
        });
    }, [monacoOptions]);

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerCustomCompletionProvider(monaco, 'html', fields);

            // Get Lightdash theme colors (editor colors only, no SQL syntax rules needed for HTML)
            const lightTheme = getLightdashMonacoTheme('light');
            const darkTheme = getLightdashMonacoTheme('dark');

            // Define themes with Lightdash editor colors + thin scrollbar + dark mode suggestions
            monaco.editor.defineTheme('lightdash-light', {
                base: 'vs',
                inherit: true,
                rules: [], // No syntax rules needed for HTML editor
                colors: {
                    ...lightTheme.colors,
                },
            });
            monaco.editor.defineTheme('lightdash-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [], // No syntax rules needed for HTML editor
                colors: {
                    ...darkTheme.colors,
                },
            });
        },
        [fields],
    );

    const onMount: OnMount = useCallback((editor) => {
        editorRef.current = editor;
        // Calculate initial height
        const model = editor.getModel();
        if (model) {
            const lineCount = model.getLineCount();
            setEditorHeight(calculateEditorHeight(lineCount));
            // Listen to content changes to update height (handles paste, etc.)
            disposableRef.current = model.onDidChangeContent(() => {
                const newLineCount = model.getLineCount();
                setEditorHeight(calculateEditorHeight(newLineCount));
            });
        }
    }, []);

    useEffect(() => {
        return () => {
            disposableRef.current?.dispose();
        };
    }, []);

    if (!monacoOptions) return null; // we should not load monaco before options are set with the overflowWidgetsDomNode
    return (
        <Stack gap="xs">
            <Group gap="xs" align="center">
                <Config.Label>Custom</Config.Label>
                {!isEmbedded && (
                    <Tooltip
                        maw={350}
                        label="Use this input to enhance chart tooltips with additional content. You can incorporate HTML code and include dynamic values using the format ${variable_name}.
                                Click here to read more about this on our docs."
                    >
                        <MantineIcon
                            onClick={() => {
                                window.open(
                                    'https://docs.lightdash.com/references/custom-tooltip',
                                    '_blank',
                                    'noopener,noreferrer',
                                );
                            }}
                            icon={IconHelpCircle}
                            size="md"
                            display="inline"
                            color="ldGray.5"
                            className={styles.helpIcon}
                        />
                    </Tooltip>
                )}
                <Switch size="xs" checked={show} onChange={handleToggle} />
            </Group>

            <Collapse expanded={show}>
                {/* Monaco does not support placeholders, so this is a workaround to show the example tooltip
                we show some text, by giving position absolute, it is placed on top of the editor*/}
                <Paper
                    className={styles.editorWrapper}
                    radius="md"
                    pos="relative"
                    onBlur={() => commitTooltip.flush()}
                >
                    {tooltipValue?.length === 0 ? (
                        <Text
                            ml="sm"
                            pos="absolute"
                            w="400px"
                            c="dimmed"
                            fz="xs"
                            className={styles.placeholderText}
                            style={{
                                zIndex: getDefaultZIndex('overlay'),
                            }}
                        >
                            {`- Total orders: \${orders_total_amount}`}
                        </Text>
                    ) : null}
                    <Editor
                        beforeMount={beforeMount}
                        onMount={onMount}
                        value={tooltipValue}
                        options={monacoOptions}
                        onChange={handleEditorOnChange}
                        language={'html'}
                        height={`${editorHeight}px`}
                        width="100%"
                        theme={
                            colorScheme === 'dark'
                                ? 'lightdash-dark'
                                : 'lightdash-light'
                        }
                        wrapperProps={{
                            id: 'tooltip-editor-wrapper',
                        }}
                    />

                    {isAmbientAiEnabled && (
                        <AiTooltipInput
                            fields={fields}
                            currentHtml={tooltipValue || undefined}
                            onApply={updateTooltipValue}
                        />
                    )}
                </Paper>
            </Collapse>
        </Stack>
    );
};
