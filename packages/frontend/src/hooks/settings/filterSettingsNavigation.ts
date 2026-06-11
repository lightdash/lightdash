import Fuse from 'fuse.js';
import {
    type SettingsNavigationItem,
    type SettingsNavigationSection,
} from './types';

const FUSE_THRESHOLD = 0.3;

const flattenItems = (
    items: SettingsNavigationItem[],
): SettingsNavigationItem[] =>
    items.flatMap((item) => [item, ...flattenItems(item.children)]);

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

    const fuse = new Fuse(flattenItems(sections.flatMap((s) => s.items)), {
        keys: [
            { name: 'label', weight: 2 },
            { name: 'keywords', weight: 1 },
        ],
        ignoreLocation: true,
        threshold: FUSE_THRESHOLD,
    });
    const matched = new Set(fuse.search(trimmed).map((result) => result.item));

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

export type SettingsNavigationSearchResult = {
    item: SettingsNavigationItem;
    /** Section title + ancestor labels, root first (excludes the leaf). */
    path: string[];
};

type FlatSettingsEntry = {
    item: SettingsNavigationItem;
    sectionTitle: string;
    ancestors: string[];
};

const flattenWithAncestors = (
    items: SettingsNavigationItem[],
    sectionTitle: string,
    ancestors: string[],
): FlatSettingsEntry[] =>
    items.flatMap((item) => [
        { item, sectionTitle, ancestors },
        ...flattenWithAncestors(item.children, sectionTitle, [
            ...ancestors,
            item.label,
        ]),
    ]);

/**
 * Flat fuzzy match across every nav destination, each carrying its breadcrumb.
 * Matches label, keywords, ancestor labels, and section title — so "ask ai" or
 * "current project" surface the relevant pages.
 */
export const searchSettingsNavigationItemsWithPath = (
    sections: SettingsNavigationSection[],
    query: string,
): SettingsNavigationSearchResult[] => {
    const trimmed = query.trim();
    if (trimmed === '') {
        return [];
    }

    const entries = sections.flatMap((section) =>
        flattenWithAncestors(section.items, section.title, []),
    );
    const fuse = new Fuse(entries, {
        keys: [
            { name: 'item.label', weight: 2 },
            { name: 'item.keywords', weight: 1 },
            { name: 'ancestors', weight: 1 },
            { name: 'sectionTitle', weight: 1 },
        ],
        ignoreLocation: true,
        threshold: FUSE_THRESHOLD,
    });

    return fuse.search(trimmed).map(({ item: entry }) => ({
        item: entry.item,
        path: [entry.sectionTitle, ...entry.ancestors],
    }));
};
