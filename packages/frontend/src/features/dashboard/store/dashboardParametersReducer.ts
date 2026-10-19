import {
    type DashboardParameters,
    type LanguageMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { reconcileDashboardParameters } from '../../../providers/Dashboard/dashboardParametersUrl';

export type DashboardParametersState = {
    isEditMode: boolean;
    /** Parameters saved on the server */
    savedParameters: DashboardParameters;
    /** Parameters currently applied to the dashboard */
    parameters: DashboardParameters;
    parametersHaveChanged: boolean;
    pinnedParameters: string[];
    havePinnedParametersChanged: boolean;
    parameterOrder: string[];
    hasParameterOrderChanged: boolean;
    parameterDefinitions: ParameterDefinitions;
    parameterLabelOverrides: LanguageMap['parameters'];
    tileParameterReferences: Record<string, string[]>;
    tileChartSavedParameters: Record<string, ParametersValuesMap>;
};

export const initialDashboardParametersState: DashboardParametersState = {
    isEditMode: false,
    savedParameters: {},
    parameters: {},
    parametersHaveChanged: false,
    pinnedParameters: [],
    havePinnedParametersChanged: false,
    parameterOrder: [],
    hasParameterOrderChanged: false,
    parameterDefinitions: {},
    parameterLabelOverrides: undefined,
    tileParameterReferences: {},
    tileChartSavedParameters: {},
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
    addParameterReferences: createAction<{
        tileUuid: string;
        references: string[];
    }>('dashboardParameters/addParameterReferences'),
    setTileChartSavedParameters: createAction<{
        tileUuid: string;
        values: ParametersValuesMap;
    }>('dashboardParameters/setTileChartSavedParameters'),
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

const keepTiles = <T>(
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

// Plain reducer rather than createSlice: Immer would deep-freeze the react-query
// dashboard objects stored here and break any code that still mutates them.
export const dashboardParametersReducer = (
    state: DashboardParametersState = initialDashboardParametersState,
    action: UnknownAction,
): DashboardParametersState => {
    if (dashboardParametersActions.setIsEditMode.match(action)) {
        if (state.isEditMode === action.payload) return state;
        const next = { ...state, isEditMode: action.payload };
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
            // In view mode, reverting to "no value" falls back to the
            // dashboard-saved default (which the tile queries also use). In
            // edit mode, clearing fully removes the override.
            const savedParameter = state.savedParameters[key];
            if (!state.isEditMode && savedParameter) {
                return withParameters(state, {
                    ...state.parameters,
                    [key]: savedParameter,
                });
            }
            const { [key]: _removed, ...rest } = state.parameters;
            return withParameters(state, rest);
        }
        return withParameters(state, {
            ...state.parameters,
            [key]: { parameterName: key, value },
        });
    }
    if (dashboardParametersActions.clearAllParameters.match(action)) {
        return withParameters(
            state,
            state.isEditMode ? {} : state.savedParameters,
        );
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
            tileParameterReferences: {
                ...state.tileParameterReferences,
                [tileUuid]: references,
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
    if (dashboardParametersActions.keepTileParameterState.match(action)) {
        const tileUuids = new Set(action.payload);
        const tileParameterReferences = keepTiles(
            state.tileParameterReferences,
            tileUuids,
        );
        const tileChartSavedParameters = keepTiles(
            state.tileChartSavedParameters,
            tileUuids,
        );
        return tileParameterReferences === state.tileParameterReferences &&
            tileChartSavedParameters === state.tileChartSavedParameters
            ? state
            : { ...state, tileParameterReferences, tileChartSavedParameters };
    }
    return state;
};
