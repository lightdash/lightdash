import {
    isCustomDimension,
    isDimension,
    isMetric,
    isNumericItem,
    isTableCalculation,
    MapChartType,
    type ItemsMap,
    type MapChart,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import { selectMapEditor } from './selectors';

type State = VisualizationStoreState;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
const inputsRows = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData?.rows;
const inputsColorPalette = (_: State, inputs: VisualizationInputs) =>
    inputs.colorPalette;

const MAX_COLOR_VALUES = 50;

const getItemName = (item: ItemsMap[string]) =>
    'label' in item
        ? item.label
        : 'displayName' in item
          ? item.displayName
          : 'name' in item
            ? item.name
            : '';

const findFieldIdByName = (
    itemsMap: ItemsMap | undefined,
    names: string[],
): string | undefined =>
    Object.entries(itemsMap ?? {}).find(([, item]) =>
        names.includes(getItemName(item).toLowerCase()),
    )?.[0];

/** Dimensions, metrics and table calculations the field pickers offer */
export const selectMapAvailableFields = createSelector(
    [inputsItemsMap],
    (itemsMap) =>
        Object.values(itemsMap ?? {}).filter(
            (item) =>
                isDimension(item) ||
                isCustomDimension(item) ||
                isMetric(item) ||
                isTableCalculation(item),
        ),
);

const selectLatLonCandidates = createSelector([inputsItemsMap], (itemsMap) => ({
    latitude: findFieldIdByName(itemsMap, ['latitude', 'lat']),
    longitude: findFieldIdByName(itemsMap, ['longitude', 'lon', 'long']),
}));

const selectUsesLatLon = (state: State) =>
    selectMapEditor(state).locationType !== MapChartType.AREA;

// In point modes an unset field falls back to one named like it
const withLatLonFallback = (
    stored: string | undefined,
    usesLatLon: boolean,
    candidate: string | undefined,
) => (stored || !usesLatLon ? stored : (candidate ?? stored));

export const selectMapLatitudeFieldId = createSelector(
    [
        (state: State) => selectMapEditor(state).latitudeFieldId,
        selectUsesLatLon,
        (state: State, inputs: VisualizationInputs) =>
            selectLatLonCandidates(state, inputs).latitude,
    ],
    withLatLonFallback,
);

export const selectMapLongitudeFieldId = createSelector(
    [
        (state: State) => selectMapEditor(state).longitudeFieldId,
        selectUsesLatLon,
        (state: State, inputs: VisualizationInputs) =>
            selectLatLonCandidates(state, inputs).longitude,
    ],
    withLatLonFallback,
);

export const selectMapValidConfig = createSelector(
    [selectMapEditor, selectMapLatitudeFieldId, selectMapLongitudeFieldId],
    (
        editor,
        latitudeFieldId,
        longitudeFieldId,
    ): MapChart & { saveMapExtent: boolean } =>
        latitudeFieldId === editor.latitudeFieldId &&
        longitudeFieldId === editor.longitudeFieldId
            ? editor
            : { ...editor, latitudeFieldId, longitudeFieldId },
);

/** Distinct string values of the colour field, for categorical colours */
export const selectMapCategoricalValues = createSelector(
    [
        (state: State) => selectMapEditor(state).valueFieldId,
        (state: State) => selectMapEditor(state).locationType,
        inputsItemsMap,
        inputsRows,
    ],
    (valueFieldId, locationType, itemsMap, rows) => {
        const valueItem = valueFieldId ? itemsMap?.[valueFieldId] : undefined;
        if (
            isNumericItem(valueItem) ||
            locationType === MapChartType.HEATMAP ||
            !valueFieldId ||
            !rows
        ) {
            return { values: [], remainingCount: 0 };
        }
        const seen = new Set<string>();
        for (const row of rows) {
            const raw = row[valueFieldId]?.value?.raw;
            if (raw != null && raw !== '') seen.add(String(raw));
        }
        const sorted = Array.from(seen).sort();
        return {
            values: sorted.slice(0, MAX_COLOR_VALUES),
            remainingCount: Math.max(0, sorted.length - MAX_COLOR_VALUES),
        };
    },
);

/** Palette colour each categorical value gets when it has no override */
export const selectMapCategoricalColorDefaults = createSelector(
    [selectMapCategoricalValues, inputsColorPalette],
    ({ values }, colorPalette): Record<string, string> =>
        Object.fromEntries(
            values.map((value, idx) => [
                value,
                colorPalette[idx % colorPalette.length],
            ]),
        ),
);
