import {
    ConditionalFormattingConfig,
    createConditionalFormattingConfigWithSingleColor,
    FilterableItem,
    getItemId,
    isFilterableItem,
    isNumericItem,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import produce from 'immer';
import { useCallback, useMemo, useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { isTableVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigTable';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import ConditionalFormatting from './ConditionalFormatting';

const ConditionalFormattingList = ({}) => {
    const [isAddingNew, setIsAddingNew] = useState(false);
    const { itemsMap, resultsData, visualizationConfig, colorPalette } =
        useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isTableVisualizationConfig(visualizationConfig)) return undefined;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const activeFields = useMemo(() => {
        if (!resultsData) return new Set<string>();
        return new Set([
            ...resultsData.metricQuery.dimensions,
            ...resultsData.metricQuery.metrics,
            ...resultsData.metricQuery.tableCalculations.map((tc) => tc.name),
        ]);
    }, [resultsData]);

    const visibleActiveNumericFields = useMemo<FilterableItem[]>(() => {
        if (!itemsMap) return [];

        return Object.values(itemsMap)
            .filter((field) => activeFields.has(getItemId(field)))
            .filter(
                (field) => isNumericItem(field) && isFilterableItem(field),
            ) as FilterableItem[];
    }, [itemsMap, activeFields]);

    const activeConfigs = useMemo(() => {
        if (!chartConfig) return [];

        const { conditionalFormattings } = chartConfig;

        return conditionalFormattings.filter((config) => {
            return config.target
                ? visibleActiveNumericFields.find(
                      (field) => getItemId(field) === config.target?.fieldId,
                  )
                : true;
        });
    }, [chartConfig, visibleActiveNumericFields]);

    const handleAdd = useCallback(() => {
        if (!chartConfig) return;

        const { onSetConditionalFormattings } = chartConfig;

        setIsAddingNew(true);
        onSetConditionalFormattings(
            produce(activeConfigs, (draft) => {
                draft.push(
                    createConditionalFormattingConfigWithSingleColor(
                        colorPalette[0],
                    ),
                );
            }),
        );
    }, [chartConfig, activeConfigs, colorPalette]);

    const handleRemove = useCallback(
        (index: number) => {
            if (!chartConfig) return;

            const { onSetConditionalFormattings } = chartConfig;

            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft.splice(index, 1);
                }),
            );
        },
        [chartConfig, activeConfigs],
    );

    const handleChange = useCallback(
        (index: number, newConfig: ConditionalFormattingConfig) => {
            if (!chartConfig) return;

            const { onSetConditionalFormattings } = chartConfig;

            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [chartConfig, activeConfigs],
    );

    return (
        <Stack spacing="xs">
            {activeConfigs.map((conditionalFormatting, index) => (
                <ConditionalFormatting
                    key={index}
                    colorPalette={colorPalette}
                    isDefaultOpen={activeConfigs.length === 1 || isAddingNew}
                    index={index}
                    fields={visibleActiveNumericFields}
                    value={conditionalFormatting}
                    onChange={(newConfig) => handleChange(index, newConfig)}
                    onRemove={() => handleRemove(index)}
                />
            ))}

            <Button
                sx={{ alignSelf: 'start' }}
                size="xs"
                variant="outline"
                leftIcon={<MantineIcon icon={IconPlus} />}
                onClick={handleAdd}
            >
                Add new rule
            </Button>
        </Stack>
    );
};

export default ConditionalFormattingList;
