import {
    DimensionType,
    FieldType,
    QueryExecutionContext,
    SemanticLayerFieldType,
    assertUnreachable,
    type PivotChartData,
    type RawResultRow,
    type ResultColumns,
    type SemanticLayerField,
    type VizColumn,
    type VizSortBy,
} from '@lightdash/common';
import { BaseResultsRunner } from '../../queryRunner/BaseResultsRunner';
import { getPivotQueryFunctionForSqlQuery } from '../../queryRunner/sqlRunnerPivotQueries';

const getSemanticLayerFieldTypeFromDimensionType = (
    type: DimensionType,
): SemanticLayerFieldType => {
    switch (type) {
        case DimensionType.STRING:
            return SemanticLayerFieldType.STRING;
        case DimensionType.NUMBER:
            return SemanticLayerFieldType.NUMBER;
        case DimensionType.BOOLEAN:
            return SemanticLayerFieldType.BOOLEAN;
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
            return SemanticLayerFieldType.TIME;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
};

export class SqlRunnerResultsRunnerFrontend extends BaseResultsRunner {
    constructor({
        columns,
        rows,
        projectUuid,
        limit,
        sql,
        sortBy,
    }: {
        columns: VizColumn[];
        rows: RawResultRow[];
        projectUuid: string;
        limit?: number;
        sql: string;
        sortBy?: VizSortBy[];
    }) {
        const fields: SemanticLayerField[] = columns.map((column) => ({
            kind: FieldType.DIMENSION,
            name: column.reference,
            type: getSemanticLayerFieldTypeFromDimensionType(
                column.type || DimensionType.STRING,
            ),
            visible: true,
            label: column.reference,
            // TODO: why are these required?
            availableGranularities: [],
            availableOperators: [],
        }));
        super({
            fields,
            rows,
            columnNames: fields.map((field) => field.name),
            runPivotQuery: getPivotQueryFunctionForSqlQuery({
                projectUuid,
                limit,
                sql,
                fields,
                sortBy,
                context: QueryExecutionContext.SQL_RUNNER,
            }),
        });
    }
}

export class SqlChartResultsRunner extends BaseResultsRunner {
    constructor({
        pivotChartData,
        originalColumns,
    }: {
        pivotChartData: PivotChartData;
        originalColumns: ResultColumns;
    }) {
        const fields: SemanticLayerField[] = Object.values(originalColumns).map(
            (column) => ({
                kind: FieldType.DIMENSION,
                name: column.reference,
                type: getSemanticLayerFieldTypeFromDimensionType(
                    column.type || DimensionType.STRING,
                ),
                visible: true,
                label: column.reference,
                // TODO: why are these required?
                availableGranularities: [],
                availableOperators: [],
            }),
        );
        super({
            fields,
            rows: pivotChartData.results,
            columnNames: fields.map((field) => field.name),
            runPivotQuery: async () => pivotChartData,
        });
    }
}
