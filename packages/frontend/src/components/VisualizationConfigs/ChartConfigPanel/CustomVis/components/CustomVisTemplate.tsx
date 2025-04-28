import {
    type ItemsMap,
    isCustomDimension,
    isDateItem,
    isDimension,
    isMetric,
    isNumericType,
    isTableCalculation,
} from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine/core';
import { useCallback } from 'react';
import { generateVegaTemplate } from '../utils/templates';
import { TemplateType } from '../utils/vegaTemplates';

export const SelectTemplate = ({
    itemsMap,
    isCustomConfig,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    isCustomConfig: boolean;
    isEditorEmpty: boolean;
    setEditorConfig: (config: string) => void;
}) => {
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
        },
        [isCustomConfig, itemsMap, setEditorConfig],
    );

    return (
        <Menu position="bottom" withArrow withinPortal width={250}>
            <Menu.Dropdown>
                {Object.values(TemplateType).map((template) => (
                    <Menu.Item
                        key={template}
                        onClick={() => loadTemplate(template)}
                    >
                        {template}
                    </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Label>
                    Selecting a new template will reset the config. Use "ctrl+z"
                    to undo.
                </Menu.Label>
            </Menu.Dropdown>
            <Menu.Target>
                <ActionIcon w="150px" variant="subtle" color="blue.7">
                    + Insert template
                </ActionIcon>
            </Menu.Target>
        </Menu>
    );
};
