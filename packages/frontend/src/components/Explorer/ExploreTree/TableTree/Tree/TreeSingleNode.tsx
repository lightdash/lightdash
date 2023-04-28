import {
    DimensionType,
    isDimension,
    isTimeInterval,
    MetricType,
    timeFrameConfigs,
} from '@lightdash/common';
import { Highlight, NavLink, Text, Tooltip } from '@mantine/core';
import { darken, lighten } from 'polished';
import { FC } from 'react';
import { useToggle } from 'react-use';

import { getItemBgColor } from '../../../../../hooks/useColumns';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import { Node, useTableTreeContext } from './TreeProvider';
import TreeSingleNodeActions from './TreeSingleNodeActions';

export const getItemIconName = (type: DimensionType | MetricType) => {
    switch (type) {
        case DimensionType.STRING || MetricType.STRING:
            return 'citation';
        case DimensionType.NUMBER || MetricType.NUMBER:
            return 'numerical';
        case DimensionType.DATE || MetricType.DATE:
            return 'calendar';
        case DimensionType.BOOLEAN || MetricType.BOOLEAN:
            return 'segmented-control';
        case DimensionType.TIMESTAMP:
            return 'time';
        default:
            return 'numerical';
    }
};

const TreeSingleNode: FC<{ node: Node }> = ({ node }) => {
    const [isHover, toggle] = useToggle(false);
    const {
        itemsMap,
        selectedItems,
        isSearching,
        searchResults,
        searchQuery,
        onItemClick,
    } = useTableTreeContext();

    const isSelected = selectedItems.has(node.key);
    const isVisible = !isSearching || searchResults.has(node.key);
    const item = itemsMap[node.key];

    if (!item || !isVisible) return null;

    const timeIntervalLabel =
        isDimension(item) &&
        item.timeInterval &&
        isTimeInterval(item.timeInterval)
            ? timeFrameConfigs[item.timeInterval].getLabel()
            : undefined;

    const label = timeIntervalLabel || item.label || item.name;

    const bgColor = getItemBgColor(item);

    return (
        <NavLink
            sx={{
                backgroundColor: isSelected ? bgColor : undefined,
                '&:hover': {
                    backgroundColor: isSelected
                        ? darken(0.02, bgColor)
                        : lighten(0.1, bgColor),
                },
            }}
            icon={
                <FieldIcon
                    item={item}
                    color={isDimension(item) ? 'blue.9' : 'yellow.9'}
                    size="md"
                />
            }
            onClick={() => onItemClick(node.key, item)}
            onMouseEnter={() => toggle(true)}
            onMouseLeave={() => toggle(false)}
            noWrap
            label={
                <Tooltip
                    withArrow
                    inline
                    openDelay={500}
                    disabled={!item.description}
                    label={<Text truncate>{item.description}</Text>}
                    position="top-start"
                    maw={350}
                >
                    <Highlight
                        component={Text}
                        highlight={searchQuery || ''}
                        truncate
                    >
                        {label}
                    </Highlight>
                </Tooltip>
            }
            rightSection={
                <TreeSingleNodeActions
                    node={item}
                    isHovered={isHover}
                    isSelected={isSelected}
                />
            }
        ></NavLink>
    );
};

export default TreeSingleNode;
