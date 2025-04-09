import { Collapse, Group, Switch } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    Editor,
    type BeforeMount,
    type EditorProps,
    type Monaco,
} from '@monaco-editor/react';
import { type IDisposable, type languages } from 'monaco-editor';
import { useCallback, useEffect, useState, type FC } from 'react';
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
                        return {
                            label: field,
                            kind: monaco.languages.CompletionItemKind.Class,
                            insertText: `\${${field.replace(/\./g, '_')}\}`,
                            range,
                        };
                    },
                );

                return { suggestions };
            },
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

    const [show, setShow] = useState<boolean>(
        isCartesianChart ? !!visualizationConfig.chartConfig.tooltip : false,
    );

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerCustomCompletionProvider(monaco, 'html', fields);
        },
        [fields],
    );

    return (
        <Config>
            <Config.Section>
                <Group spacing="xs" align="center">
                    <Config.Heading>Custom Tooltip</Config.Heading>
                    <Switch checked={show} onChange={() => setShow(!show)} />
                </Group>

                <Collapse in={show}>
                    <Editor
                        beforeMount={beforeMount}
                        value={tooltipValue}
                        onChange={(value) => setTooltipValue(value ?? '')}
                        options={MONACO_DEFAULT_OPTIONS}
                        language={'html'}
                        height="400px"
                        width="100%"
                        wrapperProps={{
                            className: 'tooltip-editor',
                        }}
                    />
                </Collapse>
            </Config.Section>
        </Config>
    );
};
