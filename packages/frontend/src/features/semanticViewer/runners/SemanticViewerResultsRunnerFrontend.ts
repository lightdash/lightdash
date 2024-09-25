import { type RawResultRow, type SemanticLayerField } from '@lightdash/common';
import { BaseResultsRunner } from '../../queryRunner/BaseResultsRunner';
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
}
