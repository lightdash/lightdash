import { FeatureFlags } from '@lightdash/common';
import { Button, Flex, Group, Text } from '@mantine/core';
import React, { memo, useEffect, useState } from 'react';
import { useFieldAutocompletions } from '../../../../hooks/codemirror/useFieldAutocompletions';
import { useVegaLiteSchema } from '../../../../hooks/codemirror/useVegaLiteSchema';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import { JsonEditor } from '../../../CodeMirror';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { isCustomVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { GenerateVizWithAi } from './components/CustomVisAi';
import { SelectTemplate } from './components/CustomVisTemplate';

export const ConfigTabs: React.FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    const isCustomConfig = isCustomVisualizationConfig(visualizationConfig);

    const chartConfig = isCustomConfig
        ? visualizationConfig.chartConfig
        : undefined;
    const fields = chartConfig?.fields;

    const autocompletions = useFieldAutocompletions(fields || []);
    const vegaLiteSchema = useVegaLiteSchema();

    const [editorConfig, setEditorConfig] = useState<string>(
        isCustomConfig ? visualizationConfig.chartConfig.visSpec || '' : '',
    );

    useEffect(() => {
        if (!chartConfig) return;
        chartConfig.setVisSpec(editorConfig);
    }, [editorConfig, chartConfig]);

    const isAiEnabled = useFeatureFlagEnabled(FeatureFlags.AiCustomViz);
    const { itemsMap } = useVisualizationContext();

    if (!isCustomConfig) return null;

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
                {/* Placeholder text */}
                {isEditorEmpty ? (
                    <Text
                        pos="absolute"
                        w="330px"
                        c="gray.5"
                        style={{
                            pointerEvents: 'none',
                            zIndex: 100,
                            fontFamily: 'monospace',
                            marginLeft: '35px',
                            fontSize: '12px',
                            lineHeight: '19px',
                            letterSpacing: '0px',
                        }}
                    >
                        {`Start by entering your Vega-Lite JSON code or choose from our pre-built templates to create your chart.`}
                    </Text>
                ) : null}

                <JsonEditor
                    value={editorConfig}
                    onChange={setEditorConfig}
                    debounceMs={1000}
                    autocompletions={
                        autocompletions ? [autocompletions] : undefined
                    }
                    schema={vegaLiteSchema}
                    height="100%"
                />
            </Group>
        </>
    );
});
