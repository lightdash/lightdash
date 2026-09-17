import {
    getItemId,
    getItemLabelWithoutTableName,
    type Item,
} from '@lightdash/common';
import {
    ActionIcon,
    CloseButton,
    Group,
    Loader,
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
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

    const move = (index: number, direction: -1 | 1) => {
        const destination = index + direction;
        if (destination < 0 || destination >= selectedIds.length) return;
        const next = [...selectedIds];
        [next[index], next[destination]] = [next[destination], next[index]];
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
                        rightSectionWidth={isFieldPending?.(id) ? 92 : 72}
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
                                <Tooltip label="Move up" openDelay={300}>
                                    <ActionIcon
                                        aria-label={`Move ${itemLabel} up`}
                                        size="xs"
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        <MantineIcon icon={IconChevronUp} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Move down" openDelay={300}>
                                    <ActionIcon
                                        aria-label={`Move ${itemLabel} down`}
                                        size="xs"
                                        disabled={
                                            index === selectedIds.length - 1
                                        }
                                        onClick={() => move(index, 1)}
                                    >
                                        <MantineIcon icon={IconChevronDown} />
                                    </ActionIcon>
                                </Tooltip>
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
