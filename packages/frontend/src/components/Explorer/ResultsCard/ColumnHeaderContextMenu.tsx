import {
    DimensionType,
    getItemId,
    getItemLabelWithoutTableName,
    getItemMap,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    isMetricWithDateValue,
    isNumericItem,
    isPeriodOverPeriodAdditionalMetric,
    isTableCalculation,
    isTimeBasedDimension,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { ActionIcon, Box, Group, Text } from '@mantine/core';
import {
    IconChevronDown,
    IconFilter,
    IconPencil,
    IconTimelineEvent,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../../features/tableCalculation';
import { useExplore } from '../../../hooks/useExplore';
import { useFilters } from '../../../hooks/useFilters';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { BetaBadge } from '../../common/BetaBadge';
import MantineIcon from '../../common/MantineIcon';
import { type HeaderProps, type TableColumn } from '../../common/Table/types';
import ColumnHeaderSortMenuOptions from './ColumnHeaderSortMenuOptions';
import FormatMenuOptions from './FormatMenuOptions';
import QuickCalculationMenuOptions from './QuickCalculations';

interface ContextMenuProps extends HeaderProps {
    onToggleCalculationEditModal: (value: boolean) => void;
    onToggleCalculationDeleteModal: (value: boolean) => void;
    onQuickCalculationCreated: (tableCalculation: TableCalculation) => void;
}

const ContextMenu: FC<ContextMenuProps> = ({
    header,
    onToggleCalculationEditModal,
    onToggleCalculationDeleteModal,
    onQuickCalculationCreated,
}) => {
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const meta = header.column.columnDef.meta;
    const item = meta?.item;
    const sort = meta?.sort?.sort;

    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const tableName = useExplorerSelector(selectTableName);
    const dispatch = useExplorerDispatch();

    // Get explore data to check if metrics return date values
    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

    const itemsMap = useMemo(() => {
        if (exploreData) {
            return getItemMap(
                exploreData,
                additionalMetrics,
                tableCalculations,
            );
        }
        return undefined;
    }, [exploreData, additionalMetrics, tableCalculations]);

    const additionalMetric = useMemo(
        () =>
            !!additionalMetrics &&
            !!item &&
            additionalMetrics.find((am) => getItemId(am) === getItemId(item)),
        [additionalMetrics, item],
    );

    const isItemAdditionalMetric = !!additionalMetric;
    const isPopAdditionalMetric =
        isPeriodOverPeriodAdditionalMetric(additionalMetric);

    if (item && isField(item)) {
        const itemFieldId = getItemId(item);
        return (
            <>
                {isMetric(item) && !isPopAdditionalMetric ? (
                    <>
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconTimelineEvent} />
                            }
                            rightSection={
                                <Box ml="sm">
                                    <BetaBadge tooltipLabel="" />
                                </Box>
                            }
                            onClick={() => {
                                dispatch(
                                    explorerActions.togglePeriodOverPeriodComparisonModal(
                                        {
                                            metric: item,
                                            itemsMap: itemsMap,
                                        },
                                    ),
                                );
                            }}
                        >
                            Add period comparison
                        </Menu.Item>

                        <Menu.Divider />
                    </>
                ) : null}

                {isFilterableField(item) && !isPopAdditionalMetric && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                            onClick={() => {
                                track({ name: EventName.ADD_FILTER_CLICKED });
                                addFilter(item, undefined);
                            }}
                        >
                            Filter by{' '}
                            <Text span fw={500}>
                                {getItemLabelWithoutTableName(item)}
                            </Text>
                        </Menu.Item>

                        <Menu.Divider />
                    </>
                )}

                {!isPopAdditionalMetric && (
                    <>
                        <ColumnHeaderSortMenuOptions item={item} sort={sort} />
                        <Menu.Divider />
                    </>
                )}

                {isTimeBasedDimension(item) ||
                (isDimension(item) && item.type === DimensionType.NUMBER) ? (
                    <>
                        <FormatMenuOptions item={item} />
                        <Menu.Divider />
                    </>
                ) : null}

                {isMetric(item) && !isPopAdditionalMetric && (
                    <>
                        {!isItemAdditionalMetric &&
                            (isNumericItem(item) ||
                                isMetricWithDateValue(item, itemsMap)) && (
                                <>
                                    <FormatMenuOptions item={item} />
                                    <Menu.Divider />
                                </>
                            )}

                        <QuickCalculationMenuOptions
                            item={item}
                            onCalculationCreated={onQuickCalculationCreated}
                        />
                        <Menu.Divider />
                    </>
                )}

                {isItemAdditionalMetric && !isPopAdditionalMetric ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => {
                            dispatch(
                                explorerActions.toggleAdditionalMetricModal({
                                    item: additionalMetric,
                                    type: additionalMetric.type,
                                    isEditing: true,
                                }),
                            );
                        }}
                    >
                        Edit custom metric
                    </Menu.Item>
                ) : null}

                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        dispatch(explorerActions.removeField(itemFieldId));
                    }}
                >
                    Remove
                </Menu.Item>
            </>
        );
    } else if (meta?.isInvalidItem) {
        return (
            <>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        dispatch(explorerActions.removeField(header.column.id));
                    }}
                >
                    Remove
                </Menu.Item>
            </>
        );
    } else if (item && isCustomDimension(item)) {
        return (
            <>
                {isFilterableField(item) && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                            onClick={() => {
                                track({ name: EventName.ADD_FILTER_CLICKED });
                                addFilter(item, undefined);
                            }}
                        >
                            Filter by{' '}
                            <Text span fw={500}>
                                {getItemLabelWithoutTableName(item)}
                            </Text>
                        </Menu.Item>

                        <Menu.Divider />
                    </>
                )}

                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => {
                        dispatch(
                            explorerActions.toggleCustomDimensionModal({
                                item,
                                isEditing: true,
                            }),
                        );
                    }}
                >
                    Edit custom dimension
                </Menu.Item>
                <Menu.Divider />

                <ColumnHeaderSortMenuOptions item={item} sort={sort} />

                <Menu.Divider />

                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        dispatch(explorerActions.removeField(getItemId(item)));
                    }}
                >
                    Remove
                </Menu.Item>
            </>
        );
    } else if (item && isTableCalculation(item)) {
        return (
            <>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconFilter} />}
                    onClick={() => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined);
                    }}
                >
                    Filter by{' '}
                    <Text span fw={500}>
                        {getItemLabelWithoutTableName(item)}
                    </Text>
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => {
                        track({
                            name: EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationEditModal(true);
                    }}
                >
                    Edit calculation
                </Menu.Item>

                <Menu.Divider />

                <ColumnHeaderSortMenuOptions item={item} sort={sort} />

                <Menu.Divider />

                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        track({
                            name: EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationDeleteModal(true);
                    }}
                >
                    Remove
                </Menu.Item>
            </>
        );
    } else {
        return null;
    }
};

