import {
    isDimension,
    isField,
    isTimeInterval,
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
import { Node, useTableTreeContext } from './TreeProvider';
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

    const label = timeIntervalLabel || item.label || item.name;

    const bgColor = getItemBgColor(item);

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
                <FieldIcon
                    item={item}
                    color={isDimension(item) ? 'blue.9' : 'yellow.9'}
                    size="md"
                />
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
                        disabled={!item.description}
                        label={item.description}
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

                    {item.hidden ? (
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
