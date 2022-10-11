import { Classes, Colors, Text } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    DimensionType,
    isAdditionalMetric,
    isDimension,
    isTimeInterval,
    MetricType,
    timeFrameConfigs,
} from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import HighlightedText from '../../../../common/HighlightedText';
import { Highlighted, Row, RowIcon, SpanFlex } from '../TableTree.styles';
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

const TreeSingleNode: FC<{ node: Node; depth: number }> = ({ node, depth }) => {
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

    if (!item || !isVisible) {
        return null;
    }

    if (isDimension(item) && item.timeInterval) {
        // @ts-ignore
        item.timeInterval = 'day';
    }

    const timeIntervalLabel =
        isDimension(item) &&
        item.timeInterval &&
        isTimeInterval(item.timeInterval)
            ? timeFrameConfigs[item.timeInterval].getLabel()
            : undefined;
    const label: string = timeIntervalLabel || item.label || item.name;
    return (
        <Row
            depth={depth}
            selected={isSelected}
            bgColor={getItemBgColor(item)}
            onClick={() => onItemClick(node.key, item)}
            onMouseEnter={() => toggle(true)}
            onMouseLeave={() => toggle(false)}
        >
            <RowIcon
                icon={getItemIconName(item.type)}
                color={isDimension(item) ? Colors.BLUE1 : Colors.ORANGE1}
                size={16}
            />
            <Tooltip2
                lazy
                content={item.description}
                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
            >
                <Text ellipsize>
                    <HighlightedText
                        text={label}
                        query={searchQuery || ''}
                        highlightElement={Highlighted}
                    />
                </Text>
            </Tooltip2>
            <SpanFlex />
            {isAdditionalMetric(item) ? (
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
            )}
        </Row>
    );
};

export default TreeSingleNode;
