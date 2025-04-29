import {
    type ItemsMap,
    isCustomDimension,
    isDateItem,
    isDimension,
    isMetric,
    isNumericType,
    isTableCalculation,
} from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconChartBar,
    IconChartBubble,
    IconFilter,
    IconFlame,
    IconStairs,
    IconWorld,
} from '@tabler/icons-react';
import { useCallback } from 'react';
import { COLLAPSABLE_CARD_POPOVER_PROPS } from '../../../../common/CollapsableCard/constants';
import MantineIcon from '../../../../common/MantineIcon';
import { generateVegaTemplate } from '../utils/templates';
import { TemplateType } from '../utils/vegaTemplates';

const getTemplateIcon = (template: TemplateType) => {
    switch (template) {
        case TemplateType.BAR_CHART:
            return IconChartBar;
        case TemplateType.HEATMAP:
            return IconFlame;
        case TemplateType.BUBBLE_PLOTS:
            return IconChartBubble;
        case TemplateType.FUNNEL_CHART:
            return IconFilter;
        case TemplateType.WATERFALL_CHART:
            return IconStairs;
        case TemplateType.MAP:
            return IconWorld;
    }

    return IconChartBar;
};
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
        <Menu {...COLLAPSABLE_CARD_POPOVER_PROPS} width={183} closeOnItemClick>
            <Menu.Dropdown>
                {Object.values(TemplateType).map((template) => (
                    <Menu.Item
                        key={template}
                        onClick={() => loadTemplate(template)}
                        icon={<MantineIcon icon={getTemplateIcon(template)} />}
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
                <Button
                    size="sm"
                    variant="subtle"
                    compact
                    leftIcon="+"
                    styles={{
                        leftIcon: {
                            marginRight: 2,
                        },
                    }}
                >
                    Insert template
                </Button>
            </Menu.Target>
        </Menu>
    );
};
