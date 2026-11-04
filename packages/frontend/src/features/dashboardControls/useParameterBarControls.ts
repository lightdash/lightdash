import {
    friendlyName,
    getAllowedParameterValue,
    getControlledKeys,
    getControlTileUuids,
    getParameterControlSetter,
    getShadowedReservedNames,
    type DashboardParameterControl,
    type ParameterValue,
} from '@lightdash/common';
import { createContext, useContext, useMemo } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectControlSections,
    selectDashboardParameterDefinitions,
    selectDashboardTabs,
    selectDashboardTiles,
    selectMissingParametersByTile,
    selectParameterControls,
    selectParameterPicks,
    selectParameterControlPicks,
    selectParameterTilePicks,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../dashboard/store';
import { applyParameterPicks } from '../dashboard/store/parameterControls';
import {
    getControlSectionId,
    getParameterLabel,
    type ParameterControlParameter,
    getTabTileUuids,
    isControlShownOnTab,
    NEEDS_VALUE_PREFIX,
} from './parameterControlsBar';

export type ParameterBarEntry = {
    /** As saved, with a pick by key over its own value: what the draft starts from. */
    control: DashboardParameterControl;
    /** The value the pill shows: one outside the fixed options, or empty, reads as unset. */
    shownValue: ParameterValue | null;
    /** The keys it sets on its tiles; a "needs a value" pill's own key. */
    parameterKeys: string[];
    /** Its keys that have a definition. */
    parameters: ParameterControlParameter[];
    /** What its input edits: its value type, with its first key's options (none without a key). */
    input: ParameterControlParameter;
    /** A key left with no value on a tile no control sets it on. */
    isNeedsValue: boolean;
    /** A tile it sets has no value for a key it sets there. */
    isMissing: boolean;
    /** The tiles it sets. */
    tileUuids: string[];
    /** Unsectioned when it has none or it is gone. */
    sectionId: string | null;
    /** Its label, else its first parameter's label. */
    label: string;
    /** Another pill on the bar has the same name: its model, or "Project". */
    nameSuffix: string | null;
};

export type ParameterBar = {
    entries: ParameterBarEntry[];
    totalTileCount: number;
    shadowedReservedNames: string[];
};

/** The pill's name: its label, with its model when another pill shares it. */
export const getParameterEntryName = (entry: ParameterBarEntry): string =>
    entry.nameSuffix === null
        ? entry.label
        : `${entry.label} · ${entry.nameSuffix}`;

const isEmptyValue = (value: DashboardParameterControl['value']) =>
    value === null || value === '' || (Array.isArray(value) && !value.length);

const NO_ENTRIES: ParameterBar = {
    entries: [],
    totalTileCount: 0,
    shadowedReservedNames: [],
};

