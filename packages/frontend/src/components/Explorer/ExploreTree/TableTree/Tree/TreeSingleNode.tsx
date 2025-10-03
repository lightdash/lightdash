import {
    addFilterRule,
    getItemId,
    isAdditionalMetric,
    isCompiledMetric,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    isTableCalculation,
    isTimeInterval,
    timeFrameConfigs,
    type AdditionalMetric,
    type FilterableField,
    type Item,
} from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Highlight,
    HoverCard,
    NavLink,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconFilter,
    IconInfoCircle,
} from '@tabler/icons-react';
import { darken, lighten } from 'polished';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import {
    explorerActions,
    selectFilters,
    selectIsFieldActive,
    selectIsFieldFiltered,
    selectIsFiltersExpanded,
    useExplorerDispatch,
    useExplorerSelector,
    useExplorerStore,
    type ExplorerStoreState,
} from '../../../../../features/explorer/store';
import { getItemBgColor } from '../../../../../hooks/useColumns';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import MantineIcon from '../../../../common/MantineIcon';
import { ItemDetailPreview } from '../ItemDetailPreview';
import TreeSingleNodeActions from './TreeSingleNodeActions';
import { type Node } from './types';
import useTableTree from './useTableTree';

// TODO: Add getFieldType function to common which should return FieldType enum (which should also have CUSTOM_METRIC, CUSTOM_DIMENSION)
const getFieldIconColor = (field: Item | AdditionalMetric) => {
    if (isCustomDimension(field) || isDimension(field)) return 'blue.9';
    if (isAdditionalMetric(field)) return 'yellow.9';
    if (isTableCalculation(field)) return 'green.9';
    if (isMetric(field)) return 'yellow.9';

    return 'yellow.9';
};

const NavItemIcon = ({
    isMissing,
    item,
}: {
    isMissing?: boolean;
    item: Item | AdditionalMetric;
}) => {
    return isMissing ? (
        <MantineIcon icon={IconAlertTriangle} color="gray.7" />
    ) : (
        <FieldIcon item={item} color={getFieldIconColor(item)} size="md" />
    );
};

NavItemIcon.displayName = 'NavItemIcon';

type Props = {
    node: Node;
};

