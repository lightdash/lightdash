import { FeatureFlags } from '@lightdash/common';
import { Button, Flex, Group, Loader, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import { type IDisposable, type languages } from 'monaco-editor';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDeepCompareEffect } from 'react-use';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { isCustomVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { GenerateVizWithAi } from './components/CustomVisAi';
import { SelectTemplate } from './components/CustomVisTemplate';
import { type Schema } from './types/types';

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    lineNumbersMinChars: 1,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
    fixedOverflowWidgets: true,
};

const initVegaLazySchema = async () => {
    const vegaLiteSchema = await import(
        'vega-lite/build/vega-lite-schema.json'
    );

    return [
        {
            uri: 'https://lightdash.com/schemas/vega-lite-schema-custom.json',
            fileMatch: ['*'],
            schema: vegaLiteSchema.default,
        },
    ];
};

const loadMonaco = (monaco: Monaco, schemas: Schema[]) => {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        comments: 'warning',
        trailingCommas: 'warning',
        enableSchemaRequest: true,
        schemas,
        validate: true,
    });

    monaco.languages.json.jsonDefaults.setModeConfiguration({
        documentFormattingEdits: false,
        documentRangeFormattingEdits: false,
        completionItems: true,
        hovers: true,
        documentSymbols: true,
        tokens: true,
        colors: true,
        foldingRanges: true,
        diagnostics: true,
    });
};

const registerCustomCompletionProvider = (
    monaco: Monaco,
    language: string,
    fields: string[],
) => {
    console.debug('Loading completion provider with fields', fields);
    return monaco.languages.registerCompletionItemProvider(language, {
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
                        insertText: field,
                        range,
                    };
                },
            );

            return { suggestions };
        },
        triggerCharacters: ['$'],
    });
};

export const ConfigTabs: React.FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    const isCustomConfig = isCustomVisualizationConfig(visualizationConfig);

    const [isLoading, setIsLoading] = useState(true);
    const schemas = useRef<Schema[] | null>(null);

    const chartConfig = useMemo(
        () => (isCustomConfig ? visualizationConfig.chartConfig : undefined),
        [isCustomConfig, visualizationConfig.chartConfig],
    );
    const completionProviderRef = useRef<IDisposable | null>(null);
    const monacoInstanceRef = useRef<Monaco | null>(null);

    const { fields } = useMemo(() => {
        return {
            fields: chartConfig?.fields,
        };
    }, [chartConfig]);
    useDeepCompareEffect(() => {
        if (!chartConfig || !isLoading) return;

        async function initVegaAsync() {
            schemas.current = await initVegaLazySchema();
            setIsLoading(false);
        }

        void initVegaAsync();
    }, [isLoading, chartConfig]);

    useEffect(() => {
        return () => {
            if (completionProviderRef.current) {
                console.debug(
                    'Clearning Monaco completion provider on unmount',
                );
                completionProviderRef.current.dispose();
            }
        };
    }, []);

    // Effect to refresh completion provider when fields change
    useEffect(() => {
        if (!monacoInstanceRef.current) return;

        // Clean up previous provider if it exists
        if (completionProviderRef.current) {
            console.debug(
                'Refreshing Monaco completion provider with new fields',
            );
            completionProviderRef.current.dispose();
        }
        if (fields)
            completionProviderRef.current = registerCustomCompletionProvider(
                monacoInstanceRef.current,
                'json',
                fields,
            );
    }, [fields]);

    const [editorConfig, setEditorConfig] = useState<string>(
        isCustomConfig ? visualizationConfig.chartConfig.visSpec || '' : '',
    );
    const [debouncedTooltipValue] = useDebouncedValue(editorConfig, 1000);

    useEffect(() => {
        if (isLoading || !chartConfig) return;
        if (debouncedTooltipValue)
            chartConfig.setVisSpec(debouncedTooltipValue);
    }, [isLoading, debouncedTooltipValue, chartConfig]);

    const [monacoOptions, setMonacoOptions] = useState<
        EditorProps['options'] | undefined
    >();

    const isAiEnabled = useFeatureFlagEnabled(FeatureFlags.AiCustomViz);
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
    const { itemsMap } = useVisualizationContext();

    if (!isCustomConfig) return null;

    if (!monacoOptions || isLoading) {
        return <Loader color="gray" size="xs" />;
    }

    const { series } = visualizationConfig.chartConfig;

    const isEditorEmpty = (editorConfig || '')?.length === 0;

    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>
                            <Flex justify="space-between" gap="xs">
                                <Text>Vega-Lite JSON</Text>
                                <DocumentationHelpButton
                                    pos="relative"
                                    top="2px"
                                    href="https://docs.lightdash.com/references/custom-charts#custom-charts"
                                />
                            </Flex>
                        </Config.Heading>

                        <Button.Group>
                            <SelectTemplate
                                itemsMap={itemsMap}
                                isCustomConfig={isCustomConfig}
                                isEditorEmpty={isEditorEmpty}
                                setEditorConfig={setEditorConfig}
                            />

                            {isAiEnabled && (
                                <GenerateVizWithAi
                                    itemsMap={itemsMap}
                                    sampleResults={series.slice(0, 3)}
                                    setEditorConfig={setEditorConfig}
                                    editorConfig={editorConfig}
                                />
                            )}
                        </Button.Group>
                    </Config.Group>
                </Config.Section>
            </Config>
            <Group
                h="calc(100vh - 300px)"
                align="top"
                mt="4px"
                sx={{
                    borderTop: '0.125rem solid #dee2e6',
                }}
            >
                {/* Hack to show a monaco placeholder */}
                {isEditorEmpty ? (
                    <Text
                        pos="absolute"
                        w="330px"
                        color="ldGray.5"
                        sx={{
                            pointerEvents: 'none',
                            zIndex: 100,
                            fontFamily: 'monospace',
                            marginLeft: '35px', // Stye to match Monaco text
                            fontSize: '12px',
                            lineHeight: '19px',
                            letterSpacing: '0px',
                        }}
                    >
                        {`Start by entering your Vega-Lite JSON code or choose from our pre-built templates to create your chart.`}
                    </Text>
                ) : null}

                <Editor
                    loading={<Loader color="gray" size="xs" />}
                    beforeMount={(monaco) => {
                        loadMonaco(monaco, schemas.current!);
                        monacoInstanceRef.current = monaco;

                        // Clean up previous provider if it exists
                        if (completionProviderRef.current) {
                            console.debug(
                                'Clearing Monaco completion provider on beforeMount',
                                completionProviderRef.current,
                            );
                            completionProviderRef.current.dispose();
                        }

                        if (fields)
                            completionProviderRef.current =
                                registerCustomCompletionProvider(
                                    monaco,
                                    'json',
                                    fields,
                                );
                    }}
                    defaultLanguage="json"
                    options={monacoOptions}
                    value={editorConfig}
                    onChange={(config) => {
                        setEditorConfig(config ?? '');
                    }}
                />
            </Group>
        </>
    );
});
