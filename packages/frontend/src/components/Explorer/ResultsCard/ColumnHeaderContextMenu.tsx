import {
    getCustomDimensionId,
    getItemId,
    getItemLabelWithoutTableName,
    isCustomDimension,
    isField,
    isFilterableField,
    isMetric,
    isTableCalculation,
    type TableCalculation,
} from '@lightdash/common';
import { ActionIcon, Menu, Text } from '@mantine/core';
import {
    IconChevronDown,
    IconFilter,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../../features/tableCalculation';
import { useFilters } from '../../../hooks/useFilters';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { type HeaderProps, type TableColumn } from '../../common/Table/types';
import ColumnHeaderSortMenuOptions from './ColumnHeaderSortMenuOptions';
import QuickCalculationMenuOptions from './QuickCalculations';

interface ContextMenuProps extends HeaderProps {
    onToggleCalculationEditModal: (value: boolean) => void;
    onToggleCalculationDeleteModal: (value: boolean) => void;
}

const ContextMenu: FC<ContextMenuProps> = ({
    header,
    onToggleCalculationEditModal,
    onToggleCalculationDeleteModal,
}) => {
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const meta = header.column.columnDef.meta;
    const item = meta?.item;
    const sort = meta?.sort?.sort;

    const removeActiveField = useExplorerContext(
        (context) => context.actions.removeActiveField,
    );

    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const additionalMetric = useMemo(
        () =>
            !!additionalMetrics &&
            !!item &&
            additionalMetrics.find((am) => getItemId(am) === getItemId(item)),
        [additionalMetrics, item],
    );

    const isItemAdditionalMetric = !!additionalMetric;

    const toggleAdditionalMetricModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricModal,
    );

    const toggleCustomDimensionModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );

    const removeCustomDimension = useExplorerContext(
        (context) => context.actions.removeCustomDimension,
    );

    if (item && isField(item)) {
        const itemFieldId = getItemId(item);
        return (
            <>
                {isFilterableField(item) && (
                    <>
                        <Menu.Item
                            icon={<MantineIcon icon={IconFilter} />}
                            onClick={() => {
                                track({ name: EventName.ADD_FILTER_CLICKED });
                                addFilter(item, undefined, false);
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

                <ColumnHeaderSortMenuOptions item={item} sort={sort} />

                <Menu.Divider />
                {isMetric(item) && (
                    <>
                        <QuickCalculationMenuOptions item={item} />
                        <Menu.Divider />
                    </>
                )}

                {isItemAdditionalMetric ? (
                    <Menu.Item
                        icon={<MantineIcon icon={IconPencil} />}
                        onClick={() => {
                            toggleAdditionalMetricModal({
                                item: additionalMetric,
                                type: additionalMetric.type,
                                isEditing: true,
                            });
                        }}
                    >
                        Edit custom metric
                    </Menu.Item>
                ) : null}

                <Menu.Item
                    icon={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        removeActiveField(itemFieldId);
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
                    icon={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        removeActiveField(header.column.id);
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
                            icon={<MantineIcon icon={IconFilter} />}
                            onClick={() => {
                                track({ name: EventName.ADD_FILTER_CLICKED });
                                addFilter(item, undefined, false);
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
                    icon={<MantineIcon icon={IconPencil} />}
                    onClick={() => {
                        toggleCustomDimensionModal({
                            item,
                            isEditing: true,
                        });
                    }}
                >
                    Edit custom dimension
                </Menu.Item>
                <Menu.Divider />

                <ColumnHeaderSortMenuOptions item={item} sort={sort} />

                <Menu.Divider />

                <Menu.Item
                    icon={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        removeCustomDimension(getCustomDimensionId(item));
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
                    icon={<MantineIcon icon={IconFilter} />}
                    onClick={() => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined, false);
                    }}
                >
                    Filter by{' '}
                    <Text span fw={500}>
                        {getItemLabelWithoutTableName(item)}
                    </Text>
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                    icon={<MantineIcon icon={IconPencil} />}
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
                    icon={<MantineIcon icon={IconTrash} />}
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

    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    if (meta && (meta.item || meta.isInvalidItem === true)) {
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <Menu withinPortal withArrow shadow="md">
                    <Menu.Target>
                        <ActionIcon size="xs" variant="light" bg="transparent">
                            <MantineIcon icon={IconChevronDown} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <ContextMenu
                            header={header}
                            onToggleCalculationEditModal={setShowUpdate}
                            onToggleCalculationDeleteModal={setShowDelete}
                        />
                    </Menu.Dropdown>
                </Menu>

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
            </div>
        );
    } else {
        return null;
    }
};

export default ColumnHeaderContextMenu;
