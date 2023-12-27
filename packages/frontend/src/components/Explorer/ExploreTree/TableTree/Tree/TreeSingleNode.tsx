import {
    AdditionalMetric,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    isTimeInterval,
    Item,
    timeFrameConfigs,
} from '@lightdash/common';
import { Group, Highlight, NavLink, Text, Tooltip } from '@mantine/core';
import { darken, lighten } from 'polished';
import { FC } from 'react';
import { useToggle } from 'react-use';

import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import { useFilters } from '../../../../../hooks/useFilters';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import MantineIcon from '../../../../common/MantineIcon';
import { Node } from './TreeProvider';
import { useTableTreeContext } from './TreeProvider/useTableTreeContext';
import TreeSingleNodeActions from './TreeSingleNodeActions';

type Props = {
    node: Node;
};

const TreeSingleNode: FC<Props> = ({ node }) => {
    const {
        itemsMap,
        selectedItems,
        isSearching,
        searchResults,
        searchQuery,
        missingCustomMetrics,
        onItemClick,
    } = useTableTreeContext();
    const { isFilteredField } = useFilters();

    const [isHover, toggle] = useToggle(false);
    const [isMenuOpen, toggleMenu] = useToggle(false);

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

    const isFiltered = isField(item) && isFilteredField(item);

    const label =
        isField(item) || isAdditionalMetric(item)
            ? timeIntervalLabel || item.label || item.name
            : item.name;

    const isMissing =
        isAdditionalMetric(item) &&
        missingCustomMetrics &&
        missingCustomMetrics.includes(item);
    const description = isField(item) ? item.description : undefined;
    const bgColor = getItemBgColor(item);

    // TODO: Add getFieldType function to common which should return FieldType enum (which should also have CUSTOM_METRIC, CUSTOM_DIMENSION, and TABLE_CALCULATION)
    const getFieldIconColor = (field: Item | AdditionalMetric) => {
        if (isCustomDimension(field) || isDimension(field)) return 'blue.9';
        if (isAdditionalMetric(field)) return 'yellow.9';
        if (isTableCalculation(field)) return 'green.9';
        if (isMetric(field)) return 'yellow.9';

        return 'yellow.9';
    };

    return (
        <NavLink
            noWrap
            sx={{
                backgroundColor: isSelected ? bgColor : undefined,
                '&:hover': {
                    backgroundColor: isSelected
                        ? darken(0.02, bgColor)
                        : lighten(0.1, bgColor),
                },
            }}
            icon={
                isMissing ? (
                    <MantineIcon icon={IconAlertTriangle} color="gray.7" />
                ) : (
                    <FieldIcon
                        item={item}
                        color={getFieldIconColor(item)}
                        size="md"
                    />
                )
            }
            onClick={() => onItemClick(node.key, item)}
            onMouseEnter={() => toggle(true)}
            onMouseLeave={() => toggle(false)}
            label={
                <Group noWrap>
                    <Tooltip
                        withinPortal
                        multiline
                        sx={{ whiteSpace: 'normal' }}
                        disabled={!description && !isMissing}
                        label={
                            isMissing
                                ? `This field from '${item.table}' table is no longer available`
                                : description
                        }
                        position="top-start"
                        maw={700}
                    >
                        <Highlight
                            component={Text}
                            truncate
                            sx={{ flexGrow: 1 }}
                            highlight={searchQuery || ''}
                        >
                            {label}
                        </Highlight>
                    </Tooltip>

                    {isFiltered ? (
                        <Tooltip withinPortal label="This field is filtered">
                            <MantineIcon
                                icon={IconFilter}
                                color="gray.7"
                                style={{ flexShrink: 0 }}
                            />
                        </Tooltip>
                    ) : null}

                    {isField(item) && item.hidden ? (
                        <Tooltip
                            withinPortal
                            label="This field has been hidden in the dbt project. It's recommend to remove it from the query"
                        >
                            <MantineIcon
                                icon={IconAlertTriangle}
                                color="yellow.9"
                                style={{ flexShrink: 0 }}
                            />
                        </Tooltip>
                    ) : null}
                </Group>
            }
            rightSection={
                <TreeSingleNodeActions
                    item={item}
                    isHovered={isHover}
                    isSelected={isSelected}
                    isOpened={isMenuOpen}
                    onMenuChange={toggleMenu}
                />
            }
        />
    );
};

export default TreeSingleNode;
