import { FeatureFlags } from '@lightdash/common';
import {
    Group,
    Loader,
    Stack,
    Text,
    Button,
    useComputedColorScheme,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { type IDisposable, type languages } from 'monaco-editor';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDeepCompareEffect } from 'react-use';
import { useCanCreateDataApp } from '../../../../features/apps/hooks/useCanCreateDataApp';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { isCustomVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import Editor, { type EditorProps, type Monaco } from '../../../MonacoEditor';
import { Config } from '../../common/Config';
import CustomChartTypeSection from '../../CustomChartType/CustomChartTypeSection';
import {
    useCreateProjectChartType,
    useSelectProjectChartType,
} from '../../CustomChartType/useSelectProjectChartType';
import { GenerateVizWithAi } from './components/CustomVisAi';
import { SelectTemplate } from './components/CustomVisTemplate';
import classes from './CustomVisConfig.module.css';
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
    const vegaLiteSchema = await import('vega-lite/vega-lite-schema.json');

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

    // Define light and dark themes
    monaco.editor.defineTheme('lightdash-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {},
    });
    monaco.editor.defineTheme('lightdash-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {},
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
    const colorScheme = useComputedColorScheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const location = useLocation();
    const navigate = useNavigate();

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

    const { data: aiCustomVizFlag } = useServerFeatureFlag(
        FeatureFlags.AiCustomViz,
    );
    const isAiEnabled = aiCustomVizFlag?.enabled ?? false;

    // Without data apps there are no project chart types, so Vega is the only
    // custom chart type there is and a picker would offer a choice of one.
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const canCreateApp = useCanCreateDataApp(projectUuid);
    const selectProjectChartType = useSelectProjectChartType();
    const createProjectChartType = useCreateProjectChartType();
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
            <Stack>
                {dataAppsEnabled && (
                    <CustomChartTypeSection
                        projectUuid={projectUuid ?? ''}
                        selected={{ kind: 'builtInVega' }}
                        selectedDataAppViz={null}
                        // Vega needs no columns to be usable, so the picker
                        // stays open even before the query has run.
                        hasColumns
                        onSelectVega={() => {}}
                        onSelectProjectType={(picked) =>
                            selectProjectChartType(picked, itemsMap ?? {})
                        }
                        // Clearing leaves Vega for the empty project-type state.
                        onClear={canCreateApp ? createProjectChartType : null}
                        onCreateNew={
                            canCreateApp
                                ? () =>
                                      void navigate({
                                          pathname: `/projects/${projectUuid}/chart-types/new`,
                                          search: location.search,
                                      })
                                : null
                        }
                        onBrowseGallery={() =>
                            void navigate(`/projects/${projectUuid}/gallery`)
                        }
                    />
                )}

                <Config>
                    <Config.Section>
                        <Config.Group>
                            <Group gap={4} wrap="nowrap">
                                <Config.Heading>Vega-Lite JSON</Config.Heading>
                                <DocumentationHelpButton
                                    href="https://docs.lightdash.com/references/custom-charts#custom-charts"
                                    // Block, so the anchor hugs the glyph and
                                    // the Group centres what is actually seen
                                    // rather than an inline text box.
                                    iconProps={{ size: 14, display: 'block' }}
                                />
                            </Group>

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
            </Stack>
            <Group
                h="calc(100vh - 300px)"
                align="top"
                mt="md"
                className={classes.editorPane}
            >
                {/* Hack to show a monaco placeholder */}
                {isEditorEmpty ? (
                    <Text
                        pos="absolute"
                        w="330px"
                        c="ldGray.5"
                        className={classes.editorPlaceholder}
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
                    theme={
                        colorScheme === 'dark'
                            ? 'lightdash-dark'
                            : 'lightdash-light'
                    }
                />
            </Group>
        </>
    );
});
