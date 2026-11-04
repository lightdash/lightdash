import {
    friendlyName,
    type DashboardControlSection,
    type DashboardParameterControl,
    type DashboardTab,
    type DashboardTile,
    type LightdashProjectParameter,
} from '@lightdash/common';
import { getTilesOnTab } from './peers';

/** One parameter a control sets, with its definition. */
export type ParameterControlParameter = {
    key: string;
    definition: LightdashProjectParameter;
};

/** Its label, or its key when it has none, as the shipped pill shows it. */
export const getParameterLabel = ({
    key,
    definition,
}: ParameterControlParameter): string => definition.label || key;

export const getParameterControlBaseName = (
    control: DashboardParameterControl,
    first: ParameterControlParameter | undefined,
    unnamed: string,
): string => control.label ?? (first ? getParameterLabel(first) : unnamed);
export const getParameterModelLabel = (
    key: string,
    tableLabels: Map<string, string>,
    projectLabel: string,
): string => {
    const dot = key.indexOf('.');
    if (dot === -1) return projectLabel;
    const model = key.slice(0, dot);
    return tableLabels.get(model) ?? friendlyName(model);
};
export const getParameterNameSuffixes = (
    controls: { id: string; baseName: string; key: string }[],
    modelOf: (key: string) => string,
): Map<string, string | null> => {
    const models = controls.reduce<Map<string, Set<string>>>(
        (acc, { baseName, key }) =>
            acc.set(
                baseName,
                (acc.get(baseName) ?? new Set()).add(modelOf(key)),
            ),
        new Map(),
    );
    return new Map(
        controls.map(({ id, baseName, key }) => [
            id,
            (models.get(baseName)?.size ?? 0) > 1 ? modelOf(key) : null,
        ]),
    );
};

/** What a parameter pill's drag carries, so drops tell it from a filter's. */
export const PARAMETER_DRAG = 'parameter';
export const PARAMETER_PILL_ATTRIBUTE = 'data-parameter-pill';
export const PARAMETER_PILL_SELECTOR = `[${PARAMETER_PILL_ATTRIBUTE}]`;
/** A key no control sets that leaves a tile with no value: its pill's id. */
export const NEEDS_VALUE_PREFIX = 'needs-value:';

/** Its section, or null when it has none or it is gone (unsectioned). */
export const getControlSectionId = (
    control: DashboardParameterControl,
    sections: DashboardControlSection[],
): string | null =>
    control.sectionId !== undefined &&
    sections.some(({ id }) => id === control.sectionId)
        ? control.sectionId
        : null;

export const withControlSection = (
    control: DashboardParameterControl,
    sectionId: string | null,
): DashboardParameterControl => {
    const { sectionId: _previous, ...rest } = control;
    return sectionId === null ? rest : { ...rest, sectionId };
};

/** A drop on another control takes its place and section; on a section (null: none), last in it. */
export type ParameterControlDropTarget =
    | { controlId: string }
    | { sectionId: string | null };

// The list is the order: no order field of its own
export const moveParameterControl = (
    controls: DashboardParameterControl[],
    activeId: string,
    target: ParameterControlDropTarget,
    sections: DashboardControlSection[],
): DashboardParameterControl[] => {
    const from = controls.findIndex(({ id }) => id === activeId);
    if (from === -1) return controls;
    const rest = controls.filter((_, index) => index !== from);
    if ('controlId' in target) {
        const to = controls.findIndex(({ id }) => id === target.controlId);
        if (to === -1 || to === from) return controls;
        rest.splice(
            to,
            0,
            withControlSection(
                controls[from],
                getControlSectionId(controls[to], sections),
            ),
        );
        return rest;
    }
    if (getControlSectionId(controls[from], sections) === target.sectionId)
        return controls;
    return [...rest, withControlSection(controls[from], target.sectionId)];
};

/** The tiles on the tab in view; every tile without tabs. A tile on a tab that is gone shows on the first. */
export const getTabTileUuids = (
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    activeTabUuid: string | undefined,
): Set<string> =>
    new Set(
        (tabs.length === 0 || activeTabUuid === undefined
            ? tiles
            : getTilesOnTab(
                  tiles,
                  [...tabs].sort((a, b) => a.order - b.order),
                  activeTabUuid,
              )
        ).map(({ uuid }) => uuid),
    );

/** On the bar when a tile in view is bound to it, or none is (so it can still be removed). */
export const isControlShownOnTab = (
    tileUuids: string[],
    tabTileUuids: Set<string>,
): boolean =>
    tileUuids.length === 0 ||
    tileUuids.some((tileUuid) => tabTileUuids.has(tileUuid));

/** Add a missing-key control without overlapping existing assignments. */
export const addNeedsValueControl = (
    controls: DashboardParameterControl[],
    added: DashboardParameterControl,
    tileUuids: string[],
): DashboardParameterControl[] => {
    const held = new Set(
        controls.flatMap((control) => Object.keys(control.parameters)),
    );
    return [
        ...controls,
        {
            ...added,
            parameters: Object.fromEntries(
                Object.keys(added.parameters).map((key) => [
                    key,
                    held.has(key) ? { only: tileUuids } : 'all',
                ]),
            ),
        },
    ];
};
