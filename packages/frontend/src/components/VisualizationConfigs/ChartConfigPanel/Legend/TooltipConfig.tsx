import {
    Box,
    Collapse,
    getDefaultZIndex,
    Group,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    Editor,
    type BeforeMount,
    type EditorProps,
    type Monaco,
} from '@monaco-editor/react';
import { IconHelpCircle } from '@tabler/icons-react';
import { type IDisposable, type languages } from 'monaco-editor';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useDeepCompareEffect } from 'react-use';
import MantineIcon from '../../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';

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
export const TooltipConfig: FC<Props> = ({ fields }) => {
    const { visualizationConfig } = useVisualizationContext();
    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const [tooltipValue, setTooltipValue] = useState<string>(
        (isCartesianChart && visualizationConfig.chartConfig.tooltip) || '',
    );
    const [debouncedTooltipValue] = useDebouncedValue(tooltipValue, 1000);

    useEffect(() => {
        if (!isCartesianChart) return;

        const { setTooltip } = visualizationConfig.chartConfig;

        setTooltip(debouncedTooltipValue);
    }, [
        isCartesianChart,
        debouncedTooltipValue,
        visualizationConfig.chartConfig,
    ]);

    const handleEditorOnChange = (value: string | undefined) => {
        setTooltipValue(value ?? '');
    };

    const [show, setShow] = useState<boolean>(
        isCartesianChart ? !!visualizationConfig.chartConfig.tooltip : false,
    );
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
        },
        [fields],
    );

    if (!monacoOptions) return null; // we should not load monaco before options are set with the overflowWidgetsDomNode
    return (
        <Config>
            <Config.Section>
                <Group spacing="xs" align="center">
                    <Config.Heading>Custom Tooltip</Config.Heading>
                    <Switch checked={show} onChange={() => setShow(!show)} />
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
                            color="gray"
                        />
                    </Tooltip>
                </Group>

                <Collapse in={show}>
                    {/* Monaco does not support placeholders, so this is a workaround to show the example tooltip
                    we show some text, by giving position absolute, it is placed on top of the editor*/}
                    {tooltipValue?.length === 0 ? (
                        <Text
                            ml="xxs"
                            pos="absolute"
                            width="400px"
                            color="ldGray.5"
                            sx={{
                                pointerEvents: 'none',
                                zIndex: getDefaultZIndex('overlay'),
                                fontFamily: 'monospace',
                            }}
                        >
                            {`- Total orders: \${orders_total_amount}`}
                        </Text>
                    ) : null}
                    <Box
                        sx={(theme) => ({
                            boxShadow: theme.shadows.subtle,
                        })}
                    >
                        <Editor
                            beforeMount={beforeMount}
                            value={tooltipValue}
                            options={monacoOptions}
                            onChange={handleEditorOnChange}
                            language={'html'}
                            height="76px"
                            width="100%"
                            wrapperProps={{
                                id: 'tooltip-editor-wrapper',
                            }}
                        />
                    </Box>
                </Collapse>
            </Config.Section>
        </Config>
    );
};
