import { type ComboboxItem, type ComboboxItemGroup } from '@mantine-8/core';

export type FlatGroupedComboboxItem<T extends ComboboxItem = ComboboxItem> =
    T & {
        group?: string;
    };

export const groupComboboxItems = <T extends ComboboxItem>(
    options: FlatGroupedComboboxItem<T>[],
): (T | ComboboxItemGroup<T>)[] => {
    const groups = new Map<string, T[]>();
    const ungrouped: T[] = [];
    const values = new Set<string>();

    options.forEach(({ group, ...option }) => {
        const item = option as T;
        if (values.has(item.value)) {
            throw new Error(`Duplicate Select option value: ${item.value}`);
        }
        values.add(item.value);

        if (!group) {
            ungrouped.push(item);
            return;
        }

        const items = groups.get(group) ?? [];
        items.push(item);
        groups.set(group, items);
    });

    return [
        ...Array.from(groups, ([group, items]) => ({ group, items })),
        ...ungrouped,
    ];
};
