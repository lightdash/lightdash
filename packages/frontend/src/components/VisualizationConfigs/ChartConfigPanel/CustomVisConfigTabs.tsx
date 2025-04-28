import {
    type CustomDimension,
    FeatureFlags,
    type Field,
    getErrorMessage,
    getItemId,
    isCustomDimension,
    isDateItem,
    isDimension,
    isMetric,
    isNumericType,
    isTableCalculation,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Loader,
    Popover,
    Text,
    Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import { IconSparkles } from '@tabler/icons-react';
import merge from 'lodash/merge';
import { type IDisposable, type languages } from 'monaco-editor';
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useParams } from 'react-router';
import { useDeepCompareEffect } from 'react-use';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
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

type VegaFieldType = Field | TableCalculation | CustomDimension | Metric;
const generateVegaTemplate = (
    templateType: TemplateType,
    xField: VegaFieldType | undefined,
    yField: VegaFieldType | undefined,
    extraField?: VegaFieldType,
) => {
    const templateJson = getTemplateByType(templateType);
    let templateString = JSON.stringify(templateJson, null, 2);
    if (xField) {
        const xFieldType =
            isDimension(xField) && isDateItem(xField) ? 'temporal' : 'ordinal';

        templateString = templateString.replaceAll('field_type_x', xFieldType);
        templateString = templateString.replaceAll(
            'field_x',
            getItemId(xField),
        );
    }
    if (yField)
        templateString = templateString.replaceAll(
            'field_y',
            getItemId(yField),
        );
    if (extraField)
        templateString = templateString.replaceAll(
            'field_extra',
            getItemId(extraField),
        );

    return templateString;
};

const initVegaLazySchema = async () => {
    const vegaLiteSchema = await import(
        'vega-lite/build/vega-lite-schema.json'
    );

    return [
        {
            uri: 'https://lightdash.com/schemas/vega-lite-schema-custom.json',
            fileMatch: ['*'],
            schema: merge(vegaLiteSchema.default, {}),
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
    currentVizConfig: string,
) =>
    lightdashApi<string>({
        url: `/ai/${projectUuid}/custom-viz`,
        method: 'POST',
        body: JSON.stringify({
            prompt,
            itemsMap,
            sampleResults,
            currentVizConfig,
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
const SelectTemplate = ({
    itemsMap,
    isCustomConfig,
    // isEditorEmpty,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    isCustomConfig: boolean;
    isEditorEmpty: boolean;
    setEditorConfig: (config: string) => void;
}) => {
    const [opened, setOpened] = useState(false);

    const loadTemplate = useCallback(
        (template: TemplateType) => {
            if (!isCustomConfig) return null;

            /**
             * When selecting a field for the x axis,
             * we want to prioritize dimensions and date items
             * over metrics and table calculations
             */
            const sortedItemsForX = Object.values(itemsMap || {}).sort(
                (a, b) => {
                    const getPriority = (item: ItemsMap[string]) => {
                        if (isDimension(item) && isDateItem(item)) return 1;
                        if (isDimension(item)) return 2;
                        if (isCustomDimension(item)) return 3;
                        if (isMetric(item)) return 4;
                        return 5; // everything else
                    };
                    return getPriority(a) - getPriority(b);
                },
            );

            /**
             * When selecting a field for the y axis (and color/size values),
             * we want to prioritize numeric metrics and table calculations
             * over dimensions
             */
            const sortedItemsForY = Object.values(itemsMap || {}).sort(
                (a, b) => {
                    const getPriorityForY = (item: ItemsMap[string]) => {
                        if (isMetric(item) && isNumericType(item.type))
                            return 1;
                        if (isMetric(item)) return 2;
                        if (isTableCalculation(item)) return 3;
                        return 4; // everything else
                    };

                    return getPriorityForY(a) - getPriorityForY(b);
                },
            );

            const xField = sortedItemsForX[0];
            const [yField, extraField] = sortedItemsForY;

            const templateString = generateVegaTemplate(
                template,
                xField,
                yField,
                extraField,
            );
            setEditorConfig(templateString);
            setOpened(false); // Close the popover after selecting a template
        },
        [isCustomConfig, itemsMap, setEditorConfig],
    );

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            width="200px"
            position="bottom"
            withArrow
            shadow="md"
        >
            <Popover.Target>
                <ActionIcon
                    w="200px"
                    variant="subtle"
                    color="blue.7"
                    onClick={() => setOpened((o) => !o)}
                >
                    + Select Vega-Lite template
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <Flex direction="column" gap="xs">
                    {Object.values(TemplateType).map((template) => (
                        <Button
                            key={template}
                            variant="subtle"
                            onClick={() => loadTemplate(template)}
                            fullWidth
                        >
                            {template}
                        </Button>
                    ))}
                </Flex>
            </Popover.Dropdown>
        </Popover>
    );
};
const GenerateVizWithAi = ({
    itemsMap,
    sampleResults,
    editorConfig,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    sampleResults: {
        [k: string]: unknown;
    }[];
    editorConfig: string;
    setEditorConfig: (config: string) => void;
}) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const [prompt, setPrompt] = useState('');

    const [isLoading, setIsLoading] = useState(false);

    const { showToastError } = useToaster();

    const handleSubmit = useCallback(() => {
        if (isLoading) return;

        setIsLoading(true);
        if (prompt && projectUuid)
            getCustomViz(
                projectUuid,
                prompt,
                itemsMap,
                sampleResults,
                editorConfig,
            )
                .then((vizConfig) => {
                    // Handle the visualization config
                    setEditorConfig(vizConfig);
                })
                .catch((error) => {
                    showToastError({
                        title: 'Error generating custom viz with AI',
                        subtitle: getErrorMessage(error),
                    });
                    console.error('Error generating custom viz:', error);
                })
                .finally(() => {
                    setIsLoading(false);
                });
    }, [
        prompt,
        projectUuid,
        isLoading,
        itemsMap,
        sampleResults,
        setEditorConfig,
        editorConfig,
        showToastError,
    ]);

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
                    autoFocus={true}
                    minRows={1}
                    maxRows={20}
                    onChange={(event) => {
                        setPrompt(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            handleSubmit();
                        }
                    }}
                />

                <Button
                    mt="sm"
                    type="submit"
                    disabled={isLoading}
                    onClick={handleSubmit}
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
            <Flex justify="space-between" align="flex-end">
                <SelectTemplate
                    itemsMap={itemsMap}
                    isCustomConfig={isCustomConfig}
                    isEditorEmpty={isEditorEmpty}
                    setEditorConfig={setEditorConfig}
                />
                {isAiEnabled && (
                    <>
                        <Text>or</Text>
                        <GenerateVizWithAi
                            itemsMap={itemsMap}
                            sampleResults={series.slice(0, 3)}
                            setEditorConfig={setEditorConfig}
                            editorConfig={editorConfig}
                        />
                    </>
                )}
                <DocumentationHelpButton href="https://docs.lightdash.com/references/custom-charts#custom-charts" />
            </Flex>

            <Group mt="sm" h="100%" align="top">
                {/* Hack to show a monaco placeholder */}
                {isEditorEmpty ? (
                    <Text
                        pos="absolute"
                        w="330px"
                        color="gray.5"
                        sx={{
                            pointerEvents: 'none',
                            zIndex: 100,
                            fontFamily: 'monospace',
                            marginLeft: '17px', // Stye to match Monaco text
                            fontSize: '14px',
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
                    wrapperProps={{
                        id: 'tooltip-editor-wrapper',
                    }}
                />
            </Group>
        </>
    );
});

export default CustomVisConfigTabs;
