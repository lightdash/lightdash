import {
    getItemId,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type DataAppVizField,
    type Item,
} from '@lightdash/common';
import {
    MantineProvider,
    Stack,
    Text,
    useMantineColorScheme,
} from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import DataAppVizLibraryPicker from '../../../features/apps/components/DataAppVizLibraryPicker';
import { useDataAppVisualization } from '../../../features/apps/hooks/useDataAppVisualization';
import FieldSelect from '../../common/FieldSelect';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { getVizConfigThemeOverride } from '../mantineTheme';

const isDimensionItem = (item: Item): boolean =>
    isDimension(item) || isCustomDimension(item);

const isMetricItem = (item: Item): boolean =>
    isMetric(item) || isTableCalculation(item);

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

    const allItems = useMemo(() => Object.values(itemsMap ?? {}), [itemsMap]);
    const dimensions = useMemo(
        () => allItems.filter(isDimensionItem),
        [allItems],
    );
    const metrics = useMemo(() => allItems.filter(isMetricItem), [allItems]);

    const fieldItems = (field: DataAppVizField): Item[] =>
        field.type === 'metric' ? metrics : dimensions;

    if (!isDataAppViz) return null;

    const { setDataAppVizUuid, setField, fieldMapping } =
        visualizationConfig.chartConfig;
    const fields = dataAppViz?.schema?.fields ?? [];

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Stack>
                <Config>
                    <Config.Section>
                        <Config.Heading>Data app visualization</Config.Heading>
                        <DataAppVizLibraryPicker
                            projectUuid={projectUuid ?? ''}
                            selectedDataAppVizUuid={dataAppVizUuid || null}
                            onSelect={setDataAppVizUuid}
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
                                <Config.Heading>
                                    {field.label}
                                    {field.required ? ' *' : ''}
                                </Config.Heading>
                                <FieldSelect
                                    placeholder={`Select ${field.label.toLowerCase()}`}
                                    disabled={items.length === 0}
                                    item={selectedItem}
                                    items={items}
                                    onChange={(newField) =>
                                        setField(
                                            field.name,
                                            newField
                                                ? getItemId(newField)
                                                : null,
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
        </MantineProvider>
    );
});
