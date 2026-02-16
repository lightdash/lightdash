import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    sortTimeFrames,
    type DashboardTab,
    type DashboardTile,
    type FilterableDimension,
    type Item,
} from '@lightdash/common';
import { useMemo } from 'react';

type FieldGroup = {
    tableLabel: string;
    tableName: string;
    fields: FilterableDimension[];
};

export type FieldSection = {
    label: string;
    groups: FieldGroup[];
    dimmed: boolean;
};

const getTypePriority = (i: Item): number => {
    if (isDimension(i) || isCustomDimension(i)) return 1;
    if (isMetric(i)) return 2;
    return 3;
};

const getGroupKey = (i: Item): string => {
    if (
        isDimension(i) &&
        'timeIntervalBaseDimensionName' in i &&
        i.timeIntervalBaseDimensionName
    ) {
        return i.timeIntervalBaseDimensionName;
    }
    return i.name;
};

const sortFields = (fields: FilterableDimension[]): FilterableDimension[] =>
    [...fields].sort((a, b) => {
        // Sort by table label
        if (isField(a) && isField(b) && a.table !== b.table) {
            return (a.tableLabel || '').localeCompare(b.tableLabel || '');
        }

        // Sort by type priority
        const priorityDiff = getTypePriority(a) - getTypePriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        // Sort by group
        const groupComparison = getGroupKey(a).localeCompare(getGroupKey(b));
        if (groupComparison !== 0) return groupComparison;

        // Within same group, sort time-based dimensions by interval
        if (
            isDimension(a) &&
            isDimension(b) &&
            'timeInterval' in a &&
            'timeInterval' in b &&
            a.timeInterval &&
            b.timeInterval
        ) {
            return sortTimeFrames(a.timeInterval, b.timeInterval);
        }

        return getItemLabelWithoutTableName(a).localeCompare(
            getItemLabelWithoutTableName(b),
        );
    });

const groupByTable = (fields: FilterableDimension[]): FieldGroup[] => {
    const groupMap = new Map<string, FieldGroup>();

    for (const field of fields) {
        const tableName = field.table;
        const tableLabel = field.tableLabel || field.table;

        const existing = groupMap.get(tableName);
        if (existing) {
            existing.fields.push(field);
        } else {
            groupMap.set(tableName, { tableLabel, tableName, fields: [field] });
        }
    }

    return Array.from(groupMap.values());
};

const matchesSearch = (field: FilterableDimension, search: string): boolean => {
    if (!search) return true;
    const lowerSearch = search.toLowerCase();
    return (
        getItemLabel(field).toLowerCase().includes(lowerSearch) ||
        getItemLabelWithoutTableName(field).toLowerCase().includes(lowerSearch)
    );
};

type UseFilterFieldSectionsArgs = {
    fields: FilterableDimension[];
    availableTileFilters: Record<string, FilterableDimension[]>;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    search: string;
};

export const useFilterFieldSections = ({
    fields,
    availableTileFilters,
    tiles,
    activeTabUuid,
    tabs,
    search,
}: UseFilterFieldSectionsArgs): FieldSection[] => {
    return useMemo(() => {
        const filtered = fields.filter((f) => matchesSearch(f, search));

        // No tabs or single tab: return flat section
        if (!activeTabUuid || tabs.length <= 1) {
            const sorted = sortFields(filtered);
            const groups = groupByTable(sorted);
            return [{ label: '', groups, dimmed: false }];
        }

        // Multi-tab: split by active tab
        const activeTabTileUuids = new Set(
            tiles.filter((t) => t.tabUuid === activeTabUuid).map((t) => t.uuid),
        );

        const activeTabFieldIds = new Set<string>();
        for (const [tileUuid, tileFields] of Object.entries(
            availableTileFilters,
        )) {
            if (activeTabTileUuids.has(tileUuid)) {
                for (const f of tileFields) {
                    activeTabFieldIds.add(getItemId(f));
                }
            }
        }

        const activeTabFields: FilterableDimension[] = [];
        const otherFields: FilterableDimension[] = [];

        for (const field of filtered) {
            if (activeTabFieldIds.has(getItemId(field))) {
                activeTabFields.push(field);
            } else {
                otherFields.push(field);
            }
        }

        const sections: FieldSection[] = [];

        if (activeTabFields.length > 0) {
            const sorted = sortFields(activeTabFields);
            sections.push({
                label: 'Fields in this tab',
                groups: groupByTable(sorted),
                dimmed: false,
            });
        }

        if (otherFields.length > 0) {
            const sorted = sortFields(otherFields);
            sections.push({
                label: 'Other available fields',
                groups: groupByTable(sorted),
                dimmed: true,
            });
        }

        return sections;
    }, [fields, availableTileFilters, tiles, activeTabUuid, tabs, search]);
};
