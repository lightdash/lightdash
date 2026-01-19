import {
    Collapse,
    getDefaultZIndex,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
    useMantineColorScheme,
} from '@mantine-8/core';
import { Switch } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    Editor,
    type BeforeMount,
    type EditorProps,
    type Monaco,
    type OnMount,
} from '@monaco-editor/react';
import { IconHelpCircle } from '@tabler/icons-react';
import { type editor, type IDisposable, type languages } from 'monaco-editor';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useDeepCompareEffect } from 'react-use';
import { getLightdashMonacoTheme } from '../../../../features/sqlRunner/utils/monaco';
import MantineIcon from '../../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
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
export const TooltipConfig: FC<Props> = ({ fields }) => {
    const { visualizationConfig } = useVisualizationContext();
    const { colorScheme } = useMantineColorScheme();
    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const [tooltipValue, setTooltipValue] = useState<string>(
        (isCartesianChart && visualizationConfig.chartConfig.tooltip) || '',
    );
    const [debouncedTooltipValue] = useDebouncedValue(tooltipValue, 1000);
    const [editorHeight, setEditorHeight] = useState<number>(
        calculateEditorHeight(1),
    );
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const disposableRef = useRef<IDisposable | null>(null);
    const prevShowRef = useRef<boolean>(
        isCartesianChart ? !!visualizationConfig.chartConfig.tooltip : false,
    );
    const tooltipValueRef = useRef<string>(
        (isCartesianChart && visualizationConfig.chartConfig.tooltip) || '',
    );

    const [show, setShow] = useState<boolean>(
        isCartesianChart ? !!visualizationConfig.chartConfig.tooltip : false,
    );

    // Keep ref in sync with tooltipValue for immediate toggle restore
    useEffect(() => {
        tooltipValueRef.current = tooltipValue;
    }, [tooltipValue]);

    // Handle tooltip updates: toggle changes are immediate, typing uses debounced value
    useEffect(() => {
        if (!isCartesianChart) return;

        const { setTooltip } = visualizationConfig.chartConfig;

        // If show state changed, handle toggle immediately
        if (prevShowRef.current !== show) {
            if (show) {
                // When toggled on, immediately restore the current tooltip value
                setTooltip(tooltipValueRef.current);
            } else {
                // When toggled off, immediately clear the tooltip
                setTooltip('');
            }
            prevShowRef.current = show;
        } else if (show) {
            // When show is true and debounced value changes (user typing), update with debounced value
            setTooltip(debouncedTooltipValue);
        }
    }, [
        isCartesianChart,
        show,
        debouncedTooltipValue,
        visualizationConfig.chartConfig,
    ]);

    const handleEditorOnChange = (value: string | undefined) => {
        setTooltipValue(value ?? '');
        // Update height based on line count
        const lineCount = (value ?? '').split('\n').length;
        setEditorHeight(calculateEditorHeight(lineCount));
    };
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
                <Tooltip
                    withinPortal={true}
                    maw={350}
                    variant="xs"
                    multiline
                    label="Use this input to enhance chart tooltips with additional content. You can incorporate HTML code and include dynamic values using the format ${variable_name}.
                                Click here to read more about this on our docs."
                >
                    <MantineIcon
                        onClick={() => {
                            window.open(
                                'https://docs.lightdash.com/references/custom-tooltip',
                                '_blank',
                            );
                        }}
                        icon={IconHelpCircle}
                        size="md"
                        display="inline"
                        color="ldGray.5"
                        style={{ cursor: 'pointer' }}
                    />
                </Tooltip>
                <Switch checked={show} onChange={() => setShow(!show)} />
            </Group>

            <Collapse in={show}>
                {/* Monaco does not support placeholders, so this is a workaround to show the example tooltip
                we show some text, by giving position absolute, it is placed on top of the editor*/}
                <Paper className={styles.editorWrapper} p="xs" pos="relative">
                    {tooltipValue?.length === 0 ? (
                        <Text
                            ml="sm"
                            pos="absolute"
                            w="400px"
                            c="ldGray.5"
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
                </Paper>
            </Collapse>
        </Stack>
    );
};
