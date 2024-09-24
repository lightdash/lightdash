import {
    FieldType as FieldKind,
    getFlattenedFilterFieldProps,
    SemanticLayerFieldType,
    type SemanticLayerField,
    type VizTableColumnsConfig,
} from '@lightdash/common';
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

export const selectAllSelectedFieldsByKind = createSelector(
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

export const selectAllSelectedFields = createSelector(
    [selectAllSelectedFieldsByKind],
    (selectedFieldsByKind) => [
        ...selectedFieldsByKind.dimensions.map((d) => ({
            ...d,
            kind: FieldKind.DIMENSION,
        })),
        ...selectedFieldsByKind.timeDimensions.map((d) => ({
            ...d,
            kind: FieldKind.DIMENSION,
        })),
        ...selectedFieldsByKind.metrics.map((m) => ({
            ...m,
            kind: FieldKind.METRIC,
        })),
    ],
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

export const selectSemanticLayerQuery = (state: RootState) =>
    state.semanticViewer.semanticLayerQuery;

export const selectFilters = createSelector(
    [selectSemanticLayerQuery],
    (semanticLayerQuery) => semanticLayerQuery.filters,
);

// TODO: unused. remove maybe?
// export const selectLimit = createSelector(
//     [selectSemanticLayerQuery],
//     (semanticLayerQuery) => semanticLayerQuery.limit,
// );

export const selectSortBy = createSelector(
    [selectSemanticLayerQuery],
    (semanticLayerQuery) => semanticLayerQuery.sortBy,
);

export const selectFilterFields = createSelector([selectFilters], (filters) => {
    const allFilterFields = Object.values(filters).flatMap(
        getFlattenedFilterFieldProps,
    );

    return allFilterFields.reduce(
        (acc, f) => {
            if (
                f.fieldKind === FieldKind.DIMENSION &&
                f.fieldType !== SemanticLayerFieldType.TIME
            ) {
                acc.dimensions.push({ name: f.fieldRef });
            }

            if (
                f.fieldKind === FieldKind.DIMENSION &&
                f.fieldType === SemanticLayerFieldType.TIME
            ) {
                acc.timeDimensions.push({ name: f.fieldRef });
            }

            if (f.fieldKind === FieldKind.METRIC) {
                acc.metrics.push({ name: f.fieldRef });
            }

            return acc;
        },
        {
            dimensions: [] as Pick<SemanticLayerField, 'name'>[],
            timeDimensions: [] as Pick<SemanticLayerField, 'name'>[],
            metrics: [] as Pick<SemanticLayerField, 'name'>[],
        },
    );
});

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
