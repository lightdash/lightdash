import {
    getEffectiveOptionValues,
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type Item,
} from '@lightdash/common';
import { Stack, Text } from '@mantine-8/core';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import DataAppVizConversation from '../../../features/apps/components/DataAppVizConversation';
import DataAppVizLibraryPicker from '../../../features/apps/components/DataAppVizLibraryPicker';
import DataAppVizPickOrCreate from '../../../features/apps/components/DataAppVizPickOrCreate';
import { useDataAppVisualization } from '../../../features/apps/hooks/useDataAppVisualization';
import { useGenerateDataAppViz } from '../../../features/apps/hooks/useGenerateDataAppViz';
import { useIterateDataAppViz } from '../../../features/apps/hooks/useIterateDataAppViz';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from '../../../features/apps/utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../../../features/apps/utils/getDataAppVizFieldItems';
import FieldSelect from '../../common/FieldSelect';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { Config } from '../common/Config';
import { getVizConfigThemeOverride } from '../mantineTheme';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    const isDataAppViz = isDataAppVizVisualizationConfig(visualizationConfig);
    const dataAppVizUuid = isDataAppViz
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : '';

    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid || undefined,
    );

    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap ?? {}),
        [itemsMap],
    );

    const configOptions = useMemo(
        () => dataAppViz?.schema?.configOptions ?? [],
        [dataAppViz],
    );
    const colorPalette = dataAppViz?.schema?.colorPalette ?? null;

    const fieldItems = (field: DataAppVizField): Item[] =>
        field.type === 'metric' ? metrics : dimensions;

    // Held in a ref-free callback so the generator hook can commit straight
    // into the chart config once a build lands.
    const setDataAppVizUuidRef = isDataAppViz
        ? visualizationConfig.chartConfig.setDataAppVizUuid
        : undefined;
    const handleGenerated = useCallback(
        (uuid: string, mapping: DataAppVizFieldMapping) =>
            setDataAppVizUuidRef?.(uuid, mapping),
        [setDataAppVizUuidRef],
    );
    const generation = useGenerateDataAppViz({
        projectUuid,
        itemsMap: itemsMap ?? {},
        onReady: handleGenerated,
    });
    const revision = useIterateDataAppViz({
        projectUuid,
        dataAppVizUuid: dataAppVizUuid || null,
    });

    if (!isDataAppViz) return null;

    const {
        setDataAppVizUuid,
        setField,
        setOption,
        fieldMapping,
        optionValues,
    } = visualizationConfig.chartConfig;
    const fields = dataAppViz?.schema?.fields ?? [];
    const effectiveValues = getEffectiveOptionValues(
        configOptions,
        optionValues,
    );
    // The contract can change under a stable uuid when the viz is rebuilt, so
    // what the selects show is the saved mapping reconciled against the
    // contract and columns in force now — the same value the renderer uses.
    const effectiveMapping = reconcileDataAppVizFieldMapping(
        fields,
        itemsMap ?? {},
        fieldMapping,
    );

    const picker = (
        <Config>
            <Config.Section>
                <Config.Heading>Data app visualization</Config.Heading>
                <DataAppVizLibraryPicker
                    projectUuid={projectUuid ?? ''}
                    selectedDataAppVizUuid={dataAppVizUuid || null}
                    selectedDataAppViz={dataAppViz ?? null}
                    onSelect={(picked) =>
                        setDataAppVizUuid(
                            picked.dataAppVizUuid,
                            autoMapDataAppVizFields(
                                picked.schema?.fields ?? [],
                                itemsMap ?? {},
                            ),
                        )
                    }
                />
            </Config.Section>
        </Config>
    );

    const generalPanel = (
        <Stack>
            {dataAppVizUuid ? (
                picker
            ) : (
                <DataAppVizPickOrCreate
                    picker={picker}
                    projectUuid={projectUuid ?? ''}
                    itemsMap={itemsMap ?? {}}
                    isBuilding={generation.isBuilding}
                    pendingPrompt={generation.pendingPrompt}
                    error={generation.error}
                    onRetry={null}
                    onSubmit={generation.generate}
                />
            )}

            {dataAppVizUuid && fields.length === 0 && (
                <Text c="dimmed" size="sm">
                    This visualization has no fields to map.
                </Text>
            )}

            {fields.map((field) => {
                const items = fieldItems(field);
                const selectedId = effectiveMapping[field.name];
                const selectedItem = selectedId
                    ? items.find((i) => getItemId(i) === selectedId)
                    : undefined;
                return (
                    <Config key={field.name}>
                        <Config.Section>
                            <Config.Heading>{field.label}</Config.Heading>
                            <FieldSelect
                                placeholder={`Select ${field.label.toLowerCase()}`}
                                disabled={items.length === 0}
                                item={selectedItem}
                                items={items}
                                onChange={(newField) =>
                                    setField(
                                        field.name,
                                        newField ? getItemId(newField) : null,
                                    )
                                }
                                clearable={!field.required}
                                hasGrouping
                            />
                        </Config.Section>
                    </Config>
                );
            })}
        </Stack>
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <DataAppVizOptionTabs
                // Remount on a viz switch so no control keeps the previous
                // viz's draft edit.
                key={dataAppVizUuid}
                generalContent={generalPanel}
                configOptions={configOptions}
                values={effectiveValues}
                onChange={(name, value) =>
                    setOption(dataAppVizUuid, name, value)
                }
                colorPalette={colorPalette}
                paletteControl={<ColorPaletteSection />}
                threadContent={
                    projectUuid && dataAppVizUuid ? (
                        <DataAppVizConversation
                            projectUuid={projectUuid}
                            dataAppVizUuid={dataAppVizUuid}
                            composer={{
                                itemsMap: itemsMap ?? {},
                                placeholder: 'Ask for a change…',
                                isBuilding: revision.isBuilding,
                                pendingPrompt: revision.pendingPrompt,
                                error: revision.error,
                                onRetry: revision.retry,
                                onSubmit: revision.iterate,
                            }}
                        />
                    ) : null
                }
            />
        </MantineProvider>
    );
});
