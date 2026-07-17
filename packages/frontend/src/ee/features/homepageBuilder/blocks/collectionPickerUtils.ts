import {
    ContentType,
    type HomepageCollectionItemRef,
    type SummaryContent,
} from '@lightdash/common';
import { type ComboboxItem, type ComboboxItemGroup } from '@mantine-8/core';

export const toItemRef = (
    content: SummaryContent,
): HomepageCollectionItemRef => ({
    contentType:
        content.contentType === ContentType.DASHBOARD ? 'dashboard' : 'chart',
    uuid: content.uuid,
});

export const groupContentBySpace = (
    contentMap: Map<string, SummaryContent>,
): ComboboxItemGroup[] => {
    const bySpace = new Map<string, ComboboxItem[]>();
    for (const content of contentMap.values()) {
        const items = bySpace.get(content.space.name) ?? [];
        items.push({ value: content.uuid, label: content.name });
        bySpace.set(content.space.name, items);
    }
    return [...bySpace.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, items]) => ({
            group,
            items: [...items].sort((a, b) => a.label.localeCompare(b.label)),
        }));
};

export const buildSelectionRefs = (
    newUuids: string[],
    prevSelected: Map<string, HomepageCollectionItemRef>,
    contentMap: Map<string, SummaryContent>,
): Map<string, HomepageCollectionItemRef> => {
    const next = new Map<string, HomepageCollectionItemRef>();
    newUuids.forEach((uuid) => {
        const existing = prevSelected.get(uuid);
        if (existing) {
            next.set(uuid, existing);
            return;
        }
        const content = contentMap.get(uuid);
        if (content) next.set(uuid, toItemRef(content));
    });
    return next;
};
