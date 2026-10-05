import {
    friendlyName,
    getTakenOutParameterKeys,
    isDashboardChartTileType,
    resolveTakenOutParameterValue,
    isReservedParameterName,
    type DashboardParameterControl,
    type DashboardTile,
    type ParameterDefinitions,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type ControlModel, type ControlTileState } from './context';
import { type ParameterControlDraft } from './controlDraft';
import { getParameterTypeForControl } from './controlType';
import {
    getDisplayLabels,
    getTileDisplayLabels,
    type LabelledItem,
} from './labels';
import { getControlOverview, type OverviewTile } from './overview';
import {
    addParameterKey,
    formatTileParameterValue,
    getControlTileKey,
    getIsAppliedOnSave,
    getFreeKeysOfType,
    getTileParameterOptions,
    hasUnknownParameterReferences,
    mapParameterTiles,
    removeParameterKey,
    resolveTileParameterValue,
    unmapParameterTiles,
    type ParameterTile,
} from './parameterMapping';
import { getControlTileKind } from './tiles';

// Every chart, SQL chart and data app tile with the parameters it references.
// A saved-chart tile that has not reported its references yet has none known.
export const useParameterTiles = (): ParameterTile[] => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    return useMemo(
        () =>
            (dashboardTiles ?? [])
                .filter((tile) => getControlTileKind(tile) !== null)
                .map((tile) => {
                    const references = tileParameterReferences[tile.uuid];
                    const isUnknown =
                        references === undefined &&
                        isDashboardChartTileType(tile) &&
                        !!tile.properties.savedChartUuid;
                    return {
                        tileUuid: tile.uuid,
                        parameterKeys: isUnknown
                            ? null
                            : (references ?? []).filter(
                                  (key) => !isReservedParameterName(key),
                              ),
                    };
                }),
        [dashboardTiles, tileParameterReferences],
    );
};

// A model parameter belongs to its model, as a field does to its table;
// a project parameter belongs to nothing
const toParameterItem = (
    key: string,
    definitions: ParameterDefinitions,
): LabelledItem => {
    const separator = key.indexOf('.');
    return {
        id: key,
        label: definitions[key]?.label || key,
        group: separator > 0 ? friendlyName(key.slice(0, separator)) : null,
    };
};

const NO_KEYS: Record<string, string[]> = {};

// Parameter controls have no tile that is only switched on or off
const NO_SWITCH = () => {};
const NO_FIELD = () => undefined;
const NOT_SQL = () => false;

