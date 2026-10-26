import {
    createConditionalFormattingConfigWithSingleColor,
    isFilterableItem,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingConfig,
    type FilterableItem,
} from '@lightdash/common';
import { Accordion } from '@mantine/core';
import { useCallback, useMemo, useRef, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    selectBigNumberEditor,
    selectBigNumberSelectedField,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useBigNumberEditorActions } from '../../../hooks/useBigNumberConfig';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import accordionClasses from '../common/Accordion.module.css';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { BigNumberConditionalFormattingItem } from './BigNumberConditionalFormattingItem';

export const BigNumberConditionalFormatting: FC = () => {
    const { itemsMap, colorPalette } = useVisualizationInputs();
    const selectedFieldId = useVisualizationInputSelector(
        selectBigNumberSelectedField,
    );
    const activeConfigs = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).conditionalFormattings,
    );
    const {
        conditionalFormattingAdd,
        conditionalFormattingRemove,
        conditionalFormattingChange,
    } = useBigNumberEditorActions();

    const selectedField = useMemo(() => {
        if (!selectedFieldId || !itemsMap) return undefined;
        const field = itemsMap[selectedFieldId];
        if (
            field &&
            (isNumericItem(field) || isStringDimension(field)) &&
            isFilterableItem(field)
        ) {
            return field as FilterableItem;
        }
        return undefined;
    }, [selectedFieldId, itemsMap]);

    const configIdsRef = useRef<string[]>([]);
    // Filled during render so a new rule keeps one key from its first render; idempotent under StrictMode
    while (configIdsRef.current.length < activeConfigs.length) {
        configIdsRef.current.push(uuidv4());
    }

    const handleAdd = useCallback(() => {
        conditionalFormattingAdd(
            createConditionalFormattingConfigWithSingleColor(colorPalette[0]),
        );
    }, [conditionalFormattingAdd, colorPalette]);

    const handleRemove = useCallback(
        (index: number) => {
            configIdsRef.current.splice(index, 1);
            conditionalFormattingRemove(index);
        },
        [conditionalFormattingRemove],
    );

    const handleChange = useCallback(
        (index: number, newConfig: ConditionalFormattingConfig) =>
            conditionalFormattingChange(index, newConfig),
        [conditionalFormattingChange],
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
                    chevronPosition="right"
                    className={accordionClasses.containedList}
                    transparentActiveItem
                >
                    {activeConfigs.map((conditionalFormatting, index) => (
                        <BigNumberConditionalFormattingItem
                            key={configIdsRef.current[index]}
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
