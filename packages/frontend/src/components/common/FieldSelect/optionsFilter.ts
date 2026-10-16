import {
    type ComboboxItem,
    type ComboboxParsedItem,
    type OptionsFilter,
} from '@mantine/core';
import { type ReactNode } from 'react';
import i18n from '../../../i18n/i18n';

export const getAddToQueryGroupLabel = () =>
    i18n.t('fieldSelect.addToQueryGroup', { ns: 'commonUi' });
const getSuggestedGroupLabel = () =>
    i18n.t('fieldSelect.suggestedGroup', { ns: 'commonUi' });
/** Value of the disabled trailing row that counts options cut by `limit`. */
export const MORE_OPTIONS_VALUE = '__field_select_more__';

type SearchableOption = ComboboxItem & { tablePrefix?: string };

/**
 * Matches every search word against the option label plus its table (the
 * dimmed prefix, or the table group it sits in), so "orders amount" finds
 * Orders › Amount. Every group with a match keeps at least one option, so
 * late-sorting tables are never dropped by `limit`; the remaining budget is
 * spent in order, which leaves the ungrouped case unchanged. When options
 * are cut, a disabled row carrying the hidden count closes the list.
 */
export const optionsFilter: OptionsFilter = ({ options, search, limit }) => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const syntheticGroupLabels = new Set([
        getAddToQueryGroupLabel(),
        getSuggestedGroupLabel(),
    ]);
    const matches = (option: ComboboxItem, groupLabel: ReactNode) => {
        if (words.length === 0) return true;
        const { label, tablePrefix } = option as SearchableOption;
        const table =
            tablePrefix ??
            (typeof groupLabel === 'string' &&
            !syntheticGroupLabels.has(groupLabel)
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
    let hidden = 0;
    const result: ComboboxParsedItem[] = [];
    for (const item of matched) {
        if ('group' in item) {
            const extra = Math.min(item.items.length - 1, budget);
            budget -= extra;
            hidden += item.items.length - 1 - extra;
            result.push({ ...item, items: item.items.slice(0, 1 + extra) });
        } else if (budget > 0) {
            budget -= 1;
            result.push(item);
        } else {
            hidden += 1;
        }
    }
    if (hidden > 0) {
        result.push({
            value: MORE_OPTIONS_VALUE,
            label: String(hidden),
            disabled: true,
        });
    }
    return result;
};
