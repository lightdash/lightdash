import Fuse from 'fuse.js';
import {
    type SettingsNavigationItem,
    type SettingsNavigationSection,
} from './types';

const flattenItems = (
    items: SettingsNavigationItem[],
): SettingsNavigationItem[] =>
    items.flatMap((item) => [item, ...flattenItems(item.children)]);

const buildFuse = (
    sections: SettingsNavigationSection[],
): Fuse<SettingsNavigationItem> =>
    new Fuse(flattenItems(sections.flatMap((section) => section.items)), {
        keys: [
            { name: 'label', weight: 2 },
            { name: 'keywords', weight: 1 },
        ],
        ignoreLocation: true,
        threshold: 0.3,
    });

/**
 * Filters the settings nav model by a free-text query using fuzzy matching
 * (Fuse.js, mirroring the explores search). A matching parent keeps all its
 * children; an unmatched parent is kept only for its matching descendants.
 * Sections with no surviving items are dropped. An empty query returns the
 * model unchanged.
 */
export const filterSettingsNavigation = (
    sections: SettingsNavigationSection[],
    query: string,
): SettingsNavigationSection[] => {
    const trimmed = query.trim();
    if (trimmed === '') {
        return sections;
    }

    const matched = new Set(
        buildFuse(sections)
            .search(trimmed)
            .map((result) => result.item),
    );

    const filterItem = (
        item: SettingsNavigationItem,
    ): SettingsNavigationItem | null => {
        if (matched.has(item)) {
            return item;
        }

        const matchedChildren = item.children
            .map(filterItem)
            .filter((child): child is SettingsNavigationItem => child !== null);

        if (matchedChildren.length > 0) {
            return { ...item, children: matchedChildren };
        }

        return null;
    };

    return sections
        .map((section) => ({
            ...section,
            items: section.items
                .map(filterItem)
                .filter(
                    (item): item is SettingsNavigationItem => item !== null,
                ),
        }))
        .filter((section) => section.items.length > 0);
};