// A parameter control's draft seen through its mappings. Returns null when
// the control being edited is not a parameter control.
export const useParameterControlModel = (
    draft: ParameterControlDraft | null,
    updateDraft: (
        updater: (draft: ParameterControlDraft) => ParameterControlDraft,
    ) => void,
    parameterControls: DashboardParameterControl[],
    getTabUuid: (tile: DashboardTile) => string | null,
): ControlModel | null => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const appliedParameterValues = useDashboardContext(
        (c) => c.appliedParameterValues,
    );
    const tileChartSavedParameters = useDashboardContext(
        (c) => c.tileChartSavedParameters,
    );
    const savedControls = useDashboardContext(
        (c) => c.dashboard?.config?.parameterControls,
    );
    const reportedTiles = useParameterTiles();

    const extraTileKeys = draft?.extraTileKeys ?? NO_KEYS;
    const tiles = useMemo(
        () =>
            reportedTiles.map((tile) => {
                const extra = extraTileKeys[tile.tileUuid];
                return extra && tile.parameterKeys !== null
                    ? {
                          ...tile,
                          parameterKeys: [
                              ...new Set([...tile.parameterKeys, ...extra]),
                          ],
                      }
                    : tile;
            }),
        [reportedTiles, extraTileKeys],
    );

    const control = draft?.control;
    const parameterType = draft
        ? getParameterTypeForControl(draft.controlType)
        : null;

    const derived = useMemo(() => {
        if (!control || parameterType === null) return null;
        const tabUuids = new Map(
            (dashboardTiles ?? []).map((tile) => [tile.uuid, getTabUuid(tile)]),
        );
        const overviewTiles: OverviewTile[] = tiles.map((tile) => ({
            tileUuid: tile.tileUuid,
            tabUuid: tabUuids.get(tile.tileUuid) ?? null,
            options:
                tile.parameterKeys === null
                    ? null
                    : getFreeKeysOfType({
                          controlId: control.id,
                          controls: parameterControls,
                          definitions,
                          candidateKeys: tile.parameterKeys,
                          type: parameterType,
                      }),
            mappedId: getControlTileKey(control, tile),
            isBulkMapped: true,
            switch: null,
        }));
        const ids = [
            ...new Set([
                ...control.parameterKeys,
                ...overviewTiles.flatMap((tile) => tile.options ?? []),
            ]),
        ];
        const items = Object.fromEntries(
            ids.map((key) => [key, toParameterItem(key, definitions)]),
        );
        const overview = getControlOverview({
            tiles: overviewTiles,
            order: control.parameterKeys,
            nameKeys: Object.fromEntries(
                ids.map((key) => [key, key.slice(key.indexOf('.') + 1)]),
            ),
            keepsEmptyRows: true,
        });
        const rowLabels = getDisplayLabels(
            [...overview.rows, ...overview.suggestions].map(
                ({ id }) => items[id],
            ),
        );
        const tileStates: Record<string, ControlTileState> = {};
        overviewTiles.forEach(({ tileUuid, options, mappedId }, index) => {
            const tileItems = getTileParameterOptions(
                control,
                tiles[index],
                options ?? [],
            ).map((id) => items[id]);
            const displays = getTileDisplayLabels(tileItems, rowLabels);
            const tileOptions = tileItems.map(({ id }) => ({
                id,
                display: displays[id],
            }));
            if (mappedId !== null) {
                tileStates[tileUuid] = {
                    status: 'mapped',
                    itemId: mappedId,
                    display: rowLabels[mappedId],
                    options: tileOptions,
                };
            } else if (options === null) {
                tileStates[tileUuid] = { status: 'loading' };
            } else if (tileOptions.length > 0) {
                tileStates[tileUuid] = {
                    status: 'unmapped',
                    options: tileOptions,
                };
            } else {
                tileStates[tileUuid] = { status: 'none' };
            }
        });
        return { overviewTiles, items, rowLabels, overview, tileStates };
    }, [
        control,
        parameterType,
        tiles,
        parameterControls,
        definitions,
        dashboardTiles,
        getTabUuid,
    ]);

    // A control with no name or value takes them from its first parameter
    const withDefaults = useCallback(
        (
            current: ParameterControlDraft,
            next: DashboardParameterControl,
            key: string,
        ): ParameterControlDraft => {
            const isFirstKey =
                current.control.parameterKeys.length === 0 &&
                next.parameterKeys.length > 0;
            return {
                ...current,
                control: {
                    ...next,
                    label:
                        isFirstKey && !next.label
                            ? definitions[key]?.label || key
                            : next.label,
                },
                // Kept when the last parameter goes: another can take it up
                value:
                    isFirstKey && current.value === null
                        ? (parameterValues[key] ?? null)
                        : current.value,
            };
        },
        [definitions, parameterValues],
    );

    const addItem = useCallback(
        (key: string) =>
            updateDraft((current) =>
                withDefaults(
                    current,
                    addParameterKey(current.control, key, tiles),
                    key,
                ),
            ),
        [updateDraft, withDefaults, tiles],
    );

    const removeItem = useCallback(
        (key: string) =>
            updateDraft((current) =>
                withDefaults(
                    current,
                    removeParameterKey(current.control, key, tiles),
                    key,
                ),
            ),
        [updateDraft, withDefaults, tiles],
    );

    const setTileItem = useCallback(
        (tileUuid: string, key: string | null) =>
            updateDraft((current) =>
                key === null
                    ? withDefaults(
                          current,
                          unmapParameterTiles(
                              current.control,
                              [tileUuid],
                              tiles,
                          ),
                          '',
                      )
                    : withDefaults(
                          current,
                          mapParameterTiles(
                              current.control,
                              [tileUuid],
                              key,
                              tiles,
                          ),
                          key,
                      ),
            ),
        [updateDraft, withDefaults, tiles],
    );

    const draftValue = draft?.value ?? null;
    const overviewTiles = derived?.overviewTiles;

    // The value a tile runs with once the draft is applied, in today's words
    const getTileRunValue = useCallback(
        (tileUuid: string) => {
            if (!control) return null;
            const tile = overviewTiles?.find((t) => t.tileUuid === tileUuid);
            const options = tile?.options ?? [];
            // The parameter the tile uses, else the one the control would set
            // on it: never another parameter the control has nothing to do with
            const key =
                tile?.mappedId ??
                options.find((option) =>
                    control.parameterKeys.includes(option),
                );
            if (key === undefined) return null;
            const dashboardValues = { ...appliedParameterValues };
            control.parameterKeys.forEach((k) => {
                if (draftValue === null) {
                    delete dashboardValues[k];
                } else {
                    dashboardValues[k] = draftValue;
                }
            });
            const takenOutKeys = getTakenOutParameterKeys(
                [
                    ...parameterControls.filter((c) => c.id !== control.id),
                    control,
                ],
                tileUuid,
            );
            const resolved = resolveTileParameterValue({
                key,
                takenOutKeys,
                dashboardValues,
                chartSavedValues: tileChartSavedParameters[tileUuid] ?? {},
                definitions,
            });
            return {
                text: formatTileParameterValue(resolved),
                isMissing: resolved.source === 'missing',
                isAppliedOnSave: getIsAppliedOnSave({
                    isSavedTakenOut: getTakenOutParameterKeys(
                        savedControls,
                        tileUuid,
                    ).includes(key),
                    isTakenOut: takenOutKeys.includes(key),
                    hasOwnValue:
                        resolveTakenOutParameterValue({
                            key,
                            chartSavedValues:
                                tileChartSavedParameters[tileUuid] ?? {},
                            definitions,
                        }) !== undefined,
                }),
            };
        },
        [
            control,
            overviewTiles,
            draftValue,
            appliedParameterValues,
            parameterControls,
            savedControls,
            tileChartSavedParameters,
            definitions,
        ],
    );

    return useMemo(
        () =>
            derived
                ? {
                      noun: 'parameter',
                      isLoading: hasUnknownParameterReferences(tiles),
                      ...derived,
                      field: undefined,
                      addItem,
                      removeItem,
                      setTileItem,
                      setTileOn: NO_SWITCH,
                      getField: NO_FIELD,
                      isSqlColumn: NOT_SQL,
                      getTileRunValue,
                  }
                : null,
        [derived, tiles, addItem, removeItem, setTileItem, getTileRunValue],
    );
};
