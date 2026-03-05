import {
    createConditionalFormattingConfigWithSingleColor,
    isFilterableItem,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingConfig,
    type FilterableItem,
} from '@lightdash/common';
import { Accordion } from '@mantine-8/core';
import { produce } from 'immer';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { BigNumberConditionalFormattingItem } from './BigNumberConditionalFormattingItem';

export const BigNumberConditionalFormatting: FC = () => {
    const { itemsMap, visualizationConfig, colorPalette } =
        useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isBigNumberVisualizationConfig(visualizationConfig))
            return undefined;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const selectedField = useMemo(() => {
        if (!chartConfig?.selectedField || !itemsMap) return undefined;
        const field = itemsMap[chartConfig.selectedField];
        if (
            field &&
            (isNumericItem(field) || isStringDimension(field)) &&
            isFilterableItem(field)
        ) {
            return field as FilterableItem;
        }
        return undefined;
    }, [chartConfig?.selectedField, itemsMap]);

    const activeConfigs = useMemo(
        () => chartConfig?.conditionalFormattings ?? [],
        [chartConfig?.conditionalFormattings],
    );

    const configIdsRef = useRef<string[]>([]);
    useEffect(() => {
        while (configIdsRef.current.length < activeConfigs.length) {
            configIdsRef.current.push(uuidv4());
        }
    }, [activeConfigs.length]);

    const handleAdd = useCallback(() => {
        if (!chartConfig) return;

        chartConfig.onSetConditionalFormattings(
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

            configIdsRef.current.splice(index, 1);

            chartConfig.onSetConditionalFormattings(
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

            chartConfig.onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [chartConfig, activeConfigs],
    );

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Rules and Conditions</Config.Heading>
                    <AddButton onClick={handleAdd} />
                </Config.Group>
                <Accordion multiple variant="contained" radius="md">
                    {activeConfigs.map((conditionalFormatting, index) => (
                        <BigNumberConditionalFormattingItem
                            key={configIdsRef.current[index] ?? index}
                            colorPalette={colorPalette}
                            index={index + 1}
                            field={selectedField}
                            value={conditionalFormatting}
                            onChange={(newConfig) =>
                                handleChange(index, newConfig)
                            }
                            onRemove={() => handleRemove(index)}
                        />
                    ))}
                </Accordion>
            </Config.Section>
        </Config>
    );
};
