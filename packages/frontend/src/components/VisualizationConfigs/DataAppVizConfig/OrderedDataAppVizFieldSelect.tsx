import {
    getItemId,
    getItemLabelWithoutTableName,
    type Item,
} from '@lightdash/common';
import { CloseButton, Group, Loader, Stack, Tooltip } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { AddButton } from '../common/AddButton';

type Props = {
    header: ReactNode;
    label: string;
    items: Item[];
    addItems?: Item[];
    selectedIds: string[];
    addDisabled: boolean;
    emptyPlaceholder?: string;
    describedBy?: string;
    isFieldPending?: (id: string) => boolean;
    onAddToQuery?: (item: Item) => void;
    onChange: (ids: string[]) => void;
};

/** An ordered, unique binding rendered like the chart configuration field lists. */
const OrderedDataAppVizFieldSelect: FC<Props> = ({
    header,
    label,
    items,
    addItems,
    selectedIds,
    addDisabled,
    emptyPlaceholder = 'No fields available',
    describedBy,
    isFieldPending,
    onAddToQuery,
    onChange,
}) => {
    const allItems = [...items, ...(addItems ?? [])];
    const hasAvailableItem = allItems.some(
        (item) => !selectedIds.includes(getItemId(item)),
    );

    const add = () => {
        const next = allItems.find(
            (item) => !selectedIds.includes(getItemId(item)),
        );
        if (!next) return;
        const id = getItemId(next);
        if (!items.some((item) => getItemId(item) === id)) {
            onAddToQuery?.(next);
        }
        onChange([...selectedIds, id]);
    };

    const replace = (index: number, item: Item | undefined) => {
        const currentId = selectedIds[index];
        if (!item) {
            onChange(selectedIds.filter((id) => id !== currentId));
            return;
        }
        const id = getItemId(item);
        if (id === currentId || selectedIds.includes(id)) return;
        if (!items.some((candidate) => getItemId(candidate) === id)) {
            onAddToQuery?.(item);
        }
        const next = [...selectedIds];
        next[index] = id;
        onChange(next);
    };

    return (
        <Stack gap="xs">
            <Group justify="space-between" gap="xs" wrap="nowrap">
                {header}
                <AddButton
                    aria-label={`Add ${label.toLowerCase()}`}
                    disabled={addDisabled || !hasAvailableItem}
                    onClick={add}
                />
            </Group>
            {selectedIds.length === 0 && addDisabled && (
                <FieldSelect
                    size="xs"
                    disabled
                    placeholder={emptyPlaceholder}
                    items={[]}
                    onChange={() => {}}
                />
            )}
            {selectedIds.flatMap((id, index) => {
                const item = allItems.find(
                    (candidate) => getItemId(candidate) === id,
                );
                if (!item) return [];
                const itemLabel = getItemLabelWithoutTableName(item);
                return [
                    <FieldSelect
                        key={id}
                        size="xs"
                        aria-label={`${label}: ${itemLabel}`}
                        aria-describedby={describedBy}
                        placeholder={`Select ${label.toLowerCase()}`}
                        item={item}
                        items={items}
                        addItems={addItems}
                        inactiveItemIds={selectedIds.filter(
                            (selectedId) => selectedId !== id,
                        )}
                        onChange={(newItem) => replace(index, newItem)}
                        hasGrouping
                        rightSectionPointerEvents="all"
                        rightSectionWidth={isFieldPending?.(id) ? 48 : 28}
                        rightSection={
                            <Group gap={2} wrap="nowrap">
                                {isFieldPending?.(id) && (
                                    <Tooltip
                                        label="Adding field to query"
                                        openDelay={300}
                                    >
                                        <Loader size="xs" />
                                    </Tooltip>
                                )}
                                <CloseButton
                                    aria-label={`Remove ${itemLabel}`}
                                    size="xs"
                                    onClick={() => replace(index, undefined)}
                                />
                            </Group>
                        }
                    />,
                ];
            })}
        </Stack>
    );
};

export default OrderedDataAppVizFieldSelect;
