import {
    getItemId,
    getItemLabelWithoutTableName,
    type Item,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    label: string;
    items: Item[];
    addItems?: Item[];
    selectedIds: string[];
    addDisabled: boolean;
    loading?: boolean;
    describedBy?: string;
    onAddToQuery?: (item: Item) => void;
    onChange: (ids: string[]) => void;
};

/** An ordered, unique binding for a chart-type slot declared as multiple. */
const OrderedDataAppVizFieldSelect: FC<Props> = ({
    label,
    items,
    addItems,
    selectedIds,
    addDisabled,
    loading,
    describedBy,
    onAddToQuery,
    onChange,
}) => {
    const allItems = [...items, ...(addItems ?? [])];
    const selectedItems = selectedIds.flatMap((id) => {
        const item = allItems.find((candidate) => getItemId(candidate) === id);
        return item ? [item] : [];
    });

    const add = (item: Item | undefined) => {
        if (!item) return;
        const id = getItemId(item);
        if (!items.some((candidate) => getItemId(candidate) === id)) {
            onAddToQuery?.(item);
        }
        if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
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
            {selectedItems.map((item, index) => {
                const id = getItemId(item);
                return (
                    <Group key={id} gap="xs" wrap="nowrap">
                        <Text size="xs" flex={1} truncate>
                            {getItemLabelWithoutTableName(item)}
                        </Text>
                        <Tooltip label="Move up" openDelay={300}>
                            <ActionIcon
                                aria-label={`Move ${getItemLabelWithoutTableName(
                                    item,
                                )} up`}
                                size="xs"
                                disabled={index === 0}
                                onClick={() => move(index, -1)}
                            >
                                <MantineIcon icon={IconChevronUp} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Move down" openDelay={300}>
                            <ActionIcon
                                aria-label={`Move ${getItemLabelWithoutTableName(
                                    item,
                                )} down`}
                                size="xs"
                                disabled={index === selectedIds.length - 1}
                                onClick={() => move(index, 1)}
                            >
                                <MantineIcon icon={IconChevronDown} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Remove field" openDelay={300}>
                            <ActionIcon
                                aria-label={`Remove ${getItemLabelWithoutTableName(
                                    item,
                                )}`}
                                size="xs"
                                onClick={() =>
                                    onChange(
                                        selectedIds.filter(
                                            (value) => value !== id,
                                        ),
                                    )
                                }
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                );
            })}
            <FieldSelect
                size="xs"
                aria-label={`Add ${label.toLowerCase()}`}
                aria-describedby={describedBy}
                placeholder={`Add ${label.toLowerCase()}`}
                disabled={addDisabled}
                items={items}
                addItems={addItems}
                inactiveItemIds={selectedIds}
                loading={loading}
                onChange={add}
                hasGrouping
            />
        </Stack>
    );
};

export default OrderedDataAppVizFieldSelect;