const TreeSingleNodeComponent: FC<Props> = ({ node }) => {
    const itemsMap = useTableTree((context) => {
        return context.itemsMap;
    });
    // Note: selectedItems removed - using Redux selector instead for better performance
    const isSearching = useTableTree((context) => context.isSearching);
    const searchResults = useTableTree((context) => context.searchResults);
    const searchQuery = useTableTree((context) => context.searchQuery);
    const missingCustomMetrics = useTableTree(
        (context) => context.missingCustomMetrics,
    );
    const itemsAlerts = useTableTree((context) => context.itemsAlerts);
    const missingCustomDimensions = useTableTree(
        (context) => context.missingCustomDimensions,
    );
    const onItemClick = useTableTree((context) => context.onItemClick);
    // TODO: Fix useItemDetail() - it subscribes to ItemDetailContext which causes ALL nodes to re-render
    // when isItemDetailOpen changes. For now, comment it out for the performance demo.
    // const { showItemDetail } = useItemDetail();
    const { track } = useTracking();

    // Create stable addFilter action directly without hook
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();
    const addFilter = useCallback(
        (field: FilterableField, value: any) => {
            const currentFilters = selectFilters(store.getState());
            const newFilters = addFilterRule({
                filters: currentFilters,
                field,
                value,
            });
            dispatch(explorerActions.setFilters(newFilters));

            const isFiltersExpanded = selectIsFiltersExpanded(store.getState());
            if (!isFiltersExpanded) {
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                );
            }

            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        },
        [dispatch, store],
    );

    const [isHover, toggleHover] = useToggle(false);
    const [isMenuOpen, toggleMenu] = useToggle(false);

    const isVisible = !isSearching || searchResults.includes(node.key);

    const item = itemsMap[node.key];

    // Use item-level selectors with equality check to prevent unnecessary re-renders
    // Each node only subscribes to its own state, not the entire activeFields/filters
    const fieldId = useMemo(() => getItemId(item), [item]);

    const selectIsFiltered = useMemo(
        () => (state: ExplorerStoreState) =>
            selectIsFieldFiltered(state, fieldId),
        [fieldId],
    );
    const selectIsActive = useMemo(
        () => (state: ExplorerStoreState) =>
            selectIsFieldActive(state, fieldId),
        [fieldId],
    );

    // Use strict equality since these are booleans - only re-render if value actually changes
    const isFieldFiltered = useExplorerSelector(
        selectIsFiltered,
        (a, b) => a === b,
    );
    const isSelected = useExplorerSelector(selectIsActive, (a, b) => a === b);

    const metricInfo = useMemo(() => {
        if (isCompiledMetric(item)) {
            return {
                type: item.type,
                sql: item.sql,
                compiledSql: item.compiledSql,
                filters: item.filters,
                table: item.table,
                name: item.name,
            };
        }
        return undefined;
    }, [item]);

    const description = isField(item) ? item.description : undefined;

    const isMissing =
        (isAdditionalMetric(item) &&
            missingCustomMetrics &&
            missingCustomMetrics.includes(item)) ||
        (isCustomDimension(item) &&
            missingCustomDimensions &&
            missingCustomDimensions.includes(item));

    const isHoverCardDisabled = useMemo(() => {
        // Show metric info if either metric info or description is present
        if (isCompiledMetric(item) && (!!metricInfo || !!description)) {
            return false;
        }
        // Show description if it's not missing
        if (!description && !isMissing) return true;

        return false;
    }, [description, isMissing, item, metricInfo]);

    const bgColor = getItemBgColor(item);
    const alerts = itemsAlerts?.[getItemId(item)];
    const isFiltered = isField(item) && isFieldFiltered;
    const showFilterAction =
        (isFiltered || isHover) &&
        !isAdditionalMetric(item) &&
        isFilterableField(item);

    const timeIntervalLabel =
        isDimension(item) &&
        item.timeInterval &&
        isTimeInterval(item.timeInterval)
            ? timeFrameConfigs[item.timeInterval].getLabel()
            : undefined;

    const label =
        isField(item) || isAdditionalMetric(item)
            ? timeIntervalLabel || item.label || item.name
            : item.name;

    const handleFilterClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            track({ name: EventName.ADD_FILTER_CLICKED });
            if (!isFiltered) addFilter(item as FilterableField, undefined);
            e.stopPropagation();
        },
        [isFiltered, addFilter, item, track],
    );
    const handleClick = useCallback(() => {
        onItemClick(node.key, item);
    }, [onItemClick, node.key, item]);
    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );
    const handleDropdownClick = useCallback(
        /**
         * If we don't stop propagation, users may unintentionally toggle dimensions/metrics
         * while interacting with the hovercard.
         */
        (e: React.MouseEvent) => e.stopPropagation(),
        [],
    );

    const onOpenDescriptionView = useCallback(() => {
        toggleHover(false);
        // TODO: Re-enable showItemDetail once we fix the context subscription issue
        // showItemDetail({
        //     header: (
        //         <Group>
        //             <FieldIcon
        //                 item={item}
        //                 color={getFieldIconColor(item)}
        //                 size="md"
        //             />
        //             <Text size="md">{label}</Text>
        //         </Group>
        //     ),
        //     detail: description ? (
        //         <ItemDetailMarkdown source={description} />
        //     ) : (
        //         <Text color="gray">No description available.</Text>
        //     ),
        // });
    }, [toggleHover]);

    const onToggleMenu = useCallback(() => {
        toggleHover(false);
        toggleMenu();
    }, [toggleHover, toggleMenu]);

    const navLinkSx = useMemo(
        () => ({
            backgroundColor: isSelected ? bgColor : undefined,
            '&:hover': {
                backgroundColor: isSelected
                    ? darken(0.02, bgColor)
                    : lighten(0.1, bgColor),
            },
        }),
        [isSelected, bgColor],
    );
    const icon = useMemo(
        () => <NavItemIcon isMissing={isMissing} item={item} />,
        [isMissing, item],
    );

    const renderAlerts = useMemo(() => {
        const alertTypes = [
            { type: 'infos', alertIcon: IconInfoCircle, color: 'blue.6' },
            {
                type: 'warnings',
                alertIcon: IconAlertTriangle,
                color: 'yellow.9',
            },
            { type: 'errors', alertIcon: IconAlertTriangle, color: 'red.6' },
        ];

        return alertTypes.flatMap(({ type, alertIcon, color }) => {
            const messages = alerts?.[type as keyof typeof alerts];
            if (!messages || messages.length === 0) return [];

            return (
                <Tooltip
                    key={type}
                    withinPortal
                    maw={300}
                    multiline
                    label={messages.join('\n')}
                >
                    <MantineIcon
                        icon={alertIcon}
                        color={color}
                        style={{ flexShrink: 0 }}
                    />
                </Tooltip>
            );
        });
    }, [alerts]);

    if (!item || !isVisible) return null;

    return (
        <NavLink
            component="div"
            noWrap
            sx={navLinkSx}
            icon={icon}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            label={
                <Group noWrap spacing="xs">
                    <HoverCard
                        openDelay={300}
                        keepMounted={false}
                        shadow="subtle"
                        withinPortal
                        withArrow
                        disabled={isHoverCardDisabled}
                        position="right"
                        radius="md"
                        offset={70}
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
                            p="xs"
                            miw={400}
                            mah={500}
                            /**
                             * Takes up space to the right, so it's OK to go fairly wide in the interest
                             * of readability.
                             */
                            maw={500}
                            sx={{ overflow: 'auto' }}
                            onClick={handleDropdownClick}
                        >
                            {isMissing ? (
                                `This field from '${item.table}' table is no longer available`
                            ) : (
                                <ItemDetailPreview
                                    onViewDescription={onOpenDescriptionView}
                                    description={description}
                                    metricInfo={metricInfo}
                                />
                            )}
                        </HoverCard.Dropdown>
                    </HoverCard>
                    {renderAlerts}
                    {showFilterAction && (
                        <Tooltip
                            withinPortal
                            label={
                                isFiltered
                                    ? 'This field is filtered'
                                    : 'Click here to add filter'
                            }
                        >
                            <ActionIcon onClick={handleFilterClick}>
                                <MantineIcon
                                    icon={IconFilter}
                                    color="gray.7"
                                    style={{ flexShrink: 0 }}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
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

const TreeSingleNode = memo(TreeSingleNodeComponent);

TreeSingleNode.displayName = 'TreeSingleNode';

export default TreeSingleNode;
