import { type VizTableColumnsConfig } from '@lightdash/common';
import { createSelector } from 'reselect';
import { type RootState } from '.';

export const selectSemanticViewerState = (state: RootState) =>
    state.semanticViewer.status;

export const selectSemanticLayerInfo = (state: RootState) => {
    if (!state.semanticViewer.info) {
        throw new Error('Semantic layer has not been initialized');
    }

    return state.semanticViewer.info;
};

const selectSelectedDimensions = (state: RootState) =>
    state.semanticViewer.selectedDimensions;
const selectSelectedTimeDimensions = (state: RootState) =>
    state.semanticViewer.selectedTimeDimensions;
const selectSelectedMetrics = (state: RootState) =>
    state.semanticViewer.selectedMetrics;

const selectAllSelectedFieldsByKind = createSelector(
    [
        selectSelectedDimensions,
        selectSelectedTimeDimensions,
        selectSelectedMetrics,
    ],
    (dimensions, timeDimensions, metrics) => ({
        dimensions: Object.values(dimensions),
        timeDimensions: Object.values(timeDimensions),
        metrics: Object.values(metrics),
    }),
);

export const getSelectedField = (name: string) =>
    createSelector(
        [
            selectSelectedDimensions,
            selectSelectedTimeDimensions,
            selectSelectedMetrics,
        ],
        (dimensions, timeDimensions, metrics) => {
            return name in dimensions
                ? dimensions[name]
                : null ?? name in timeDimensions
                ? timeDimensions[name]
                : null ?? name in metrics
                ? metrics[name]
                : null ?? null;
        },
    );

export const selectAllSelectedFieldNames = createSelector(
    [selectAllSelectedFieldsByKind],
    ({ dimensions, metrics, timeDimensions }) => {
        return [
            ...dimensions.map((d) => d.name),
            ...timeDimensions.map((td) => td.name),
            ...metrics.map((m) => m.name),
        ];
    },
);

const selectLimit = (state: RootState) => state.semanticViewer.limit;
const selectSortBy = (state: RootState) => state.semanticViewer.sortBy;

export const selectSemanticLayerQuery = createSelector(
    [selectAllSelectedFieldsByKind, selectSortBy, selectLimit],
    (allSelectedFieldsByKind, sortBy, limit) => {
        return {
            ...allSelectedFieldsByKind,
            sortBy,
            limit,
        };
    },
);

export const selectResultsTableVizConfig = createSelector(
    [selectAllSelectedFieldNames, (s: RootState) => s.semanticViewer.columns],
    (allSelectedFieldNames, columns): VizTableColumnsConfig => {
        const selectedColumns = columns.filter((c) =>
            allSelectedFieldNames.includes(c.reference),
        );

        return {
            columns: Object.fromEntries(
                selectedColumns.map((c) => [
                    c.reference,
                    {
                        visible: true,
                        reference: c.reference,
                        label: c.reference,
                        frozen: false,
                    },
                ]),
            ),
        };
    },
);
