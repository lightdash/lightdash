import { type DashboardSummary } from '../../types/dashboard';
import { type Field, type TableCalculation } from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';

export type ApiAiDashboardSummaryResponse = {
    status: 'ok';
    results: DashboardSummary;
};

export type ApiAiGetDashboardSummaryResponse = {
    status: 'ok';
    results: DashboardSummary;
};

export type ApiAiGenerateCustomVizResponse = {
    status: 'ok';
    results: string;
};

export type GenerateChartMetadataRequest = {
    tableName: string;
    chartType: string;
    dimensions: string[];
    metrics: string[];
    filters?: MetricQuery['filters'];
    fieldsContext: Array<
        Pick<Field, 'name' | 'label' | 'description' | 'type'>
    >;
    chartConfigJson?: string;
};

export type GeneratedChartMetadata = {
    title: string;
    description: string;
};

export type ApiAiGenerateChartMetadataResponse = {
    status: 'ok';
    results: GeneratedChartMetadata;
};

export type TableCalculationFieldContext = Pick<
    Field,
    'name' | 'label' | 'description' | 'type' | 'table'
> & {
    fieldType: 'metric' | 'dimension' | 'table_calculation';
};

export type GenerateTableCalculationRequest = {
    prompt: string;
    tableName: string;
    fieldsContext: TableCalculationFieldContext[];
    existingTableCalculations?: string[];
    currentSql?: string;
};

export type GeneratedTableCalculation = {
    sql: string;
    displayName: TableCalculation['displayName'];
    type: TableCalculation['type'];
    format: TableCalculation['format'];
};

export type ApiAiGenerateTableCalculationResponse = {
    status: 'ok';
    results: GeneratedTableCalculation;
};
