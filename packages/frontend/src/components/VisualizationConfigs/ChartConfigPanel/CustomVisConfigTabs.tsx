import {
    getDefaultZIndex,
    Group,
    Loader,
    Select,
    Tabs,
    Text,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import merge from 'lodash/merge';
import { type IDisposable, type languages } from 'monaco-editor';
import React, { memo, useEffect, useRef, useState } from 'react';
import { useDeepCompareEffect } from 'react-use';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { isCustomVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

type Schema = {
    readonly uri: string;
    readonly fileMatch?: string[] | undefined;
    readonly schema?: any;
};

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
    lineNumbers: 'off',
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    fixedOverflowWidgets: true,
};

const initVegaLazySchema = async (fields: string[]) => {
    const vegaLiteSchema = await import(
        'vega-lite/build/vega-lite-schema.json'
    );

    return [
        {
            uri: 'https://lightdash.com/schemas/vega-lite-schema-custom.json',
            fileMatch: ['*'],
            schema: merge(vegaLiteSchema.default, {
                definitions: {
                    FieldName: {
                        type: 'string',
                        enum: fields,
                    },
                },
            }),
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
let completionProviderDisposable: IDisposable | null = null;

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

const CustomVisConfigTabs: React.FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    const isCustomConfig = isCustomVisualizationConfig(visualizationConfig);

    const [isLoading, setIsLoading] = useState(true);
    const schemas = useRef<Schema[] | null>(null);

    useEffect(() => {
        if (!isCustomConfig) return;
        const fields = visualizationConfig.chartConfig.fields || [];

        async function initVegaAsync() {
            schemas.current = await initVegaLazySchema(fields);
            setIsLoading(false);
        }

        void initVegaAsync();
    }, [isCustomConfig, visualizationConfig.chartConfig]);

    const [editorConfig, setEditorConfig] = useState<string>('');
    const [debouncedTooltipValue] = useDebouncedValue(editorConfig, 1000);

    useEffect(() => {
        if (!isCustomConfig || isLoading) return;
        visualizationConfig.chartConfig.setVisSpec(debouncedTooltipValue ?? '');
    }, [
        isLoading,
        isCustomConfig,
        debouncedTooltipValue,
        visualizationConfig.chartConfig,
    ]);

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

    if (!monacoOptions) return null; // we should not load monaco before options are set with the overflowWidgetsDomNode

    if (isLoading) {
        return <Loader color="gray" size="xs" />;
    }

    if (!isCustomConfig) return null;
    const { series } = visualizationConfig.chartConfig;

    return (
        <>
            <Group>
                <Text>Load template</Text>
                <Select data={['', 'config', 'data']} defaultValue="config" />
            </Group>
            <Tabs
                defaultValue="config"
                style={{ flexGrow: 1 }}
                styles={{
                    root: {
                        display: 'flex',
                        flexDirection: 'column',
                    },
                    panel: {
                        flexGrow: 1,
                    },
                }}
            >
                <Tabs.List>
                    <Tabs.Tab value="config">Config</Tabs.Tab>
                    <Tabs.Tab value="data">Data</Tabs.Tab>
                    <DocumentationHelpButton
                        ml="auto"
                        mt="xs"
                        href="https://docs.lightdash.com/references/custom-charts#custom-charts"
                    />
                </Tabs.List>

                <Tabs.Panel value="config">
                    {/* Hack to show a monaco placeholder */}
                    {(editorConfig || '')?.length === 0 ? (
                        <Text
                            ml="xl"
                            pos="absolute"
                            w="330px"
                            color="gray.5"
                            sx={{
                                pointerEvents: 'none',
                                zIndex: getDefaultZIndex('overlay'),
                                fontFamily: 'monospace',
                            }}
                        >
                            {`Write some vega lite JSON or select a template. Check our docs for more info and examples.`}
                        </Text>
                    ) : null}

                    <Editor
                        loading={<Loader color="gray" size="xs" />}
                        beforeMount={(monaco) => {
                            loadMonaco(monaco, schemas.current!);
                            const fields = Object.keys(series[0] || {});
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
                        wrapperProps={{
                            id: 'tooltip-editor-wrapper',
                        }}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="data">
                    <Editor
                        loading={<Loader color="gray" size="xs" />}
                        defaultLanguage="json"
                        options={{
                            ...MONACO_DEFAULT_OPTIONS,
                            readOnly: true,
                        }}
                        defaultValue={JSON.stringify(series, null, 2)}
                    />
                </Tabs.Panel>
            </Tabs>
        </>
    );
});

export default CustomVisConfigTabs;
