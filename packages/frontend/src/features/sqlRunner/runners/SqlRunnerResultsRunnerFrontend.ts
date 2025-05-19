import {
    DimensionType,
    FieldType,
    QueryExecutionContext,
    SemanticLayerFieldType,
    assertUnreachable,
    type DashboardFilters,
    type RawResultRow,
    type SemanticLayerField,
    type SortField,
    type VizColumn,
    type VizSortBy,
} from '@lightdash/common';
import { BaseResultsRunner } from '../../queryRunner/BaseResultsRunner';
import {
    getPivotQueryFunctionForDashboard,
    getPivotQueryFunctionForSqlChart,
    getPivotQueryFunctionForSqlQuery,
} from '../../queryRunner/sqlRunnerPivotQueries';

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

export class SqlRunnerResultsRunnerChart extends BaseResultsRunner {
    constructor({
        columns,
        rows,
        projectUuid,
        savedSqlUuid,
        limit,
    }: {
        columns: VizColumn[];
        rows: RawResultRow[];
        projectUuid: string;
        savedSqlUuid?: string;
        limit?: number;
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
            runPivotQuery: getPivotQueryFunctionForSqlChart({
                projectUuid,
                savedSqlUuid,
                limit,
                context: QueryExecutionContext.SQL_CHART,
            }),
        });
    }
}

export class SqlRunnerResultsRunnerDashboard extends BaseResultsRunner {
    constructor({
        columns,
        rows,
        projectUuid,
        savedSqlUuid,
        limit,
        dashboardUuid,
        dashboardFilters,
        dashboardSorts,
    }: {
        columns: VizColumn[];
        rows: RawResultRow[];
        projectUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        savedSqlUuid?: string;
        limit?: number;
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
            runPivotQuery: getPivotQueryFunctionForDashboard({
                projectUuid,
                dashboardUuid,
                savedSqlUuid,
                limit,
                dashboardFilters,
                dashboardSorts,
                context: QueryExecutionContext.DASHBOARD,
            }),
        });
    }
}
