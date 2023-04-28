import { Classes, Colors } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    DimensionType,
    isAdditionalMetric,
    isDimension,
    isTimeInterval,
    MetricType,
    timeFrameConfigs,
} from '@lightdash/common';
import { Highlight, NavLink, Text, Tooltip } from '@mantine/core';
import { FC } from 'react';
import { useToggle } from 'react-use';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import CustomMetricButtons from './CustomMetricButtons';
import FieldButtons from './FieldButtons';
import { Node, useTableTreeContext } from './TreeProvider';

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
    const label: string = timeIntervalLabel || item.label || item.name;
    return (
        <NavLink
            bg={isSelected ? getItemBgColor(item) : undefined}
            noWrap
            icon={
                <FieldIcon
                    item={item}
                    color={isDimension(item) ? Colors.BLUE1 : Colors.ORANGE1}
                    size={16}
                />
            }
            onClick={() => onItemClick(node.key, item)}
            onMouseEnter={() => toggle(true)}
            onMouseLeave={() => toggle(false)}
            label={
                <Tooltip
                    withArrow
                    disabled={!item.description}
                    label={item.description}
                    position="top-start"
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
                isAdditionalMetric(item) ? (
                    <CustomMetricButtons
                        node={item}
                        isHovered={isHover}
                        isSelected={isSelected}
                    />
                ) : (
                    <FieldButtons
                        node={item}
                        onOpenSourceDialog={() => undefined}
                        isHovered={isHover}
                        isSelected={isSelected}
                    />
                )
            }
        ></NavLink>
    );
};

export default TreeSingleNode;
