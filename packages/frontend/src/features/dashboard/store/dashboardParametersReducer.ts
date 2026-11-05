import {
    type DashboardParameterControl,
    type DashboardParameters,
    type LanguageMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';
import { reconcileDashboardParameters } from '../../../providers/Dashboard/dashboardParametersUrl';

export type DashboardParametersState = {
    isEditMode: boolean;
    /** Parameters saved on the server */
    savedParameters: DashboardParameters;
    /** Parameters currently applied to the dashboard */
    parameters: DashboardParameters;
    parametersHaveChanged: boolean;
    /** Values set by key from outside the controls (URL, viewer, scheduler); null: cleared in edit mode */
    parameterPicks: Record<string, ParameterValue | null>;
    parameterControlPicks: Record<string, ParameterValue | null>;
    parameterTilePicks: Record<string, ParametersValuesMap>;
    pinnedParameters: string[];
    havePinnedParametersChanged: boolean;
    parameterOrder: string[];
    hasParameterOrderChanged: boolean;
    parameterDefinitions: ParameterDefinitions;
    parameterLabelOverrides: LanguageMap['parameters'];
    /** Each tile's references: its query's once it reports them, else the listed ones */
    tileParameterReferences: Record<string, string[]>;
    /** From each tile's own query response; null when it ran without reporting any (an error) */
    tileQueryParameterReferences: Record<string, string[] | null>;
    /** From the dashboard's list of tile references, before tiles run */
    tileListedParameterReferences: Record<string, string[]>;
    tileListedParameterSources: Record<string, string>;
    tileChartSavedParameters: Record<string, ParametersValuesMap>;
    tileVirtualViewSavedParameters: Record<string, ParametersValuesMap>;
    /** Null until seeded, which happens only with the dashboard-controls flag on */
    parameterControls: DashboardParameterControl[] | null;
    /** The dashboard has a saved list; otherwise the list is filled from the tiles */
    areParameterControlsSaved: boolean;
    haveParameterControlsChanged: boolean;
};

export const initialDashboardParametersState: DashboardParametersState = {
    isEditMode: false,
    savedParameters: {},
    parameters: {},
    parametersHaveChanged: false,
    parameterPicks: {},
    parameterControlPicks: {},
    parameterTilePicks: {},
    pinnedParameters: [],
    havePinnedParametersChanged: false,
    parameterOrder: [],
    hasParameterOrderChanged: false,
    parameterDefinitions: {},
    parameterLabelOverrides: undefined,
    tileParameterReferences: {},
    tileQueryParameterReferences: {},
    tileListedParameterReferences: {},
    tileListedParameterSources: {},
    tileChartSavedParameters: {},
    tileVirtualViewSavedParameters: {},
    parameterControls: null,
    areParameterControlsSaved: false,
    haveParameterControlsChanged: false,
};

export const dashboardParametersActions = {
    setIsEditMode: createAction<boolean>('dashboardParameters/setIsEditMode'),
    setSavedParameters: createAction<DashboardParameters>(
        'dashboardParameters/setSavedParameters',
    ),
    setParameter: createAction<{
        key: string;
        value: ParameterValue | null;
    }>('dashboardParameters/setParameter'),
    clearAllParameters: createAction('dashboardParameters/clearAllParameters'),
    /** Key-addressed values from a scheduled delivery */
    setParameterPicks: createAction<ParametersValuesMap>(
        'dashboardParameters/setParameterPicks',
    ),
    setParameterControlPick: createAction<{
        id: string;
        value: ParameterValue | null;
    }>('dashboardParameters/setParameterControlPick'),
    setParameterTilePicks: createAction<{
        key: string;
        value: ParameterValue | null;
        tileUuids: string[];
    }>('dashboardParameters/setParameterTilePicks'),
    setPinnedParameters: createAction<string[]>(
        'dashboardParameters/setPinnedParameters',
    ),
    toggleParameterPin: createAction<string>(
        'dashboardParameters/toggleParameterPin',
    ),
    setHavePinnedParametersChanged: createAction<boolean>(
        'dashboardParameters/setHavePinnedParametersChanged',
    ),
    /** Seeds pins from the saved config without marking them as changed */
    syncPinnedParameters: createAction<string[]>(
        'dashboardParameters/syncPinnedParameters',
    ),
    setParameterOrder: createAction<string[]>(
        'dashboardParameters/setParameterOrder',
    ),
    setHasParameterOrderChanged: createAction<boolean>(
        'dashboardParameters/setHasParameterOrderChanged',
    ),
    /** Seeds the order from the saved config without marking it as changed */
    syncParameterOrder: createAction<string[]>(
        'dashboardParameters/syncParameterOrder',
    ),
    addParameterDefinitions: createAction<ParameterDefinitions>(
        'dashboardParameters/addParameterDefinitions',
    ),
    setParameterLabelOverrides: createAction<LanguageMap['parameters']>(
        'dashboardParameters/setParameterLabelOverrides',
    ),
    /** Null: the tile ran but has no references to report, so the listed ones stay */
    addParameterReferences: createAction<{
        tileUuid: string;
        references: string[] | null;
    }>('dashboardParameters/addParameterReferences'),
    /** References listed for a tile before it runs; its query's replace them */
    addListedParameterReferences: createAction<{
        tileUuid: string;
        references: string[];
    }>('dashboardParameters/addListedParameterReferences'),
    /** Many tiles' listed references in one update */
    addListedParameterReferencesByTile: createAction<Record<string, string[]>>(
        'dashboardParameters/addListedParameterReferencesByTile',
    ),
    addDiscoveredParameterReferences: createAction<{
        references: Record<string, string[]>;
        definitions: ParameterDefinitions;
        sources: Record<string, string>;
    }>('dashboardParameters/addDiscoveredParameterReferences'),
    setTileChartSavedParameters: createAction<{
        tileUuid: string;
        values: ParametersValuesMap;
    }>('dashboardParameters/setTileChartSavedParameters'),
    setTileVirtualViewSavedParameters: createAction<{
        tileUuid: string;
        values: ParametersValuesMap;
    }>('dashboardParameters/setTileVirtualViewSavedParameters'),
    /** Seeds the saved or filled list without marking it as changed; ignored once changed */
    syncParameterControls: createAction<{
        controls: DashboardParameterControl[];
        isSaved: boolean;
    }>('dashboardParameters/syncParameterControls'),
    /** The flag went off: tiles take the dashboard-wide values again */
    deactivateParameterControls: createAction(
        'dashboardParameters/deactivateParameterControls',
    ),
    setParameterControls: createAction<DashboardParameterControl[]>(
        'dashboardParameters/setParameterControls',
    ),
    updateParameterControl: createAction<{
        id: string;
        changes: Partial<Omit<DashboardParameterControl, 'id'>>;
    }>('dashboardParameters/updateParameterControl'),
    removeParameterControl: createAction<string>(
        'dashboardParameters/removeParameterControl',
    ),
    setHaveParameterControlsChanged: createAction<boolean>(
        'dashboardParameters/setHaveParameterControlsChanged',
    ),
    /** Drops per-tile parameter state for tiles no longer on the dashboard */
    keepTileParameterState: createAction<string[]>(
        'dashboardParameters/keepTileParameterState',
    ),
};

const isEmptyParameterValue = (value: ParameterValue) =>
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

// Applied parameters only ever latch the changed flag on; mirrors the
// provider effect that compared them with the saved parameters after each change.
const withParameters = (
    state: DashboardParametersState,
    parameters: DashboardParameters,
): DashboardParametersState =>
    parameters === state.parameters
        ? state
        : {
              ...state,
              parameters,
              parametersHaveChanged:
                  state.parametersHaveChanged ||
                  !isEqual(parameters, state.savedParameters),
          };

export const keepTiles = <T>(
    byTileUuid: Record<string, T>,
    tileUuids: Set<string>,
): Record<string, T> =>
    Object.keys(byTileUuid).every((tileUuid) => tileUuids.has(tileUuid))
        ? byTileUuid
        : Object.fromEntries(
              Object.entries(byTileUuid).filter(([tileUuid]) =>
                  tileUuids.has(tileUuid),
              ),
          );

// A tile's own query references, once reported, win over listed ones
const withListedReferences = (
    state: DashboardParametersState,
    listedByTile: Record<string, string[]>,
): DashboardParametersState => ({
    ...state,
    tileListedParameterReferences: {
        ...state.tileListedParameterReferences,
        ...listedByTile,
    },
    tileParameterReferences: {
        ...state.tileParameterReferences,
        ...Object.fromEntries(
            Object.entries(listedByTile).map(([tileUuid, references]) => [
                tileUuid,
                state.tileQueryParameterReferences[tileUuid] ?? references,
            ]),
        ),
    },
});

// A refilled list keeps the ids of the filled controls it already had
const keepFilledControlIds = (
    previous: DashboardParameterControl[] | null,
    filled: DashboardParameterControl[],
): DashboardParameterControl[] => {
    const previousIdByKey = new Map(
        (previous ?? []).map((control) => [
            Object.keys(control.parameters)[0],
            control.id,
        ]),
    );
    return filled.map((control) => ({
        ...control,
        id:
            previousIdByKey.get(Object.keys(control.parameters)[0]) ??
            control.id,
    }));
};

const withControls = (
    state: DashboardParametersState,
    update: (
        controls: DashboardParameterControl[],
    ) => DashboardParameterControl[],
): DashboardParametersState =>
    state.parameterControls === null
        ? state
        : {
              ...state,
              parameterControls: update(state.parameterControls),
              haveParameterControlsChanged: true,
          };

// Plain reducer rather than createSlice: Immer would deep-freeze the react-query
// dashboard objects stored here and break any code that still mutates them.
export const dashboardParametersReducer = (
    state: DashboardParametersState = initialDashboardParametersState,
    action: UnknownAction,
): DashboardParametersState => {
    if (dashboardParametersActions.setIsEditMode.match(action)) {
        if (state.isEditMode === action.payload) return state;
        // Edit mode starts from the saved values
        const next = {
            ...state,
            isEditMode: action.payload,
            parameterPicks: action.payload ? {} : state.parameterPicks,
            parameterControlPicks: action.payload
                ? {}
                : state.parameterControlPicks,
            parameterTilePicks: action.payload ? {} : state.parameterTilePicks,
        };
        return withParameters(
            next,
            reconcileDashboardParameters(
                state.parameters,
                state.savedParameters,
                action.payload,
            ),
        );
    }
    if (dashboardParametersActions.setSavedParameters.match(action)) {
        const savedParameters = action.payload;
        if (savedParameters === state.savedParameters) return state;
        // The previous effect compared the not-yet-reconciled parameters
        // with the new saved ones before reconciling, so this can latch too.
        const next = {
            ...state,
            savedParameters,
            parameterPicks: state.isEditMode ? {} : state.parameterPicks,
            parametersHaveChanged:
                state.parametersHaveChanged ||
                !isEqual(state.parameters, savedParameters),
        };
        return withParameters(
            next,
            reconcileDashboardParameters(
                state.parameters,
                savedParameters,
                state.isEditMode,
            ),
        );
    }
    if (dashboardParametersActions.setParameter.match(action)) {
        const { key, value } = action.payload;
        if (value === null || isEmptyParameterValue(value)) {
            const { [key]: _removedPick, ...otherPicks } = state.parameterPicks;
            const withPicks = {
                ...state,
                parameterPicks: state.isEditMode
                    ? { ...otherPicks, [key]: null }
                    : otherPicks,
            };
            // In view mode, reverting to "no value" falls back to the
            // dashboard-saved default (which the tile queries also use). In
            // edit mode, clearing fully removes the override.
            const savedParameter = state.savedParameters[key];
            if (!state.isEditMode && savedParameter) {
                return withParameters(withPicks, {
                    ...state.parameters,
                    [key]: savedParameter,
                });
            }
            const { [key]: _removed, ...rest } = state.parameters;
            return withParameters(withPicks, rest);
        }
        return withParameters(
            {
                ...state,
                parameterPicks: { ...state.parameterPicks, [key]: value },
            },
            {
                ...state.parameters,
                [key]: { parameterName: key, value },
            },
        );
    }
    if (dashboardParametersActions.clearAllParameters.match(action)) {
        const parameterPicks = state.isEditMode
            ? Object.fromEntries(
                  Object.keys({
                      ...state.savedParameters,
                      ...state.parameters,
                      ...state.parameterPicks,
                  }).map((key) => [key, null]),
              )
            : {};
        return withParameters(
            isEqual(parameterPicks, state.parameterPicks) &&
                Object.keys(state.parameterControlPicks).length === 0 &&
                Object.keys(state.parameterTilePicks).length === 0
                ? state
                : {
                      ...state,
                      parameterPicks,
                      parameterControlPicks: {},
                      parameterTilePicks: {},
                  },
            state.isEditMode ? {} : state.savedParameters,
        );
    }
    if (dashboardParametersActions.setParameterPicks.match(action)) {
        return { ...state, parameterPicks: action.payload };
    }
    if (dashboardParametersActions.setParameterControlPick.match(action)) {
        const { id, value } = action.payload;
        return {
            ...state,
            parameterControlPicks: {
                ...state.parameterControlPicks,
                [id]: value,
            },
        };
    }
    if (dashboardParametersActions.setParameterTilePicks.match(action)) {
        const { key, value, tileUuids } = action.payload;
        const parameterTilePicks = { ...state.parameterTilePicks };
        tileUuids.forEach((tileUuid) => {
            const { [key]: _previous, ...rest } =
                parameterTilePicks[tileUuid] ?? {};
            parameterTilePicks[tileUuid] =
                value === null ? rest : { ...rest, [key]: value };
        });
        return { ...state, parameterTilePicks };
    }
    if (dashboardParametersActions.setPinnedParameters.match(action)) {
        return {
            ...state,
            pinnedParameters: action.payload,
            havePinnedParametersChanged: true,
        };
    }
    if (dashboardParametersActions.toggleParameterPin.match(action)) {
        const key = action.payload;
        return {
            ...state,
            pinnedParameters: state.pinnedParameters.includes(key)
                ? state.pinnedParameters.filter((pinned) => pinned !== key)
                : [...state.pinnedParameters, key],
            havePinnedParametersChanged: true,
        };
    }
    if (
        dashboardParametersActions.setHavePinnedParametersChanged.match(action)
    ) {
        return state.havePinnedParametersChanged === action.payload
            ? state
            : { ...state, havePinnedParametersChanged: action.payload };
    }
    if (dashboardParametersActions.syncPinnedParameters.match(action)) {
        return state.pinnedParameters === action.payload
            ? state
            : { ...state, pinnedParameters: action.payload };
    }
    if (dashboardParametersActions.setParameterOrder.match(action)) {
        return {
            ...state,
            parameterOrder: action.payload,
            hasParameterOrderChanged: true,
        };
    }
    if (dashboardParametersActions.setHasParameterOrderChanged.match(action)) {
        return state.hasParameterOrderChanged === action.payload
            ? state
            : { ...state, hasParameterOrderChanged: action.payload };
    }
    if (dashboardParametersActions.syncParameterOrder.match(action)) {
        return state.parameterOrder === action.payload
            ? state
            : { ...state, parameterOrder: action.payload };
    }
    if (dashboardParametersActions.addParameterDefinitions.match(action)) {
        return {
            ...state,
            parameterDefinitions: {
                ...state.parameterDefinitions,
                ...action.payload,
            },
        };
    }
    if (dashboardParametersActions.setParameterLabelOverrides.match(action)) {
        return state.parameterLabelOverrides === action.payload
            ? state
            : { ...state, parameterLabelOverrides: action.payload };
    }
    if (dashboardParametersActions.addParameterReferences.match(action)) {
        const { tileUuid, references } = action.payload;
        return {
            ...state,
            tileQueryParameterReferences: {
                ...state.tileQueryParameterReferences,
                [tileUuid]: references,
            },
            tileParameterReferences: {
                ...state.tileParameterReferences,
                [tileUuid]:
                    references ??
                    state.tileListedParameterReferences[tileUuid] ??
                    [],
            },
        };
    }
    if (dashboardParametersActions.addListedParameterReferences.match(action)) {
        const { tileUuid, references } = action.payload;
        return withListedReferences(state, { [tileUuid]: references });
    }
    if (
        dashboardParametersActions.addListedParameterReferencesByTile.match(
            action,
        )
    ) {
        return withListedReferences(state, action.payload);
    }
    if (
        dashboardParametersActions.addDiscoveredParameterReferences.match(
            action,
        )
    ) {
        const { references, definitions, sources } = action.payload;
        const tileQueryParameterReferences = {
            ...state.tileQueryParameterReferences,
        };
        Object.entries(sources).forEach(([tileUuid, source]) => {
            const previousSource = state.tileListedParameterSources[tileUuid];
            if (previousSource !== undefined && previousSource !== source) {
                delete tileQueryParameterReferences[tileUuid];
            }
        });
        return {
            ...withListedReferences(
                { ...state, tileQueryParameterReferences },
                references,
            ),
            parameterDefinitions: {
                ...state.parameterDefinitions,
                ...definitions,
            },
            tileListedParameterSources: {
                ...state.tileListedParameterSources,
                ...sources,
            },
        };
    }
    if (dashboardParametersActions.setTileChartSavedParameters.match(action)) {
        const { tileUuid, values } = action.payload;
        if (isEqual(state.tileChartSavedParameters[tileUuid], values)) {
            return state;
        }
        return {
            ...state,
            tileChartSavedParameters: {
                ...state.tileChartSavedParameters,
                [tileUuid]: values,
            },
        };
    }
    if (
        dashboardParametersActions.setTileVirtualViewSavedParameters.match(
            action,
        )
    ) {
        const { tileUuid, values } = action.payload;
        if (isEqual(state.tileVirtualViewSavedParameters[tileUuid], values)) {
            return state;
        }
        return {
            ...state,
            tileVirtualViewSavedParameters: {
                ...state.tileVirtualViewSavedParameters,
                [tileUuid]: values,
            },
        };
    }
    if (dashboardParametersActions.syncParameterControls.match(action)) {
        if (state.haveParameterControlsChanged) return state;
        const { isSaved, controls } = action.payload;
        const parameterControls = isSaved
            ? controls
            : keepFilledControlIds(state.parameterControls, controls);
        return isEqual(parameterControls, state.parameterControls) &&
            isSaved === state.areParameterControlsSaved
            ? state
            : {
                  ...state,
                  parameterControls,
                  areParameterControlsSaved: isSaved,
              };
    }
    if (dashboardParametersActions.deactivateParameterControls.match(action)) {
        return state.parameterControls === null &&
            !state.areParameterControlsSaved &&
            !state.haveParameterControlsChanged
            ? state
            : {
                  ...state,
                  parameterControls: null,
                  areParameterControlsSaved: false,
                  haveParameterControlsChanged: false,
              };
    }
    if (dashboardParametersActions.setParameterControls.match(action)) {
        return withControls(state, () => action.payload);
    }
    if (dashboardParametersActions.updateParameterControl.match(action)) {
        const { id, changes } = action.payload;
        return withControls(state, (controls) =>
            controls.map((control) =>
                control.id === id ? { ...control, ...changes } : control,
            ),
        );
    }
    if (dashboardParametersActions.removeParameterControl.match(action)) {
        return withControls(state, (controls) =>
            controls.filter(({ id }) => id !== action.payload),
        );
    }
    if (
        dashboardParametersActions.setHaveParameterControlsChanged.match(action)
    ) {
        return state.haveParameterControlsChanged === action.payload
            ? state
            : { ...state, haveParameterControlsChanged: action.payload };
    }
    if (dashboardParametersActions.keepTileParameterState.match(action)) {
        const tileUuids = new Set(action.payload);
        const tileParameterReferences = keepTiles(
            state.tileParameterReferences,
            tileUuids,
        );
        const tileQueryParameterReferences = keepTiles(
            state.tileQueryParameterReferences,
            tileUuids,
        );
        const tileListedParameterReferences = keepTiles(
            state.tileListedParameterReferences,
            tileUuids,
        );
        const tileListedParameterSources = keepTiles(
            state.tileListedParameterSources,
            tileUuids,
        );
        const tileChartSavedParameters = keepTiles(
            state.tileChartSavedParameters,
            tileUuids,
        );
        const tileVirtualViewSavedParameters = keepTiles(
            state.tileVirtualViewSavedParameters,
            tileUuids,
        );
        return tileParameterReferences === state.tileParameterReferences &&
            tileQueryParameterReferences ===
                state.tileQueryParameterReferences &&
            tileListedParameterReferences ===
                state.tileListedParameterReferences &&
            tileListedParameterSources === state.tileListedParameterSources &&
            tileChartSavedParameters === state.tileChartSavedParameters &&
            tileVirtualViewSavedParameters ===
                state.tileVirtualViewSavedParameters
            ? state
            : {
                  ...state,
                  tileParameterReferences,
                  tileQueryParameterReferences,
                  tileListedParameterReferences,
                  tileListedParameterSources,
                  tileChartSavedParameters,
                  tileVirtualViewSavedParameters,
              };
    }
    return state;
};
