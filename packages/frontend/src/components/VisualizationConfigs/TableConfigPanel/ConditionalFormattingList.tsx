import {
    createConditionalFormattingConfigWithSingleColor,
    getItemId,
    isBooleanItem,
    isFilterableItem,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingConfig,
    type FilterableItem,
} from '@lightdash/common';
import { Accordion } from '@mantine/core';
import { produce } from 'immer';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import accordionClasses from '../common/Accordion.module.css';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';
import { ConditionalFormattingItem } from './ConditionalFormattingItem';

type Props = {
    /** The fields rules can target. */
    fields: FilterableItem[];
    conditionalFormattings: ConditionalFormattingConfig[];
    onChange: (conditionalFormattings: ConditionalFormattingConfig[]) => void;
    colorPalette: string[];
    /** Cell/text/row targeting and text styles, which only tables draw. */
    showTableStyleControls: boolean;
};

export const ConditionalFormattingList: FC<Props> = ({
    fields,
    conditionalFormattings,
    onChange,
    colorPalette,
    showTableStyleControls,
}) => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const activeConfigs = useMemo(
        () =>
            conditionalFormattings.filter((config) =>
                config.target
                    ? fields.find(
                          (field) =>
                              getItemId(field) === config.target?.fieldId,
                      )
                    : true,
            ),
        [conditionalFormattings, fields],
    );

    const configIdsRef = useRef<string[]>([]);
    // Ensure we have best effort stable IDs for each config (generates new IDs for new configs)
    // This prevents focus loss when editing and ensures correct item deletion.
    useEffect(() => {
        while (configIdsRef.current.length < activeConfigs.length) {
            configIdsRef.current.push(uuidv4());
        }
    }, [activeConfigs.length]);

    const handleAdd = useCallback(() => {
        onChange(
            produce(activeConfigs, (draft) => {
                draft.push(
                    createConditionalFormattingConfigWithSingleColor(
                        colorPalette[0],
                    ),
                );
                addNewItem(`${draft.length}`);
            }),
        );
    }, [onChange, activeConfigs, colorPalette, addNewItem]);

    const handleRemove = useCallback(
        (index: number) => {
            configIdsRef.current.splice(index, 1);

            onChange(
                produce(activeConfigs, (draft) => {
                    draft.splice(index, 1);
                }),
            );
        },
        [onChange, activeConfigs],
    );

    const handleChange = useCallback(
        (index: number, newConfig: ConditionalFormattingConfig) => {
            onChange(
                produce(activeConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [onChange, activeConfigs],
    );

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Rules and Conditions</Config.Heading>
                    <AddButton onClick={handleAdd} />
                </Config.Group>
                <Accordion
                    multiple
                    variant="contained"
                    value={openItems}
                    onChange={handleAccordionChange}
                    className={accordionClasses.containedList}
                    transparentActiveItem
                >
                    {activeConfigs.map((conditionalFormatting, index) => (
                        <ConditionalFormattingItem
                            key={configIdsRef.current[index] ?? index}
                            isOpen={openItems.includes(`${index}`)}
                            addNewItem={addNewItem}
                            removeItem={removeItem}
                            colorPalette={colorPalette}
                            index={index + 1}
                            fields={fields}
                            value={conditionalFormatting}
                            showTableStyleControls={showTableStyleControls}
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

const TableConditionalFormattingList: FC = () => {
    const { itemsMap, resultsData, visualizationConfig, colorPalette } =
        useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isTableVisualizationConfig(visualizationConfig)) return undefined;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const activeFields = useMemo(() => {
        if (!resultsData?.metricQuery) return new Set<string>();
        return new Set([
            ...resultsData.metricQuery.dimensions,
            ...resultsData.metricQuery.metrics,
            ...resultsData.metricQuery.tableCalculations.map((tc) => tc.name),
        ]);
    }, [resultsData]);

    const fieldsForConditionalFormatting = useMemo<FilterableItem[]>(() => {
        if (!itemsMap) return [];
        return Object.values(itemsMap)
            .filter((field) => activeFields.has(getItemId(field)))
            .filter(
                (field) =>
                    (isNumericItem(field) ||
                        isStringDimension(field) ||
                        isBooleanItem(field)) &&
                    isFilterableItem(field),
            ) as FilterableItem[];
    }, [itemsMap, activeFields]);

    if (!chartConfig) return null;

    return (
        <ConditionalFormattingList
            fields={fieldsForConditionalFormatting}
            conditionalFormattings={chartConfig.conditionalFormattings}
            onChange={chartConfig.onSetConditionalFormattings}
            colorPalette={colorPalette}
            showTableStyleControls
        />
    );
};

export default TableConditionalFormattingList;
