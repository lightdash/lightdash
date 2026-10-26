import {
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import pickBy from 'lodash/pickBy';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';

type State = VisualizationStoreState;

export const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
export const inputsResults = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData;
export const inputsHasNoResults = (_: State, inputs: VisualizationInputs) =>
    !inputs.resultsData;
export const inputsRows = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData?.rows;
export const inputsMetricQuery = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData?.metricQuery;
export const inputsUnsavedMetricQuery = (
    _: State,
    inputs: VisualizationInputs,
) => inputs.unsavedMetricQuery;
export const inputsParameters = (_: State, inputs: VisualizationInputs) =>
    inputs.parameters;
export const inputsColorPalette = (_: State, inputs: VisualizationInputs) =>
    inputs.colorPalette;
export const inputsColumnOrder = (_: State, inputs: VisualizationInputs) =>
    inputs.columnOrder;
export const inputsPivotDimensions = (_: State, inputs: VisualizationInputs) =>
    inputs.pivotDimensions;
export const inputsPivotRows = (_: State, inputs: VisualizationInputs) =>
    inputs.initialPivotRows;
export const inputsTableCalculationsMetadata = (
    _: State,
    inputs: VisualizationInputs,
) => inputs.tableCalculationsMetadata;

/** A derived value that equals the stored one keeps the stored identity */
export const keepIfEqual = <T>(stored: T, derived: T) =>
    isEqual(stored, derived) ? stored : derived;

/** Dimensions, and numeric metrics with every table calculation: the pie and treemap pools */
export const selectDimensionsAndNumericMetrics = createSelector(
    [inputsItemsMap],
    (itemsMap) => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);
        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericMetrics: { ...metrics, ...tableCalculations },
        };
    },
);

/** Numeric metrics and table calculations, the pool gauge and funnel bind to */
export const selectNumericMetricsAndTableCalculations = createSelector(
    [inputsItemsMap],
    (itemsMap) => ({
        ...getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem),
        ...pickBy(getTableCalculationsFromItemsMap(itemsMap), isNumericItem),
    }),
);