// The parameter controls on the tab in view, in list order, then the safety
// net's "needs a value" pills; nothing until the list is seeded (flag on)
export const useBuildParameterBar = (): ParameterBar => {
    const controls = useDashboardSelector(selectParameterControls);
    const picks = useDashboardSelector(selectParameterPicks);
    const controlPicks = useDashboardSelector(selectParameterControlPicks);
    const tilePicks = useDashboardSelector(selectParameterTilePicks);
    const definitions = useDashboardSelector(
        selectDashboardParameterDefinitions,
    );
    const references = useDashboardSelector(selectTileParameterReferences);
    const missingByTile = useDashboardSelector(selectMissingParametersByTile);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const sections = useDashboardSelector(selectControlSections);
    const getUiString = useUiStrings();
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );

    return useMemo(() => {
        if (controls === null) return NO_ENTRIES;
        // Loaded definitions are the user's: only these shadow a reserved name
        const userParameterNames = Object.keys(definitions);
        const tabTileUuids = getTabTileUuids(tiles ?? [], tabs, activeTabUuid);
        const parametersOf = (keys: string[]) =>
            keys.flatMap((key) => {
                const definition = definitions[key];
                return definition === undefined ? [] : [{ key, definition }];
            });
        const toEntry = (
            control: DashboardParameterControl,
            {
                parameterKeys,
                tileUuids,
                isNeedsValue,
                isMissing,
            }: Pick<
                ParameterBarEntry,
                'parameterKeys' | 'tileUuids' | 'isNeedsValue' | 'isMissing'
            >,
        ): ParameterBarEntry[] => {
            const parameters = parametersOf(parameterKeys);
            // As the shipped bar: only once its definition has loaded
            if (
                (parameterKeys.length > 0 &&
                    parameters[0]?.key !== parameterKeys[0]) ||
                !isControlShownOnTab(tileUuids, tabTileUuids)
            )
                return [];
            const label =
                control.label ??
                (parameters[0]
                    ? getParameterLabel(parameters[0])
                    : getUiString('controls.parameter.unnamed'));
            const input: ParameterControlParameter = {
                key: parameterKeys[0] ?? control.id,
                definition: {
                    ...(parameters[0]?.definition ?? { label }),
                    ...control.valueType,
                },
            };
            const shownValue =
                control.value === null || isEmptyValue(control.value)
                    ? null
                    : getAllowedParameterValue(input.definition, control.value);
            return [
                {
                    control,
                    shownValue,
                    parameterKeys,
                    parameters,
                    input,
                    isNeedsValue,
                    isMissing,
                    tileUuids,
                    sectionId: isNeedsValue
                        ? null
                        : getControlSectionId(control, sections),
                    label,
                    nameSuffix: null,
                },
            ];
        };
        const shown = applyParameterPicks(
            controls.map((control) =>
                Object.hasOwn(controlPicks, control.id)
                    ? { ...control, value: controlPicks[control.id] }
                    : control,
            ),
            Object.fromEntries(
                Object.entries(picks).filter(([, value]) => value !== null),
            ),
        );
        const controlledKeys = getControlledKeys(controls);
        // Per key, the tiles no control sets it on that are left without a
        // value, or hold a viewer's value for it (so it can change again)
        const uncoveredByKey = [
            ...Object.entries(missingByTile),
            ...Object.entries(tilePicks).map(
                ([tileUuid, values]) =>
                    [tileUuid, Object.keys(values)] as [string, string[]],
            ),
        ].reduce<Map<string, string[]>>((acc, [tileUuid, keys]) => {
            keys.forEach((key) => {
                if (
                    getParameterControlSetter(
                        controls,
                        key,
                        tileUuid,
                        userParameterNames,
                    )
                )
                    return;
                const tileUuids = acc.get(key) ?? [];
                if (!tileUuids.includes(tileUuid))
                    acc.set(key, [...tileUuids, tileUuid]);
            });
            return acc;
        }, new Map());
        const referencedKeys = new Set(Object.values(references).flat());
        // A viewer's pick keeps its pill, so the value can be changed again
        const pickedKeys = Object.keys(picks).filter(
            (key) =>
                picks[key] !== null &&
                referencedKeys.has(key) &&
                !controlledKeys.has(key),
        );
        const needsValue = [
            ...new Set([...uncoveredByKey.keys(), ...pickedKeys]),
        ].flatMap((key) => {
            const definition = definitions[key];
            // Beside another control on the key, it sets only the tiles left out
            const tileUuids = controlledKeys.has(key)
                ? (uncoveredByKey.get(key) ?? [])
                : Object.keys(references).filter((tileUuid) =>
                      references[tileUuid].includes(key),
                  );
            return toEntry(
                {
                    id: `${NEEDS_VALUE_PREFIX}${key}`,
                    label: definition?.label || key,
                    value:
                        picks[key] ??
                        (uncoveredByKey.get(key) ?? [])
                            .map((tileUuid) => tilePicks[tileUuid]?.[key])
                            .find((value) => value !== undefined) ??
                        null,
                    valueType: {
                        type: definition?.type ?? 'string',
                        multiple: definition?.multiple ?? false,
                    },
                    parameters: { [key]: 'all' },
                },
                {
                    parameterKeys: [key],
                    tileUuids,
                    isNeedsValue: true,
                    isMissing: tileUuids.some((tileUuid) =>
                        missingByTile[tileUuid]?.includes(key),
                    ),
                },
            );
        });
        const entries = [
            ...shown.flatMap((control) =>
                toEntry(control, {
                    parameterKeys: Object.keys(control.parameters),
                    tileUuids: getControlTileUuids({
                        control,
                        controls: shown,
                        tileParameterReferences: references,
                        userParameterNames,
                    }),
                    isNeedsValue: false,
                    // Per tile: a key it leaves without a value where it sets it
                    isMissing: Object.entries(missingByTile).some(
                        ([tileUuid, keys]) =>
                            keys.some(
                                (key) =>
                                    getParameterControlSetter(
                                        shown,
                                        key,
                                        tileUuid,
                                        userParameterNames,
                                    )?.id === control.id,
                            ),
                    ),
                }),
            ),
            ...needsValue,
        ];
        // A model parameter is keyed `model.name`; a project one has no model
        const tableLabels = new Map(
            (allFilterableFields ?? []).map(({ table, tableLabel }) => [
                table,
                tableLabel,
            ]),
        );
        const groupOf = ({ parameterKeys: [key = ''] }: ParameterBarEntry) => {
            const dot = key.indexOf('.');
            if (dot === -1) return getUiString('controls.parameter.project');
            const model = key.slice(0, dot);
            return tableLabels.get(model) ?? friendlyName(model);
        };
        // Only where the model tells colliding pills apart (a safety-net pill
        // shares its key's model with the control beside it)
        const groupsByName = entries.reduce<Map<string, Set<string>>>(
            (acc, entry) =>
                acc.set(
                    entry.label,
                    (acc.get(entry.label) ?? new Set()).add(groupOf(entry)),
                ),
            new Map(),
        );
        return {
            entries: entries.map((entry) =>
                (groupsByName.get(entry.label)?.size ?? 0) > 1
                    ? { ...entry, nameSuffix: groupOf(entry) }
                    : entry,
            ),
            totalTileCount: tiles?.length ?? 0,
            shadowedReservedNames: getShadowedReservedNames(
                Object.keys(definitions),
            ),
        };
    }, [
        controls,
        picks,
        controlPicks,
        tilePicks,
        definitions,
        references,
        missingByTile,
        tiles,
        tabs,
        activeTabUuid,
        sections,
        getUiString,
        allFilterableFields,
    ]);
};

export const ParameterBarContext = createContext<ParameterBar>(NO_ENTRIES);

/** The bar's parameter controls, built once by `ParameterBarProvider`; none outside it. */
export const useParameterBarControls = (): ParameterBar =>
    useContext(ParameterBarContext);
