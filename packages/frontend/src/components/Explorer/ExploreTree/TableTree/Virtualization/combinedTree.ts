import {
    getItemId,
    isCustomDimension,
    isDimension,
    OrderFieldsByStrategy,
    type AdditionalMetric,
    type CustomDimension,
    type Explore,
    type GroupType,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { LD_FIELD_COLORS } from '../../../../../theme';
import { isGroupNode, type NodeItem, type NodeMap } from '../Tree/types';
import { getNodeMapFromItemsMap } from '../Tree/utils';
import { TreeSection, type SectionInfo } from './types';

export type CombinedFieldTree = {
    name: string;
    sections: SectionInfo[];
    nodeMaps: Map<string, NodeMap>;
    itemsMap: Record<string, NodeItem>;
    sourceLabels: ReadonlyMap<string, string>;
    searchItems: {
        id: string;
        label: string;
        name: string;
        groups: string[];
        table: string;
        sourceLabel: string;
    }[];
};

export const searchCombinedFieldTree = (
    tree: CombinedFieldTree,
    query: string,
): string[] =>
    new Fuse(tree.searchItems, {
        keys: ['label', 'name', 'groups', 'table', 'sourceLabel'],
        ignoreLocation: true,
        threshold: 0.3,
    })
        .search(query)
        .map(({ item }) => item.id);

export const buildCombinedFieldTree = (
    explore: Explore,
    additionalMetrics: AdditionalMetric[],
    customDimensions: CustomDimension[],
    missingCustomMetrics: AdditionalMetric[],
    missingCustomDimensions: CustomDimension[],
): CombinedFieldTree => {
    const tableNames = [
        explore.baseTable,
        ...explore.joinedTables.map((join) => join.table),
        ...Object.keys(explore.tables),
    ];
    const tables = [...new Set(tableNames)]
        .map((name) => explore.tables[name])
        .filter((table) => table && !table.hidden);
    const visibleTableNames = new Set(tables.map((table) => table.name));
    const visibleCustomMetrics = [
        ...additionalMetrics,
        ...missingCustomMetrics,
    ].filter((item) => visibleTableNames.has(item.table));
    const visibleCustomDimensions = customDimensions.filter((item) =>
        visibleTableNames.has(item.table),
    );
    const tableLabelCounts = new Map<string, number>();
    tables.forEach((table) =>
        tableLabelCounts.set(
            table.label,
            (tableLabelCounts.get(table.label) ?? 0) + 1,
        ),
    );
    const sourceLabels = new Map(
        tables.map((table) => [
            table.name,
            (tableLabelCounts.get(table.label) ?? 0) > 1
                ? `${table.label} (${table.name})`
                : table.label,
        ]),
    );
    const groupDetails: Record<string, GroupType> = {};
    tables.forEach((table) => {
        Object.entries(table.groupDetails ?? {}).forEach(([key, detail]) => {
            groupDetails[key] ??= detail;
        });
    });
    const orderFieldsBy =
        explore.tables[explore.baseTable]?.orderFieldsBy ??
        OrderFieldsByStrategy.LABEL;
    const toItemsMap = (items: NodeItem[]): Record<string, NodeItem> =>
        Object.fromEntries(items.map((item) => [getItemId(item), item]));
    const metricsMap = toItemsMap(
        tables.flatMap((table) => Object.values(table.metrics)),
    );
    const sections: SectionInfo[] = [
        {
            type: TreeSection.Dimensions,
            label: 'Dimensions',
            color: LD_FIELD_COLORS.dimension.color,
            itemsMap: toItemsMap(
                tables.flatMap((table) => Object.values(table.dimensions)),
            ),
            orderFieldsBy,
        },
        {
            type: TreeSection.Metrics,
            label: 'Metrics',
            color: LD_FIELD_COLORS.metric.color,
            itemsMap: metricsMap,
            orderFieldsBy,
        },
        {
            type: TreeSection.CustomMetrics,
            label: 'Custom metrics',
            color: LD_FIELD_COLORS.metric.color,
            itemsMap: toItemsMap(visibleCustomMetrics),
            missingItems: missingCustomMetrics,
            itemsAlerts: Object.fromEntries(
                visibleCustomMetrics.map((item) => [
                    getItemId(item),
                    {
                        errors: metricsMap[getItemId(item)]
                            ? [
                                  {
                                      message:
                                          'A metric with this ID already exists in the table. Rename your custom metric to prevent conflicts.',
                                  },
                              ]
                            : undefined,
                    },
                ]),
            ),
            orderFieldsBy,
        },
        {
            type: TreeSection.CustomDimensions,
            label: 'Custom dimensions',
            color: LD_FIELD_COLORS.dimension.color,
            itemsMap: toItemsMap(visibleCustomDimensions),
            missingItems: missingCustomDimensions,
            orderFieldsBy,
        },
    ];
    const nodeMaps = new Map<string, NodeMap>();
    const searchItems: CombinedFieldTree['searchItems'] = [];
    const itemsMap: Record<string, NodeItem> = {};
    sections.forEach((section) => {
        Object.assign(itemsMap, section.itemsMap);
        const orderedItems = tables.flatMap((table) =>
            Object.entries(section.itemsMap)
                .filter(([, item]) => item.table === table.name)
                .sort(
                    ([, a], [, b]) =>
                        (isCustomDimension(a)
                            ? Number.MAX_SAFE_INTEGER
                            : (a.index ?? Number.MAX_SAFE_INTEGER)) -
                        (isCustomDimension(b)
                            ? Number.MAX_SAFE_INTEGER
                            : (b.index ?? Number.MAX_SAFE_INTEGER)),
                ),
        );
        const fieldOrder = new Map(
            orderedItems.map(([id], index) => [id, index]),
        );
        const intervalGroupSources = new Map<string, string>();
        const presentationGroupDetails = { ...groupDetails };
        const presentationItems = orderedItems.map(([id, item]) => {
            if (
                !isDimension(item) ||
                !item.timeInterval ||
                !item.timeIntervalBaseDimensionName ||
                !item.groups?.length
            ) {
                return [id, item] as const;
            }
            // The compiler appends the date's display label as the final group.
            const group = JSON.stringify([
                'time-interval',
                item.table,
                item.timeIntervalBaseDimensionName,
            ]);
            presentationGroupDetails[group] = {
                label: item.groups[item.groups.length - 1],
            };
            intervalGroupSources.set(
                JSON.stringify(['group', group]),
                item.table,
            );
            return [
                id,
                { ...item, groups: [...item.groups.slice(0, -1), group] },
            ] as const;
        });
        const nodeMap = getNodeMapFromItemsMap(
            Object.fromEntries(presentationItems),
            presentationGroupDetails,
            orderFieldsBy,
            { groupByKey: true, fieldOrder },
        );
        const addSources = (nodes: NodeMap, parentLabels: string[] = []) => {
            const siblings = Object.values(nodes);
            const labelCounts = new Map<string, number>();
            siblings.forEach((node) =>
                labelCounts.set(
                    node.label,
                    (labelCounts.get(node.label) ?? 0) + 1,
                ),
            );
            Object.values(nodes).forEach((node) => {
                if (isGroupNode(node)) {
                    addSources(node.children, [...parentLabels, node.label]);
                    const firstChild = Object.values(node.children)[0];
                    const firstItem =
                        firstChild && section.itemsMap[firstChild.key];
                    const intervalTable = intervalGroupSources.get(node.key);
                    if (intervalTable) {
                        node.source = {
                            label:
                                sourceLabels.get(intervalTable) ??
                                intervalTable,
                            showInline: (labelCounts.get(node.label) ?? 0) > 1,
                        };
                    } else if (
                        isDimension(firstItem) &&
                        firstItem.group &&
                        node.key ===
                            JSON.stringify([
                                'group',
                                getItemId({
                                    table: firstItem.table,
                                    name: firstItem.group,
                                }),
                            ])
                    ) {
                        node.source = {
                            label: firstChild.source?.label ?? firstItem.table,
                            showInline: (labelCounts.get(node.label) ?? 0) > 1,
                        };
                    }
                } else {
                    const item = section.itemsMap[node.key];
                    node.source = {
                        label: sourceLabels.get(item.table) ?? item.table,
                        showInline: (labelCounts.get(node.label) ?? 0) > 1,
                    };
                    searchItems.push({
                        id: node.key,
                        label: node.label,
                        name: item.name,
                        groups: parentLabels,
                        table: item.table,
                        sourceLabel: node.source.label,
                    });
                }
            });
        };
        addSources(nodeMap);
        nodeMaps.set(`${explore.name}-${section.type}`, nodeMap);
    });
    return {
        name: explore.name,
        sections,
        nodeMaps,
        itemsMap,
        sourceLabels,
        searchItems,
    };
};
