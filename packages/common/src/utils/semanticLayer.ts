import { uniqBy } from 'lodash';
import { FieldType as FieldKind } from '../types/field';
import {
    SemanticLayerFieldType,
    SemanticLayerFilterBaseOperator,
    type SemanticLayerFilter,
    type SemanticLayerQuery,
} from '../types/semanticLayer';
import assertUnreachable from './assertUnreachable';

const SEMANTIC_LAYER_DEFAULT_QUERY_LIMIT = 500;

export function getDefaultedLimit(
    maxQueryLimit: number,
    queryLimit?: number,
): number {
    return Math.min(
        queryLimit ?? SEMANTIC_LAYER_DEFAULT_QUERY_LIMIT,
        maxQueryLimit,
    );
}

export function getAvailableSemanticLayerFilterOperators(
    fieldType: SemanticLayerFieldType,
) {
    switch (fieldType) {
        case SemanticLayerFieldType.STRING:
            return [
                SemanticLayerFilterBaseOperator.IS,
                SemanticLayerFilterBaseOperator.IS_NOT,
            ];
        case SemanticLayerFieldType.NUMBER:
        case SemanticLayerFieldType.BOOLEAN:
            return [];
        case SemanticLayerFieldType.TIME:
            return [
                SemanticLayerFilterBaseOperator.IS,
                SemanticLayerFilterBaseOperator.IS_NOT,
            ];
        default:
            return assertUnreachable(
                fieldType,
                `Unsupported field type: ${fieldType}`,
            );
    }
}

function getFlattenedFilterFieldProps(
    filter: SemanticLayerFilter,
): Pick<SemanticLayerFilter, 'fieldRef' | 'fieldKind' | 'fieldType'>[] {
    const andFiltersFieldNames =
        filter.and?.flatMap(getFlattenedFilterFieldProps) ?? [];
    const orFiltersFieldNames =
        filter.or?.flatMap(getFlattenedFilterFieldProps) ?? [];

    return [
        {
            fieldRef: filter.fieldRef,
            fieldKind: filter.fieldKind,
            fieldType: filter.fieldType,
        },
        ...andFiltersFieldNames,
        ...orFiltersFieldNames,
    ];
}

export const fieldsInUseFromSemanticLayerQuery = (
    query: Pick<
        SemanticLayerQuery,
        'dimensions' | 'timeDimensions' | 'metrics' | 'filters'
    >,
) => {
    const queryFields = {
        dimensions: query.dimensions,
        timeDimensions: query.timeDimensions,
        metrics: query.metrics,
    };

    const allFields = query.filters
        .flatMap(getFlattenedFilterFieldProps)
        .reduce((acc, f) => {
            switch (f.fieldKind) {
                case FieldKind.DIMENSION:
                    switch (f.fieldType) {
                        case SemanticLayerFieldType.TIME:
                            return {
                                ...acc,
                                timeDimensions: [
                                    ...acc.timeDimensions,
                                    { name: f.fieldRef },
                                ],
                            };
                        case SemanticLayerFieldType.STRING:
                            return {
                                ...acc,
                                dimensions: [
                                    ...acc.dimensions,
                                    { name: f.fieldRef },
                                ],
                            };
                        default:
                            return assertUnreachable(
                                f.fieldType,
                                `Unsupported field type: ${f.fieldType}`,
                            );
                    }
                case FieldKind.METRIC:
                    return {
                        ...acc,
                        metrics: [...acc.metrics, { name: f.fieldRef }],
                    };
                default:
                    return assertUnreachable(
                        f.fieldKind,
                        `Unsupported field kind: ${f.fieldKind}`,
                    );
            }
        }, queryFields);

    return {
        dimensions: uniqBy(allFields.dimensions, 'name'),
        timeDimensions: uniqBy(allFields.timeDimensions, 'name'),
        metrics: uniqBy(allFields.metrics, 'name'),
    };
};
