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
import {
    Anchor,
    Box,
    Flex,
    Group,
    Highlight,
    NavLink,
    Popover,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { darken, lighten } from 'polished';
import { FC } from 'react';
import { useToggle } from 'react-use';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import { useFilters } from '../../../../../hooks/useFilters';
import { rehypeRemoveHeaderLinks } from '../../../../../utils/markdownUtils';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import MantineIcon from '../../../../common/MantineIcon';
import { useItemDetail } from '../ItemDetailContext';
import { Node, useTableTreeContext } from './TreeProvider';
import TreeSingleNodeActions from './TreeSingleNodeActions';

type Props = {
    node: Node;
};

/**
 * Renders markdown for an item's description, with additional constraints
 * to avoid markdown styling from completely throwing its surroundings out
 * of whack.
 */
const NodeDetailMarkdown: FC<{ source: string }> = ({ source }) => {
    const theme = useMantineTheme();
    return (
        <MarkdownPreview
            skipHtml
            linkTarget="_blank"
            components={{
                h1: ({ children }) => <Title order={2}>{children}</Title>,
                h2: ({ children }) => <Title order={3}>{children}</Title>,
                h3: ({ children }) => <Title order={4}>{children}</Title>,
            }}
            rehypeRewrite={rehypeRemoveHeaderLinks}
            source={source}
            disallowedElements={['img']}
            style={{
                fontSize: theme.fontSizes.sm,
            }}
        />
    );
};

/**
 * Renders a truncated version of an item's description, with an option
 * to read the full description if necessary.
 */
const NodeDetailPreview: FC<{
    description?: string;
    onViewDescription: () => void;
}> = ({ description, onViewDescription }) => {
    if (!description) return null;

    /**
     * This value is pretty arbitrary - it's an amount of characters that will exceed
     * a single line, and for which the 'Read more' option should make sense, and not
     * be an annoyance.
     *
     * It's better to err on the side of caution, and show the 'Read more' option even
     * if unnecessarily so.
     */
    const isTruncated = description.length > 180;

    return (
        <Flex direction="column" gap={'xs'}>
            <Box
                mah={140}
                style={{
                    overflow: 'hidden',
                    textOverflow: 'clip',
                }}
            >
                <NodeDetailMarkdown source={description} />
            </Box>
            {isTruncated && (
                <Box
                    ta={'center'}
                    /**
                     * Forces the 'Read more' option to slightly overlap with the content, and show
                     * a slight fade effect.
                     */
                    mt={-30}
                    pt={20}
                    style={{
                        background:
                            'linear-gradient(rgba(255,255,255,0) 0%, rgba(255,255,255,1) 60%, rgba(255,255,255,1) 100%)',
                    }}
                >
                    <Anchor
                        onClick={(e) => {
                            e.preventDefault();
                            onViewDescription();
                        }}
                    >
                        Read full description
                    </Anchor>
                </Box>
            )}
        </Flex>
    );
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
                <NodeDetailMarkdown
                    source={description ?? ''}
                ></NodeDetailMarkdown>
            ) : (
                <Text color="gray">No description available.</Text>
            ),
        });
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
                    <Popover
                        opened={isHover}
                        keepMounted={false}
                        shadow="sm"
                        withinPortal
                        disabled={!description && !isMissing}
                        position="right"
                        /** Ensures the hover card does not overlap with the right-hand menu. */
                        offset={40}
                    >
                        <Popover.Target>
                            <Highlight
                                component={Text}
                                truncate
                                sx={{ flexGrow: 1 }}
                                highlight={searchQuery || ''}
                            >
                                {label}
                            </Highlight>
                        </Popover.Target>
                        <Popover.Dropdown
                            p="xs"
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
                        >
                            {isMissing ? (
                                `This field from '${item.table}' table is no longer available`
                            ) : (
                                <NodeDetailPreview
                                    onViewDescription={onOpenDescriptionView}
                                    description={description}
                                />
                            )}
                        </Popover.Dropdown>
                    </Popover>

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
                    onMenuChange={toggleMenu}
                />
            }
            data-testid={`tree-single-node-${label}`}
        />
    );
};

export default TreeSingleNode;
