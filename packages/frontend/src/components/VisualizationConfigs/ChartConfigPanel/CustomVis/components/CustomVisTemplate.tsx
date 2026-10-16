import {
    sortedItemsForXAxis,
    sortedItemsForYAxis,
    type ItemsMap,
} from '@lightdash/common';
import { Menu, Button } from '@mantine/core';
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
import { useTranslation } from 'react-i18next';
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

const TEMPLATE_LABEL_KEYS: Record<TemplateType, string> = {
    [TemplateType.BAR_CHART]: 'customVis.templates.barChart',
    [TemplateType.HEATMAP]: 'customVis.templates.heatmap',
    [TemplateType.BUBBLE_PLOTS]: 'customVis.templates.bubblePlots',
    [TemplateType.FUNNEL_CHART]: 'customVis.templates.funnelChart',
    [TemplateType.WATERFALL_CHART]: 'customVis.templates.waterfallChart',
    [TemplateType.MAP]: 'customVis.templates.worldMap',
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
    const { t } = useTranslation('vizConfig');
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
        <Menu
            position="bottom"
            withArrow
            closeOnClickOutside
            closeOnEscape
            offset={2}
            width={183}
            closeOnItemClick
        >
            <Menu.Dropdown>
                {Object.values(TemplateType).map((template) => (
                    <Menu.Item
                        key={template}
                        onClick={() => loadTemplate(template)}
                        leftSection={
                            <MantineIcon icon={getTemplateIcon(template)} />
                        }
                    >
                        {t(TEMPLATE_LABEL_KEYS[template])}
                    </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Label>{t('customVis.templateResetWarning')}</Menu.Label>
            </Menu.Dropdown>
            <Menu.Target>
                <Button
                    variant="default"
                    size="compact-sm"
                    fz="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                >
                    {t('customVis.insertTemplate')}
                </Button>
            </Menu.Target>
        </Menu>
    );
};
