import {
    DimensionType,
    SemanticLayerFieldType,
    VizAggregationOptions,
    VizIndexType,
    assertUnreachable,
    type PivotChartData,
    type PivotValuesColumn,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type VizColumn,
} from '@lightdash/common';
import { apiGetSemanticLayerQueryResults } from '../semanticViewer/api/requests';

// not useful - semantic layer field type should be source of truth
function getDimensionTypeFromSemanticLayerFieldType(
    type: SemanticLayerFieldType,
): DimensionType {
    switch (type) {
        case SemanticLayerFieldType.TIME:
            return DimensionType.TIMESTAMP;
        case SemanticLayerFieldType.STRING:
            return DimensionType.STRING;
        case SemanticLayerFieldType.NUMBER:
            return DimensionType.NUMBER;
        case SemanticLayerFieldType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
}

// Useful but belongs on chart model
const getVizIndexTypeFromSemanticLayerFieldType = (
    type: SemanticLayerFieldType,
): VizIndexType => {
    switch (type) {
        case SemanticLayerFieldType.BOOLEAN:
        case SemanticLayerFieldType.NUMBER:
        case SemanticLayerFieldType.STRING:
            return VizIndexType.CATEGORY;
        case SemanticLayerFieldType.TIME:
            return VizIndexType.TIME;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
};

// TODO: can we set up the API so we dont need this?
const convertColumnNamesToVizColumns = (
    fields: SemanticLayerField[],
    columnNames: string[],
): VizColumn[] => {
    return columnNames
        .map<VizColumn | undefined>((columnName) => {
            const field = fields.find((f) => f.name === columnName);
            if (!field) {
                return;
            }

            const dimType = getDimensionTypeFromSemanticLayerFieldType(
                field.type,
            );

            return {
                reference: columnName,
                type: dimType,
            };
        })
        .filter((c): c is VizColumn => Boolean(c));
};

// This fields dependency should be fixed by fixing the API for semantic layer
export const getPivotQueryFunctionForSemanticViewer = (
    projectUuid: string,
    fields: SemanticLayerField[],
): RunPivotQuery => {
    return async (query: SemanticLayerQuery): Promise<PivotChartData> => {
        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid,
            query,
        });

        const { results, columns, fileUrl } = pivotedResults;

        // The backend call has no knowledge of field types, so we need to map them to the correct types
        const vizColumns: VizColumn[] = convertColumnNamesToVizColumns(
            fields,
            columns,
        );

        // The index column is the first column in the pivot config
        const indexField = fields.find((f) => f.name === query.pivot?.index[0]);

        const indexColumn = indexField
            ? {
                  reference: indexField.name,
                  type: getVizIndexTypeFromSemanticLayerFieldType(
                      indexField.type,
                  ),
              }
            : undefined;

        const valuesColumns: PivotValuesColumn[] =
            pivotedResults.columns.reduce<PivotValuesColumn[]>((acc, col) => {
                if (!query.pivot?.index.includes(col)) {
                    // Create a new object for the current column
                    const newColumn: PivotValuesColumn = {
                        referenceField: col,
                        pivotColumnName: col,
                        aggregation: VizAggregationOptions.ANY,
                        pivotValues: [],
                    };

                    // Use the spread operator to create a new array with the new column
                    return [...acc, newColumn];
                }

                return acc;
            }, []);

        return {
            results,
            indexColumn,
            valuesColumns,
            columns: vizColumns,
            fileUrl,
        };
    };
};
