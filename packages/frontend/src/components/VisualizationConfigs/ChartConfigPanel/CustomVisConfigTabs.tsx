import {
    getItemId,
    isDateItem,
    isDimension,
    isMetric,
    isNumericType,
    type ItemsMap,
} from '@lightdash/common';
import {
    Button,
    Flex,
    getDefaultZIndex,
    Group,
    Loader,
    Modal,
    Popover,
    Select,
    Tabs,
    Text,
    Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import { IconSparkles } from '@tabler/icons-react';
import merge from 'lodash/merge';
import { type IDisposable, type languages } from 'monaco-editor';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useDeepCompareEffect } from 'react-use';
import { lightdashApi } from '../../../api';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { isCustomVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { getTemplateByType, TemplateType } from './vegaTemplates';

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

const generateVegaTemplate = (
    templateType: TemplateType,
    xField: string | undefined,
    yField: string | undefined,
    extraField?: string,
) => {
    const templateJson = getTemplateByType(templateType);
    let templateString = JSON.stringify(templateJson, null, 2);
    if (xField) templateString = templateString.replaceAll('field_x', xField);
    if (yField) templateString = templateString.replaceAll('field_y', yField);
    if (extraField)
        templateString = templateString.replaceAll('field_extra', extraField);

    return templateString;
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

const getCustomViz = async (
    projectUuid: string,
    prompt: string,
    itemsMap: ItemsMap | undefined,
    sampleResults: {
        [k: string]: unknown;
    }[],
) =>
    lightdashApi<string>({
        url: `/ai/${projectUuid}/custom-viz`,
        method: 'POST',
        body: JSON.stringify({
            prompt,
            itemsMap,
            sampleResults,
        }),
    });

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
const SelectTemplate = ({
    itemsMap,
    isCustomConfig,
    isEditorEmpty,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    isCustomConfig: boolean;
    isEditorEmpty: boolean;
    setEditorConfig: (config: string) => void;
}) => {
    const [selectedTemplate, setSelectedTemplate] = useState<
        TemplateType | undefined
    >();

    const loadTemplate = useCallback(
        (template: TemplateType) => {
            if (!isCustomConfig) return null;

            const xField = Object.values(itemsMap || {})
                .filter((item) => isDimension(item) && isDateItem(item))
                .sort((a, b) => a.name.localeCompare(b.name))[0];
            const [yField, extraField] = Object.values(itemsMap || {})
                .filter((item) => isMetric(item) && isNumericType(item.type))
                .sort((a, b) => a.name.localeCompare(b.name));
            const templateString = generateVegaTemplate(
                template,
                getItemId(xField),
                getItemId(yField),
                getItemId(extraField),
            );
            setEditorConfig(templateString);
        },
        [isCustomConfig, itemsMap, setEditorConfig],
    );
    return (
        <>
            <Modal
                title="Load template"
                opened={!!selectedTemplate}
                onClose={() => {
                    setSelectedTemplate(undefined);
                }}
            >
                <Text>
                    Loading a new template will overwrite your current chart
                    configuration. Are you sure you want to continue?
                </Text>
                <Group position="right" mt="sm">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={() => {
                            setSelectedTemplate(undefined);
                        }}
                    >
                        Keep config
                    </Button>
                    <Button
                        onClick={() => {
                            if (selectedTemplate)
                                loadTemplate(selectedTemplate);
                            setSelectedTemplate(undefined);
                        }}
                    >
                        Load template
                    </Button>
                </Group>
            </Modal>

            <Select
                label="Load vega lite template"
                placeholder="Select template"
                data={Object.values(TemplateType)}
                onChange={(value) => {
                    if (!value) return;
                    if (isEditorEmpty) {
                        loadTemplate(value as TemplateType);
                    } else {
                        setSelectedTemplate(value as TemplateType);
                    }
                }}
            />
        </>
    );
};
const GenerateVizWithAi = ({
    itemsMap,
    sampleResults,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    sampleResults: {
        [k: string]: unknown;
    }[];
    setEditorConfig: (config: string) => void;
}) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const [prompt, setPrompt] = useState('');

    const [isLoading, setIsLoading] = useState(false);

    return (
        <Popover width="400px" position="bottom" withArrow shadow="md">
            <Popover.Target>
                <Button variant="outline" color="blue">
                    Ask AI <IconSparkles size={16} />
                </Button>
            </Popover.Target>
            <Popover.Dropdown>
                <Textarea
                    placeholder="Create a heatmap with detailed tooltips and clear values for fast insights"
                    autosize
                    minRows={1}
                    maxRows={3}
                    onChange={(event) => setPrompt(event.currentTarget.value)}
                />

                <Button
                    mt="sm"
                    onClick={() => {
                        setIsLoading(true);
                        if (prompt && projectUuid)
                            getCustomViz(
                                projectUuid,
                                prompt,
                                itemsMap,
                                sampleResults,
                            )
                                .then((vizConfig) => {
                                    // Handle the visualization config
                                    setEditorConfig(vizConfig);
                                })
                                .catch((error) => {
                                    console.error(
                                        'Error generating custom viz:',
                                        error,
                                    );
                                })
                                .finally(() => {
                                    setIsLoading(false);
                                });
                    }}
                    disabled={isLoading}
                >
                    {isLoading ? 'Generating...' : 'Generate'}
                </Button>
            </Popover.Dropdown>
        </Popover>
    );
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

    const [editorConfig, setEditorConfig] = useState<string>(
        isCustomConfig ? visualizationConfig.chartConfig.visSpec || '' : '',
    );
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
    const { itemsMap } = useVisualizationContext();

    if (!monacoOptions) return null; // we should not load monaco before options are set with the overflowWidgetsDomNode

    if (isLoading) {
        return <Loader color="gray" size="xs" />;
    }

    if (!isCustomConfig) return null;
    const { series } = visualizationConfig.chartConfig;

    const isEditorEmpty = (editorConfig || '')?.length === 0;

    return (
        <>
            <Flex gap="sm" align="flex-end">
                <SelectTemplate
                    itemsMap={itemsMap}
                    isCustomConfig={isCustomConfig}
                    isEditorEmpty={isEditorEmpty}
                    setEditorConfig={setEditorConfig}
                />
                <Text>or</Text>
                <GenerateVizWithAi
                    itemsMap={itemsMap}
                    sampleResults={series.slice(0, 3)}
                    setEditorConfig={setEditorConfig}
                />
            </Flex>
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
                    {isEditorEmpty ? (
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
