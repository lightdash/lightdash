import {
    type ComboboxItem,
    type ComboboxParsedItem,
    type OptionsFilter,
} from '@mantine/core';
import { type ReactNode } from 'react';

export const ADD_TO_QUERY_GROUP_LABEL = 'Add to query';
export const SUGGESTED_GROUP_LABEL = 'Suggested';

const SYNTHETIC_GROUP_LABELS = new Set([
    ADD_TO_QUERY_GROUP_LABEL,
    SUGGESTED_GROUP_LABEL,
]);

type SearchableOption = ComboboxItem & { tablePrefix?: string };

/**
 * Matches every search word against the option label plus its table (the
 * dimmed prefix, or the table group it sits in), so "orders amount" finds
 * Orders › Amount. Every group with a match keeps at least one option, so
 * late-sorting tables are never dropped by `limit`; the remaining budget is
 * spent in order, which leaves the ungrouped case unchanged.
 */
export const optionsFilter: OptionsFilter = ({ options, search, limit }) => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = (option: ComboboxItem, groupLabel: ReactNode) => {
        if (words.length === 0) return true;
        const { label, tablePrefix } = option as SearchableOption;
        const table =
            tablePrefix ??
            (typeof groupLabel === 'string' &&
            !SYNTHETIC_GROUP_LABELS.has(groupLabel)
                ? groupLabel
                : '');
        const haystack = `${table} ${label}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
    };

    const matched: ComboboxParsedItem[] = [];
    for (const item of options) {
        if ('group' in item) {
            const kept = item.items.filter((option) =>
                matches(option, item.group),
            );
            if (kept.length > 0) matched.push({ ...item, items: kept });
        } else if (matches(item, undefined)) {
            matched.push(item);
        }
    }

    const groupCount = matched.filter((item) => 'group' in item).length;
    let budget = Math.max(limit - groupCount, 0);
    const result: ComboboxParsedItem[] = [];
    for (const item of matched) {
        if ('group' in item) {
            const extra = Math.min(item.items.length - 1, budget);
            budget -= extra;
            result.push({ ...item, items: item.items.slice(0, 1 + extra) });
        } else if (budget > 0) {
            budget -= 1;
            result.push(item);
        }
    }
    return result;
};
