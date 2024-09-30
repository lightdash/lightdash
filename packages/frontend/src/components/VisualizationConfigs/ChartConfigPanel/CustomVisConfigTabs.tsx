import { Loader, Tabs } from '@mantine/core';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import merge from 'lodash/merge';
import React, { memo, useEffect, useRef, useState } from 'react';
import { isCustomVisualizationConfig } from '../../LightdashVisualization/VisualizationCustomConfig';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

type Schema = {
    readonly uri: string;
    readonly fileMatch?: string[] | undefined;
    readonly schema?: any;
};

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    lineNumbersMinChars: 1,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
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

    if (isLoading) {
        return <Loader color="gray" size="xs" />;
    }

    if (!isCustomConfig) return null;
    const { visSpec, setVisSpec, series } = visualizationConfig.chartConfig;

    return (
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
            </Tabs.List>

            <Tabs.Panel value="config">
                <Editor
                    loading={<Loader color="gray" size="xs" />}
                    beforeMount={(monaco) =>
                        loadMonaco(monaco, schemas.current!)
                    }
                    defaultLanguage="json"
                    options={{ ...MONACO_DEFAULT_OPTIONS }}
                    value={visSpec}
                    onChange={(config) => setVisSpec(config ?? '')}
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
    );
});

export default CustomVisConfigTabs;
