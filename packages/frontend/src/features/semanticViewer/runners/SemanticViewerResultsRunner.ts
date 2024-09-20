import {
    type RawResultRow,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type VizColumn,
} from '@lightdash/common';
import {
    BaseResultsRunner,
    convertColumnNamesToVizColumns,
    getVizIndexTypeFromSemanticLayerFieldType,
} from '../../queryRunner/BaseResultsRunner';
import { apiGetSemanticLayerQueryResults } from '../api/requests';

// This fields dependency should be fixed by fixing the API for semantic layer
export const getPivotQueryFunctionForSemanticViewer = (
    projectUuid: string,
    fields: SemanticLayerField[],
): RunPivotQuery => {
    return async (query: SemanticLayerQuery) => {
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
        const onField = fields.find((f) => f.name === query.pivot?.on[0]);

        const indexColumn = onField
            ? {
                  reference: onField.name,
                  type: getVizIndexTypeFromSemanticLayerFieldType(onField.type),
              }
            : undefined;

        const valuesColumns = pivotedResults.columns.filter(
            (col) => !query.pivot?.on.includes(col),
        );

        return {
            results,
            indexColumn,
            valuesColumns,
            columns: vizColumns,
            fileUrl,
        };
    };
};

export class SemanticViewerResultsRunnerFrontend extends BaseResultsRunner {
    constructor({
        fields,
        rows,
        columnNames,
        projectUuid,
    }: {
        rows: RawResultRow[];
        columnNames: string[];
        fields: SemanticLayerField[];
        projectUuid: string;
    }) {
        super({
            rows,
            columnNames,
            fields,
            runPivotQuery: getPivotQueryFunctionForSemanticViewer(
                projectUuid,
                fields,
            ),
        });
    }
}
