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
import { isSameTilePlacement } from '../store';

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
    /** What changed, as the list shows it */
    label: string;
};

type Tile = Dashboard['tiles'][number];

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
): PendingChange => ({ area, kind, id, label });

const byKey = <T>(items: T[], keyOf: (item: T) => string) =>
    new Map(items.map((item) => [keyOf(item), item]));

const diffByKey = <T>(saved: T[], draft: T[], keyOf: (item: T) => string) => {
    const savedByKey = byKey(saved, keyOf);
    const draftByKey = byKey(draft, keyOf);
    return {
        added: draft.filter((item) => !savedByKey.has(keyOf(item))),
        removed: saved.filter((item) => !draftByKey.has(keyOf(item))),
        kept: draft.flatMap((after) => {
            const before = savedByKey.get(keyOf(after));
            return before === undefined ? [] : [{ before, after }];
        }),
    };
};

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

// The grid pushes other tiles aside, so every placement change is one entry
const getTileChanges = (
    saved: Dashboard['tiles'],
    draft: Dashboard['tiles'],
    draftTabs: Dashboard['tabs'],
): PendingChange[] => {
    const diff = diffByKey(saved, draft, (tile) => tile.uuid);
    const tabNameOf = (uuid: string | null | undefined) =>
        draftTabs.find((tab) => tab.uuid === uuid)?.name ?? 'another tab';

    const added = diff.added.map((tile) =>
        change('tile', 'added', tile.uuid, getTileLabel(tile)),
    );
    const removed = diff.removed.map((tile) =>
        change('tile', 'removed', tile.uuid, getTileLabel(tile)),
    );
    const movedToTab = diff.kept
        .filter(({ before, after }) => before.tabUuid !== after.tabUuid)
        .map(({ after }) =>
            change(
                'tile',
                'moved',
                after.uuid,
                `${getTileLabel(after)} → ${tabNameOf(after.tabUuid)}`,
            ),
        );
    const edited = diff.kept
        .filter(
            ({ before, after }) =>
                before.type !== after.type ||
                !isEqual(before.properties, after.properties),
        )
        .map(({ after }) =>
            change('tile', 'edited', after.uuid, getTileLabel(after)),
        );
    const placed = diff.kept.filter(
        ({ before, after }) =>
            before.tabUuid === after.tabUuid &&
            !isSameTilePlacement(before, after),
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

const tabOrder = (tabs: Dashboard['tabs']) =>
    sortBy(tabs, 'order').map((tab) => tab.uuid);

const getTabChanges = (
    saved: Dashboard['tabs'],
    draft: Dashboard['tabs'],
): PendingChange[] => {
    const diff = diffByKey(saved, draft, (tab) => tab.uuid);
    const added = diff.added.map((tab) =>
        change('tab', 'added', tab.uuid, tab.name),
    );
    const removed = diff.removed.map((tab) =>
        change('tab', 'removed', tab.uuid, tab.name),
    );
    const renamed = diff.kept
        .filter(({ before, after }) => before.name !== after.name)
        .map(({ before, after }) =>
            change(
                'tab',
                'renamed',
                after.uuid,
                `${before.name} → ${after.name}`,
            ),
        );
    const visibility = diff.kept
        .filter(
            ({ before, after }) =>
                (before.hidden === true) !== (after.hidden === true),
        )
        .map(({ after }) =>
            change(
                'tab',
                'edited',
                `${after.uuid}:hidden`,
                `${after.name} ${after.hidden === true ? 'hidden' : 'shown'}`,
            ),
        );
    const reordered = isEqual(
        tabOrder(diff.kept.map(({ before }) => before)),
        tabOrder(diff.kept.map(({ after }) => after)),
    )
        ? []
        : [change('tab', 'reordered', 'tab-order', 'Tab order')];
    return [...added, ...removed, ...renamed, ...visibility, ...reordered];
};

const allRules = (filters: DashboardFilters): DashboardFilterRule[] => [
    ...filters.dimensions,
    ...filters.metrics,
    ...filters.tableCalculations,
];

// Absent and off are the same setting
const ruleSettingsOf = (rule: DashboardFilterRule) => ({
    required: rule.required === true,
    singleValue: rule.singleValue === true,
    requiredGroupId: rule.requiredGroupId ?? null,
    lockedTabUuids: rule.lockedTabUuids ?? [],
    sectionId: rule.sectionId ?? null,
});

const hasRuleChanged = (
    before: DashboardFilterRule,
    after: DashboardFilterRule,
) =>
    hasSavedFilterValueChanged(before, after) ||
    before.target.fieldId !== after.target.fieldId ||
    (before.label ?? null) !== (after.label ?? null) ||
    !isEqual(before.tileTargets ?? {}, after.tileTargets ?? {}) ||
    !isEqual(ruleSettingsOf(before), ruleSettingsOf(after));

const getFilterChanges = (
    saved: DashboardFilters,
    draft: DashboardFilters,
    getFilterLabel: Labels['getFilterLabel'],
): PendingChange[] => {
    const diff = diffByKey(allRules(saved), allRules(draft), (rule) => rule.id);
    const added = diff.added.map((rule) =>
        change('filter', 'added', rule.id, getFilterLabel(rule)),
    );
    const removed = diff.removed.map((rule) =>
        change('filter', 'removed', rule.id, getFilterLabel(rule)),
    );
    const edited = diff.kept
        .filter(({ before, after }) => hasRuleChanged(before, after))
        .map(({ after }) =>
            change('filter', 'edited', after.id, getFilterLabel(after)),
        );
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
