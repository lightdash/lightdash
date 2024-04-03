import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    isTimeInterval,
    timeFrameConfigs,
    type AdditionalMetric,
    type Item,
} from '@lightdash/common';
import {
    Group,
    Highlight,
    HoverCard,
    MantineProvider,
    NavLink,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import { darken, lighten } from 'polished';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import { useFilters } from '../../../../../hooks/useFilters';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import MantineIcon from '../../../../common/MantineIcon';
import { useItemDetail } from '../ItemDetailContext';
import { ItemDetailMarkdown, ItemDetailPreview } from '../ItemDetailPreview';
import { useTableTreeContext, type Node } from './TreeProvider';
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
    const theme = useMantineTheme();
    const { isFilteredField } = useFilters();
    const { showItemDetail } = useItemDetail();

    const [isHover, toggleHover] = useToggle(false);
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

    /**
     * Handles putting together and opening the shared modal for a field's
     * detailed description.
     */
    const onOpenDescriptionView = () => {
        toggleHover(false);

        showItemDetail({
            header: (
                <Group>
                    <FieldIcon
                        item={item}
                        color={getFieldIconColor(item)}
                        size="md"
                    />
                    <Text size="md">{label}</Text>
                </Group>
            ),
            detail: description ? (
                <ItemDetailMarkdown source={description}></ItemDetailMarkdown>
            ) : (
                <Text color="gray">No description available.</Text>
            ),
        });
    };

    const onToggleMenu = () => {
        toggleHover(false);
        toggleMenu();
    };

    return (
        <NavLink
            component="div"
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
            onMouseEnter={() => toggleHover(true)}
            onMouseLeave={() => toggleHover(false)}
            label={
                <Group noWrap>
                    <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                        <HoverCard
                            openDelay={300}
                            keepMounted={false}
                            shadow="sm"
                            withinPortal
                            withArrow
                            disabled={!description && !isMissing}
                            position="right"
                            /** Ensures the hover card does not overlap with the right-hand menu. */
                            offset={isFiltered ? 80 : 40}
                        >
                            <HoverCard.Target>
                                <Highlight
                                    component={Text}
                                    truncate
                                    sx={{ flexGrow: 1 }}
                                    highlight={searchQuery || ''}
                                >
                                    {label}
                                </Highlight>
                            </HoverCard.Target>
                            <HoverCard.Dropdown
                                hidden={!isHover}
                                /**
                                 * Takes up space to the right, so it's OK to go fairly wide in the interest
                                 * of readability.
                                 */
                                maw={500}
                                /**
                                 * If we don't stop propagation, users may unintentionally toggle dimensions/metrics
                                 * while interacting with the hovercard.
                                 */
                                onClick={(event) => event.stopPropagation()}
                                bg={theme.black}
                                p="xs"
                            >
                                {isMissing ? (
                                    `This field from '${item.table}' table is no longer available`
                                ) : (
                                    <ItemDetailPreview
                                        onViewDescription={
                                            onOpenDescriptionView
                                        }
                                        description={description}
                                    />
                                )}
                            </HoverCard.Dropdown>
                        </HoverCard>
                    </MantineProvider>

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
                    hasDescription={!!description}
                    onViewDescription={onOpenDescriptionView}
                    onMenuChange={onToggleMenu}
                />
            }
            data-testid={`tree-single-node-${label}`}
        />
    );
};

export default TreeSingleNode;
