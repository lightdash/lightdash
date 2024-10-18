import { type VizTableColumnsConfig } from '@lightdash/common';
import { createSelector } from 'reselect';
import { type RootState } from '../../../features/sqlRunner/store';

export const selectSemanticViewerState = (state: RootState) =>
    state.semanticViewer.status;

export const selectSemanticLayerInfo = (state: RootState) => {
    if (!state.semanticViewer.info) {
        throw new Error('Semantic layer has not been initialized');
    }

    return state.semanticViewer.info;
};

export const selectSemanticLayerQuery = (state: RootState) =>
    state.semanticViewer.semanticLayerQuery;

export const selectAllSelectedFieldNames = createSelector(
    [selectSemanticLayerQuery],
    ({ dimensions, metrics, timeDimensions }) => {
        return [
            ...dimensions.map((d) => d.name),
            ...timeDimensions.map((td) => td.name),
            ...metrics.map((m) => m.name),
        ];
    },
);

const selectSelectedDimensions = createSelector(
    [selectSemanticLayerQuery],
    ({ dimensions }) => Object.fromEntries(dimensions.map((d) => [d.name, d])),
);
const selectSelectedTimeDimensions = createSelector(
    [selectSemanticLayerQuery],
    ({ timeDimensions }) =>
        Object.fromEntries(timeDimensions.map((td) => [td.name, td])),
);
const selectSelectedMetrics = createSelector(
    [selectSemanticLayerQuery],
    ({ metrics }) => Object.fromEntries(metrics.map((m) => [m.name, m])),
);

export const getSelectedField = (name: string) =>
    createSelector(
        [
            selectSelectedDimensions,
            selectSelectedTimeDimensions,
            selectSelectedMetrics,
        ],
        (dimensions, timeDimensions, metrics) => {
            return (
                dimensions[name] ??
                timeDimensions[name] ??
                metrics[name] ??
                null
            );
        },
    );

export const selectFilters = createSelector(
    [selectSemanticLayerQuery],
    (semanticLayerQuery) => semanticLayerQuery.filters,
);

export const selectLimit = createSelector(
    [selectSemanticLayerQuery],
    (semanticLayerQuery) => semanticLayerQuery.limit,
);

export const selectSortBy = createSelector(
    [selectSemanticLayerQuery],
    (semanticLayerQuery) => semanticLayerQuery.sortBy,
);

export const selectResultsTableVizConfig = createSelector(
    [
        selectAllSelectedFieldNames,
        (s: RootState) => s.semanticViewer.columnNames,
    ],
    (allSelectedFieldNames, columnNames): VizTableColumnsConfig => {
        const selectedColumns = columnNames.filter((c) =>
            allSelectedFieldNames.includes(c),
        );

        return {
            columns: Object.fromEntries(
                selectedColumns.map((c) => [
                    c,
                    {
                        visible: true,
                        reference: c,
                        label: c,
                        frozen: false,
                    },
                ]),
            ),
        };
    },
);
