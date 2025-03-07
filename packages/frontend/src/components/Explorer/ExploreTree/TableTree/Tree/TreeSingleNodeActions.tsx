import {
    DimensionType,
    FeatureFlags,
    MetricType,
    friendlyName,
    getItemId,
    isAdditionalMetric,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isFilterableField,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip, type MenuProps } from '@mantine/core';
import {
    IconCode,
    IconCopy,
    IconDots,
    IconEdit,
    IconFilter,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useFeatureFlagEnabled } from '../../../../../hooks/useFeatureFlagEnabled';
import { useFilters } from '../../../../../hooks/useFilters';
import useApp from '../../../../../providers/App/useApp';
import useExplorerContext from '../../../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../../../providers/Tracking/useTracking';
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { showToastSuccess } = useToaster();
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const removeAdditionalMetric = useExplorerContext(
        (context) => context.actions.removeAdditionalMetric,
    );
    const toggleAdditionalMetricModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricModal,
    );
    const toggleWriteBackModal = useExplorerContext(
        (context) => context.actions.toggleWriteBackModal,
    );
    const removeCustomDimension = useExplorerContext(
        (context) => context.actions.removeCustomDimension,
    );
    const toggleCustomDimensionModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );
    const addAdditionalMetric = useExplorerContext(
        (context) => context.actions.addAdditionalMetric,
    );
    const addAdditionalDimension = useExplorerContext(
        (context) => context.actions.addCustomDimension,
    );
    const customMetrics = useMemo(() => {
        if (isCustomSqlDimension(item)) {
            return getCustomMetricType(item.dimensionType);
        }
        return isDimension(item) ? getCustomMetricType(item.type) : [];
    }, [item]);

    const isWriteBackCustomBinDimensionsEnabled = useFeatureFlagEnabled(
        FeatureFlags.WriteBackCustomBinDimensions,
    );

    const duplicateCustomMetric = (customMetric: AdditionalMetric) => {
        const newDeepCopyItem = JSON.parse(JSON.stringify(customMetric));
        let newId = uuidv4();
        let newIdSubstring = newId.replace(/-/g, '').substring(0, 16);
        let currentName = newDeepCopyItem.name;
        const pattern = '_8id9_';
        const patternIndex = currentName.indexOf(pattern);
        if (patternIndex !== -1) {
            currentName =
                currentName.substring(0, patternIndex + pattern.length) +
                newIdSubstring;
        } else {
            currentName = currentName + pattern + newIdSubstring;
        }
        newDeepCopyItem.label = 'Copy ' + newDeepCopyItem.label;
        newDeepCopyItem.uuid = newId;
        newDeepCopyItem.name = currentName;
        addAdditionalMetric(newDeepCopyItem);
    };
    const duplicateCustomDimension = (customDimension: CustomDimension) => {
        const newDeepCopyItem = JSON.parse(JSON.stringify(customDimension));
        let newIdSubstring = uuidv4().replace(/-/g, '').substring(0, 16);
        let currentId = newDeepCopyItem.id;
        const pattern = '_8id9_';
        const patternIndex = currentId.indexOf(pattern);
        if (patternIndex !== -1) {
            currentId =
                currentId.substring(0, patternIndex + pattern.length) +
                newIdSubstring;
        } else {
            currentId = currentId + pattern + newIdSubstring;
        }
        newDeepCopyItem.name = 'Copy ' + newDeepCopyItem.name;
        newDeepCopyItem.id = currentId;
        addAdditionalDimension(newDeepCopyItem);
    };
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
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
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
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
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
                            component="button"
                            icon={<MantineIcon icon={IconCopy} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();
                                duplicateCustomMetric(item);
                                track({
                                    name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                });
                                showToastSuccess({
                                    title: 'Copy of Custom metric added successfully',
                                });
                            }}
                        >
                            Duplicate custom metric
                        </Menu.Item>

                        <Menu.Item
                            component="button"
                            icon={<MantineIcon icon={IconCode} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();
                                if (
                                    projectUuid &&
                                    user.data?.organizationUuid
                                ) {
                                    track({
                                        name: EventName.WRITE_BACK_FROM_CUSTOM_METRIC_CLICKED,
                                        properties: {
                                            userId: user.data.userUuid,
                                            projectId: projectUuid,
                                            organizationId:
                                                user.data.organizationUuid,
                                            customMetricsCount: 1,
                                        },
                                    });
                                }
                                toggleWriteBackModal({
                                    items: [item],
                                });
                            }}
                        >
                            Write back to dbt
                        </Menu.Item>

                        <Menu.Item
                            color="red"
                            key="custommetric"
                            component="button"
                            icon={<MantineIcon icon={IconTrash} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();

                                track({
                                    name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                                });
                                removeAdditionalMetric(getItemId(item));
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
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
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
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
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
                            component="button"
                            icon={<MantineIcon icon={IconCopy} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();
                                duplicateCustomDimension(item);
                                track({
                                    name: EventName.ADD_CUSTOM_DIMENSION_CLICKED,
                                });
                                showToastSuccess({
                                    title: 'Copy of Custom Dimension added successfully',
                                });
                            }}
                        >
                            Duplicate custom dimension
                        </Menu.Item>
                        {(isCustomSqlDimension(item) ||
                            isWriteBackCustomBinDimensionsEnabled) && (
                            <Menu.Item
                                component="button"
                                icon={<MantineIcon icon={IconCode} />}
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    e.stopPropagation();
                                    if (
                                        projectUuid &&
                                        user.data?.organizationUuid
                                    ) {
                                        track({
                                            name: EventName.WRITE_BACK_FROM_CUSTOM_DIMENSION_CLICKED,
                                            properties: {
                                                userId: user.data.userUuid,
                                                projectId: projectUuid,
                                                organizationId:
                                                    user.data.organizationUuid,
                                                customDimensionsCount: 1,
                                            },
                                        });
                                    }

                                    toggleWriteBackModal({
                                        items: [item],
                                    });
                                }}
                            >
                                Write back to dbt
                            </Menu.Item>
                        )}

                        <Menu.Item
                            color="red"
                            component="button"
                            icon={<MantineIcon icon={IconTrash} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();
                                removeCustomDimension(getItemId(item));
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
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
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
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
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
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
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