const ColumnHeaderContextMenu: FC<HeaderProps> = ({ header }) => {
    const [showUpdate, setShowUpdate] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [quickCalcToEdit, setQuickCalcToEdit] =
        useState<TableCalculation | null>(null);

    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    if (meta && (meta.item || meta.isInvalidItem === true)) {
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <Group spacing="two" noWrap>
                    <Menu withinPortal withArrow shadow="md">
                        <Menu.Target>
                            <ActionIcon
                                size="xs"
                                variant="light"
                                bg="transparent"
                            >
                                <MantineIcon icon={IconChevronDown} />
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <ContextMenu
                                header={header}
                                onToggleCalculationEditModal={setShowUpdate}
                                onToggleCalculationDeleteModal={setShowDelete}
                                onQuickCalculationCreated={setQuickCalcToEdit}
                            />
                        </Menu.Dropdown>
                    </Menu>
                </Group>

                {showUpdate && (
                    <UpdateTableCalculationModal
                        opened
                        tableCalculation={item as TableCalculation}
                        onClose={() => setShowUpdate(false)}
                    />
                )}

                {showDelete && (
                    <DeleteTableCalculationModal
                        tableCalculation={item as TableCalculation}
                        onClose={() => setShowDelete(false)}
                    />
                )}

                {quickCalcToEdit && (
                    <UpdateTableCalculationModal
                        opened
                        tableCalculation={quickCalcToEdit}
                        onClose={() => setQuickCalcToEdit(null)}
                    />
                )}
            </div>
        );
    } else {
        return null;
    }
};

export default ColumnHeaderContextMenu;
