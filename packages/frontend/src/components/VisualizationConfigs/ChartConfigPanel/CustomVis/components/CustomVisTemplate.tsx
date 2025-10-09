import {
    type ItemsMap,
    sortedItemsForXAxis,
    sortedItemsForYAxis,
} from '@lightdash/common';
import { Button, Menu } from '@mantine-8/core';
import {
    IconChartBar,
    IconChartBubble,
    IconFilter,
    IconFlame,
    IconPlus,
    IconStairs,
    IconWorld,
} from '@tabler/icons-react';
import { useCallback } from 'react';
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
};

export const CustomVisTemplate = ({
    itemsMap,
    isCustomConfig,
    setEditorConfig,
    isInGroup,
}: {
    itemsMap: ItemsMap | undefined;
    isCustomConfig: boolean;
    isEditorEmpty: boolean;
    setEditorConfig: (config: string) => void;
    isInGroup: boolean;
}) => {
    const loadTemplate = useCallback(
        (template: TemplateType) => {
            if (!isCustomConfig) return null;

            const xField = sortedItemsForXAxis(itemsMap)[0];
            const [yField, extraField] = sortedItemsForYAxis(itemsMap);

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
        <Menu closeOnItemClick>
            <Menu.Dropdown>
                {Object.values(TemplateType).map((template) => (
                    <Menu.Item
                        key={template}
                        onClick={() => loadTemplate(template)}
                        leftSection={
                            <MantineIcon icon={getTemplateIcon(template)} />
                        }
                    >
                        {template}
                    </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Label w="150" fz="xs">
                    Selecting a new template will reset the config. Use "ctrl+z"
                    to undo.
                </Menu.Label>
            </Menu.Dropdown>
            <Menu.Target>
                <Button
                    size="compact-sm"
                    variant="default"
                    fz="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    styles={{
                        root: {
                            borderTopRightRadius: isInGroup ? 0 : undefined,
                            borderBottomRightRadius: isInGroup ? 0 : undefined,
                            borderRightRadius: isInGroup ? 0 : undefined,
                        },
                    }}
                >
                    Insert template
                </Button>
            </Menu.Target>
        </Menu>
    );
};
