import {
    DashboardTileTypes,
    assertUnreachable,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
} from '@lightdash/common';
import { isEqual, sortBy } from 'es-toolkit/compat';
import { hasSavedFilterValueChanged } from '../../dashboardFilters/FilterConfiguration/utils';

export type PendingChangeArea =
    | 'layout'
    | 'tile'
    | 'tab'
    | 'filter'
    | 'parameter'
    | 'setting';

export type PendingChangeKind =
    | 'added'
    | 'removed'
    | 'moved'
    | 'renamed'
    | 'edited'
    | 'reordered';

export type PendingChange = {
    area: PendingChangeArea;
    kind: PendingChangeKind;
    id: string;
    label: string;
    /** Extra context, such as the tab a tile moved to */
    detail: string | null;
};

type Tile = Dashboard['tiles'][number];
type Tab = Dashboard['tabs'][number];

export type DashboardSnapshot = {
    tiles: Dashboard['tiles'];
    tabs: Dashboard['tabs'];
    filters: DashboardFilters;
    parameters: DashboardParameters;
};

type Labels = {
    getFilterLabel: (rule: DashboardFilterRule) => string;
    getParameterLabel: (key: string) => string;
};

const change = (
    area: PendingChangeArea,
    kind: PendingChangeKind,
    id: string,
    label: string,
    detail: string | null = null,
): PendingChange => ({ area, kind, id, label, detail });

const byKey = <T>(items: T[], keyOf: (item: T) => string) =>
    new Map(items.map((item) => [keyOf(item), item]));

const tileTypeName = (type: DashboardTileTypes): string => {
    switch (type) {
        case DashboardTileTypes.SAVED_CHART:
            return 'Chart';
        case DashboardTileTypes.SQL_CHART:
            return 'SQL chart';
        case DashboardTileTypes.MARKDOWN:
            return 'Markdown';
        case DashboardTileTypes.LOOM:
            return 'Video';
        case DashboardTileTypes.HEADING:
            return 'Heading';
        case DashboardTileTypes.DATA_APP:
            return 'Data app';
        default:
            return assertUnreachable(type, `Unknown tile type ${type}`);
    }
};

const getTileLabel = (tile: Tile): string => {
    const { properties } = tile;
    if (properties.title) return properties.title;
    if ('chartName' in properties && properties.chartName) {
        return properties.chartName;
    }
    if ('text' in properties && properties.text) return properties.text;
    return tileTypeName(tile.type);
};

const hasMoved = (a: Tile, b: Tile) =>
    a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;

// The grid pushes other tiles aside, so every placement change is one entry
const getTileChanges = (
    saved: Dashboard['tiles'],
    draft: Dashboard['tiles'],
    draftTabs: Dashboard['tabs'],
): PendingChange[] => {
    const savedByUuid = byKey(saved, (tile) => tile.uuid);
    const draftByUuid = byKey(draft, (tile) => tile.uuid);
    const tabNameOf = (uuid: string | null | undefined) =>
        draftTabs.find((tab) => tab.uuid === uuid)?.name ?? null;

    const added = draft
        .filter((tile) => !savedByUuid.has(tile.uuid))
        .map((tile) => change('tile', 'added', tile.uuid, getTileLabel(tile)));
    const removed = saved
        .filter((tile) => !draftByUuid.has(tile.uuid))
        .map((tile) =>
            change('tile', 'removed', tile.uuid, getTileLabel(tile)),
        );

    const kept = draft.flatMap((tile) => {
        const before = savedByUuid.get(tile.uuid);
        return before === undefined ? [] : [{ before, after: tile }];
    });
    const movedToTab = kept
        .filter(({ before, after }) => before.tabUuid !== after.tabUuid)
        .map(({ after }) =>
            change(
                'tile',
                'moved',
                after.uuid,
                getTileLabel(after),
                tabNameOf(after.tabUuid),
            ),
        );
    const edited = kept
        .filter(
            ({ before, after }) =>
                before.type !== after.type ||
                !isEqual(before.properties, after.properties),
        )
        .map(({ after }) =>
            change('tile', 'edited', after.uuid, getTileLabel(after)),
        );
    const placed = kept.filter(
        ({ before, after }) =>
            before.tabUuid === after.tabUuid && hasMoved(before, after),
    ).length;
    const layout =
        placed === 0
            ? []
            : [
                  change(
                      'layout',
                      'moved',
                      'layout',
                      placed === 1 ? '1 tile' : `${placed} tiles`,
                  ),
              ];

    return [...layout, ...added, ...removed, ...movedToTab, ...edited];
};

