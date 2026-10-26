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
import { useCallback, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    selectTableEditor,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useTableEditorActions } from '../../../hooks/tableVisualization/useTableConfig';
import { useVisualizationInputs } from '../../LightdashVisualization/useVisualizationContext';
import accordionClasses from '../common/Accordion.module.css';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';
import { ConditionalFormattingItem } from './ConditionalFormattingItem';

const ConditionalFormattingList = ({}) => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const { itemsMap, resultsData, colorPalette } = useVisualizationInputs();
    const conditionalFormattings = useVisualizationSelector(
        (state) => selectTableEditor(state).conditionalFormattings,
    );
    const { onSetConditionalFormattings } = useTableEditorActions();

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

    const activeConfigs = useMemo(() => {
        return conditionalFormattings.filter((config) => {
            return config.target
                ? fieldsForConditionalFormatting.find(
                      (field) => getItemId(field) === config.target?.fieldId,
                  )
                : true;
        });
    }, [conditionalFormattings, fieldsForConditionalFormatting]);

    const configIdsRef = useRef<string[]>([]);
    // Filled during render so a new rule keeps one key from its first render; idempotent under StrictMode
    while (configIdsRef.current.length < activeConfigs.length) {
        configIdsRef.current.push(uuidv4());
    }

    const handleAdd = useCallback(() => {
        onSetConditionalFormattings(
            produce(activeConfigs, (draft) => {
                draft.push(
                    createConditionalFormattingConfigWithSingleColor(
                        colorPalette[0],
                    ),
                );
                addNewItem(`${draft.length}`);
            }),
        );
    }, [onSetConditionalFormattings, activeConfigs, colorPalette, addNewItem]);

    const handleRemove = useCallback(
        (index: number) => {
            configIdsRef.current.splice(index, 1);

            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft.splice(index, 1);
                }),
            );
        },
        [onSetConditionalFormattings, activeConfigs],
    );

    const handleChange = useCallback(
        (index: number, newConfig: ConditionalFormattingConfig) => {
            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [onSetConditionalFormattings, activeConfigs],
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
                            key={configIdsRef.current[index]}
                            isOpen={openItems.includes(`${index}`)}
                            addNewItem={addNewItem}
                            removeItem={removeItem}
                            colorPalette={colorPalette}
                            index={index + 1}
                            fields={fieldsForConditionalFormatting}
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

export default ConditionalFormattingList;
