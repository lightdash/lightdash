import { Divider, Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    fieldId,
    getItemId,
    isField,
    isFilterableField,
    TableCalculation,
} from '@lightdash/common';
import { ActionIcon, Popover } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { FC, useMemo, useState } from 'react';
import { useFilters } from '../../../hooks/useFilters';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { HeaderProps, TableColumn } from '../../common/Table/types';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../TableCalculationModals';
import { BolderLabel } from './ColumnHeaderContextMenu.styles';
import ColumnHeaderSortMenuOptions from './ColumnHeaderSortMenuOptions';

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

    if (item && isField(item) && isFilterableField(item)) {
        const itemFieldId = fieldId(item);
        return (
            <Menu>
                <MenuItem2
                    text={
                        <>
                            Filter by <BolderLabel>{item.label}</BolderLabel>
                        </>
                    }
                    icon="filter"
                    onClick={() => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined, false);
                    }}
                />

                <Divider />

                <ColumnHeaderSortMenuOptions item={item} sort={sort} />

                <Divider />

                {isItemAdditionalMetric ? (
                    <MenuItem2
                        text={<>Edit custom metric</>}
                        icon="edit"
                        onClick={() => {
                            toggleAdditionalMetricModal({
                                item: additionalMetric,
                                type: additionalMetric.type,
                                isEditing: true,
                            });
                        }}
                    />
                ) : null}

                <MenuItem2
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        removeActiveField(itemFieldId);
                    }}
                />
            </Menu>
        );
    } else if (meta?.isInvalidItem) {
        return (
            <Menu>
                <MenuItem2
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        removeActiveField(header.column.id);
                    }}
                />
            </Menu>
        );
    } else if (item && !isField(item)) {
        return (
            <Menu>
                <MenuItem2
                    text="Edit calculation"
                    icon="edit"
                    onClick={() => {
                        track({
                            name: EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationEditModal(true);
                    }}
                />

                <Divider />

                <ColumnHeaderSortMenuOptions item={item} sort={sort} />

                <Divider />

                <MenuItem2
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        track({
                            name: EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationDeleteModal(true);
                    }}
                />
            </Menu>
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
                <Popover withinPortal position="bottom" withArrow shadow="md">
                    <Popover.Target>
                        <ActionIcon size="xs" variant="light" bg="transparent">
                            <MantineIcon icon={IconChevronDown} />
                        </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown p={0}>
                        <ContextMenu
                            header={header}
                            onToggleCalculationEditModal={setShowUpdate}
                            onToggleCalculationDeleteModal={setShowDelete}
                        />
                    </Popover.Dropdown>
                </Popover>

                {showUpdate && (
                    <UpdateTableCalculationModal
                        isOpen
                        tableCalculation={item as TableCalculation}
                        onClose={() => setShowUpdate(false)}
                    />
                )}

                {showDelete && (
                    <DeleteTableCalculationModal
                        isOpen
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
