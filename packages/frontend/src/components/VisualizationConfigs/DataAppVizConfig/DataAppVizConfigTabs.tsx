import {
    getEffectiveOptionValues,
    getItemId,
    type DataAppVizField,
    type Item,
} from '@lightdash/common';
import { Stack, Text } from '@mantine-8/core';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import DataAppVizLibraryPicker from '../../../features/apps/components/DataAppVizLibraryPicker';
import { useDataAppVisualization } from '../../../features/apps/hooks/useDataAppVisualization';
import { autoMapDataAppVizFields } from '../../../features/apps/utils/autoMapDataAppVizFields';
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

    const generalPanel = (
        <Stack>
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

            {dataAppVizUuid && fields.length === 0 && (
                <Text c="dimmed" size="sm">
                    This visualization has no fields to map.
                </Text>
            )}

            {fields.map((field) => {
                const items = fieldItems(field);
                const selectedId = fieldMapping[field.name];
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
            />
        </MantineProvider>
    );
});
