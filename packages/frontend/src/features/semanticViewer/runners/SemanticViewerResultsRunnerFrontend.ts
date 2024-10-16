import {
    SemanticLayerFieldType,
    type RawResultRow,
    type SemanticLayerField,
    type VizColumn,
} from '@lightdash/common';
import {
    BaseResultsRunner,
    getDimensionTypeFromSemanticLayerFieldType,
} from '../../queryRunner/BaseResultsRunner';
import { getPivotQueryFunctionForSemanticViewer } from '../../queryRunner/semanticViewerPivotQueries';

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

    // TODO: this should be removed and we should get this information from the API.
    // It's here for now as a static method because everywhere it is needed uses this runner.
    // And the runner is where non chart-specific data transforms happen.
    static convertColumnsToVizColumns = (
        fields: SemanticLayerField[],
        columns: string[],
    ): VizColumn[] => {
        return columns.map<VizColumn>((column) => {
            const field = fields.find((f) => f.name === column);

            const dimType = getDimensionTypeFromSemanticLayerFieldType(
                field?.type ?? SemanticLayerFieldType.STRING,
            );

            return {
                reference: column,
                type: dimType,
            };
        });
    };
}