const tabOrder = (tabs: Dashboard['tabs'], uuids: Set<string>) =>
    sortBy(tabs, 'order')
        .map((tab) => tab.uuid)
        .filter((uuid) => uuids.has(uuid));

const getTabChanges = (
    saved: Dashboard['tabs'],
    draft: Dashboard['tabs'],
): PendingChange[] => {
    const savedByUuid = byKey(saved, (tab) => tab.uuid);
    const draftByUuid = byKey(draft, (tab) => tab.uuid);
    const added = draft
        .filter((tab) => !savedByUuid.has(tab.uuid))
        .map((tab) => change('tab', 'added', tab.uuid, tab.name));
    const removed = saved
        .filter((tab) => !draftByUuid.has(tab.uuid))
        .map((tab) => change('tab', 'removed', tab.uuid, tab.name));
    const renamed = draft.flatMap((tab: Tab) => {
        const before = savedByUuid.get(tab.uuid);
        return before !== undefined && before.name !== tab.name
            ? [change('tab', 'renamed', tab.uuid, tab.name, before.name)]
            : [];
    });
    const common = new Set(
        draft.map((tab) => tab.uuid).filter((uuid) => savedByUuid.has(uuid)),
    );
    const reordered = isEqual(tabOrder(saved, common), tabOrder(draft, common))
        ? []
        : [change('tab', 'reordered', 'tab-order', 'Tabs')];
    return [...added, ...removed, ...renamed, ...reordered];
};

const allRules = (filters: DashboardFilters): DashboardFilterRule[] => [
    ...filters.dimensions,
    ...filters.metrics,
    ...filters.tableCalculations,
];

const hasRuleChanged = (
    before: DashboardFilterRule,
    after: DashboardFilterRule,
) =>
    hasSavedFilterValueChanged(before, after) ||
    before.target.fieldId !== after.target.fieldId ||
    (before.label ?? null) !== (after.label ?? null) ||
    !isEqual(before.tileTargets ?? {}, after.tileTargets ?? {});

const getFilterChanges = (
    saved: DashboardFilters,
    draft: DashboardFilters,
    getFilterLabel: Labels['getFilterLabel'],
): PendingChange[] => {
    const savedRules = allRules(saved);
    const draftRules = allRules(draft);
    const savedById = byKey(savedRules, (rule) => rule.id);
    const draftById = byKey(draftRules, (rule) => rule.id);
    const added = draftRules
        .filter((rule) => !savedById.has(rule.id))
        .map((rule) =>
            change('filter', 'added', rule.id, getFilterLabel(rule)),
        );
    const removed = savedRules
        .filter((rule) => !draftById.has(rule.id))
        .map((rule) =>
            change('filter', 'removed', rule.id, getFilterLabel(rule)),
        );
    const edited = draftRules.flatMap((rule) => {
        const before = savedById.get(rule.id);
        return before !== undefined && hasRuleChanged(before, rule)
            ? [change('filter', 'edited', rule.id, getFilterLabel(rule))]
            : [];
    });
    return [...added, ...removed, ...edited];
};

const getParameterChanges = (
    saved: DashboardParameters,
    draft: DashboardParameters,
    getParameterLabel: Labels['getParameterLabel'],
): PendingChange[] => {
    const keys = [...new Set([...Object.keys(saved), ...Object.keys(draft)])];
    return keys.flatMap((key) => {
        const before = saved[key];
        const after = draft[key];
        const label = getParameterLabel(key);
        if (before === undefined && after !== undefined) {
            return [change('parameter', 'added', key, label)];
        }
        if (before !== undefined && after === undefined) {
            return [change('parameter', 'removed', key, label)];
        }
        return isEqual(before?.value, after?.value)
            ? []
            : [change('parameter', 'edited', key, label)];
    });
};

/** Everything the draft changes against the saved dashboard, one entry per item */
export const getPendingChanges = (
    saved: DashboardSnapshot,
    draft: DashboardSnapshot,
    labels: Labels,
): PendingChange[] => [
    ...getTileChanges(saved.tiles, draft.tiles, draft.tabs),
    ...getTabChanges(saved.tabs, draft.tabs),
    ...getFilterChanges(saved.filters, draft.filters, labels.getFilterLabel),
    ...getParameterChanges(
        saved.parameters,
        draft.parameters,
        labels.getParameterLabel,
    ),
];

/** A setting that changed, for areas tracked by a changed flag only */
export const settingChange = (
    id: string,
    label: string,
    kind: Extract<PendingChangeKind, 'edited' | 'reordered'> = 'edited',
): PendingChange => change('setting', kind, id, label);
