import {
    DimensionType,
    fieldId,
    friendlyName,
    getCustomDimensionId,
    isAdditionalMetric,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isFilterableField,
    MetricType,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip, type MenuProps } from '@mantine/core';
import {
    IconDots,
    IconEdit,
    IconFilter,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useFilters } from '../../../../../hooks/useFilters';
import { useExplorerContext } from '../../../../../providers/ExplorerProvider';
import { useTracking } from '../../../../../providers/TrackingProvider';
import { EventName } from '../../../../../types/Events';
import MantineIcon from '../../../../common/MantineIcon';

const getCustomMetricType = (type: DimensionType): MetricType[] => {
    switch (type) {
        case DimensionType.STRING:
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
            return [
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
                MetricType.MIN,
                MetricType.MAX,
            ];
        case DimensionType.NUMBER:
            return [
                MetricType.MIN,
                MetricType.MAX,
                MetricType.SUM,
                MetricType.PERCENTILE,
                MetricType.MEDIAN,
                MetricType.AVERAGE,
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
            ];
        case DimensionType.BOOLEAN:
            return [MetricType.COUNT_DISTINCT, MetricType.COUNT];
        default:
            return [];
    }
};

type Props = {
    item: Metric | Dimension | AdditionalMetric | CustomDimension;
    isHovered: boolean;
    isSelected: boolean;
    hasDescription: boolean;
    isOpened: MenuProps['opened'];
    onMenuChange: MenuProps['onChange'];
    onViewDescription: () => void;
};

const TreeSingleNodeActions: FC<Props> = ({
    item,
    isHovered,
    isSelected,
    isOpened,
    onMenuChange,
    hasDescription,
    onViewDescription,
}) => {
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const removeAdditionalMetric = useExplorerContext(
        (context) => context.actions.removeAdditionalMetric,
    );
    const toggleAdditionalMetricModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricModal,
    );
    const removeCustomDimension = useExplorerContext(
        (context) => context.actions.removeCustomDimension,
    );
    const toggleCustomDimensionModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );

    const customMetrics = useMemo(() => {
        if (isCustomSqlDimension(item)) {
            return getCustomMetricType(item.dimensionType);
        }
        return isDimension(item) ? getCustomMetricType(item.type) : [];
    }, [item]);

    return isHovered || isSelected || isOpened ? (
        <Menu
            withArrow
            withinPortal
            shadow="lg"
            position="bottom-end"
            arrowOffset={12}
            offset={-4}
            opened={isOpened}
            onChange={onMenuChange}
        >
            <Menu.Dropdown>
                {!isAdditionalMetric(item) && isFilterableField(item) ? (
                    <Menu.Item
                        component="button"
                        icon={<MantineIcon icon={IconFilter} />}
                        onClick={(e) => {
                            e.stopPropagation();

                            track({
                                name: EventName.ADD_FILTER_CLICKED,
                            });
                            addFilter(item, undefined);
                        }}
                    >
                        Add filter
                    </Menu.Item>
                ) : null}

                {isAdditionalMetric(item) ? (
                    <>
                        <Menu.Item
                            component="button"
                            icon={<MantineIcon icon={IconEdit} />}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleAdditionalMetricModal({
                                    type: item.type,
                                    item,
                                    isEditing: true,
                                });
                            }}
                        >
                            Edit custom metric
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            key="custommetric"
                            component="button"
                            icon={<MantineIcon icon={IconTrash} />}
                            onClick={(e) => {
                                e.stopPropagation();

                                track({
                                    name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                                });
                                removeAdditionalMetric(fieldId(item));
                            }}
                        >
                            Remove custom metric
                        </Menu.Item>
                    </>
                ) : null}

                {hasDescription && (
                    <Menu.Item
                        component="button"
                        icon={<MantineIcon icon={IconDots} />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewDescription();
                        }}
                    >
                        View description
                    </Menu.Item>
                )}

                {isCustomDimension(item) && (
                    <>
                        <Menu.Item
                            component="button"
                            icon={<MantineIcon icon={IconEdit} />}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleCustomDimensionModal({
                                    item,
                                    isEditing: true,
                                });
                            }}
                        >
                            Edit custom dimension
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            component="button"
                            icon={<MantineIcon icon={IconTrash} />}
                            onClick={(e) => {
                                e.stopPropagation();
                                removeCustomDimension(
                                    getCustomDimensionId(item),
                                );
                            }}
                        >
                            Remove custom dimension
                        </Menu.Item>
                    </>
                )}

                {customMetrics.length > 0 &&
                (isDimension(item) || isCustomSqlDimension(item)) ? (
                    <>
                        <Menu.Divider />

                        <Menu.Label>Add custom metrics</Menu.Label>
                        {customMetrics.map((metric) => (
                            <Menu.Item
                                key={metric}
                                role="menuitem"
                                component="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    console.debug(
                                        'opening custom metric modal: ' +
                                            metric,
                                    );

                                    toggleAdditionalMetricModal({
                                        type: metric,
                                        item,
                                        isEditing: false,
                                    });

                                    track({
                                        name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                    });
                                }}
                            >
                                {friendlyName(metric)}
                            </Menu.Item>
                        ))}
                    </>
                ) : null}

                {isDimension(item) && item.type === DimensionType.NUMBER ? (
                    <>
                        <Menu.Divider />
                        <Menu.Item
                            component="button"
                            icon={<MantineIcon icon={IconSparkles} />}
                            onClick={(e) => {
                                e.stopPropagation();

                                track({
                                    name: EventName.ADD_CUSTOM_DIMENSION_CLICKED,
                                });
                                toggleCustomDimensionModal({
                                    item,
                                    isEditing: false,
                                });
                            }}
                        >
                            Add custom dimensions
                        </Menu.Item>
                    </>
                ) : null}
            </Menu.Dropdown>

            {/* prevents bubbling of click event to NavLink */}
            <Box
                component="div"
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                <Menu.Target>
                    <Tooltip
                        openDelay={500}
                        position="top"
                        label="View options"
                        disabled={isOpened}
                    >
                        <ActionIcon variant="transparent">
                            <MantineIcon
                                icon={IconDots}
                                color={isOpened ? 'black' : undefined}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Menu.Target>
            </Box>
        </Menu>
    ) : (
        <Box w={28} />
    );
};

export default TreeSingleNodeActions;
