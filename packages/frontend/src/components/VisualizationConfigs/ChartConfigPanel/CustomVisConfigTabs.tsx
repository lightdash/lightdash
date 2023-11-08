import { Loader } from '@mantine/core';
import Editor, { Monaco } from '@monaco-editor/react';
import React, { memo, useEffect, useRef, useState } from 'react';
import { useCustomVisualizationContext } from '../../CustomVisualization';

type Schema = {
    readonly uri: string;
    readonly fileMatch?: string[] | undefined;
    readonly schema?: any;
};

const initVegaLazySchema = async () => {
    const vegaLiteSchema = await import(
        'vega-lite/build/vega-lite-schema.json'
    );

    return [
        {
            uri: 'https://vega.github.io/schema/vega-lite/v5.json',
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

const CustomVisConfigTabs: React.FC = memo(() => {
    const { chartConfig, setChartConfig } = useCustomVisualizationContext();
    const [isLoading, setIsLoading] = useState(true);
    const schemas = useRef<Schema[] | null>(null);

    useEffect(() => {
        initVegaLazySchema().then((vegaSchemas) => {
            schemas.current = vegaSchemas;
            setIsLoading(false);
        });
    }, []);

    if (isLoading) {
        return <Loader color="gray" size="xs" />;
    }

    return (
        <Editor
            loading={<Loader color="gray" size="xs" />}
            beforeMount={(monaco) => loadMonaco(monaco, schemas.current!)}
            defaultLanguage="json"
            options={{
                cursorBlinking: 'smooth',
                folding: true,
                lineNumbersMinChars: 1,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                quickSuggestions: true,
            }}
            value={chartConfig}
            onChange={(config) => setChartConfig(config ?? '')}
        />
    );
});

export default CustomVisConfigTabs;
