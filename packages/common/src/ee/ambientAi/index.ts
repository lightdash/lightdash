import {
    type CustomSqlDimension,
    type Field,
    type TableCalculation,
} from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';
import { type DataAppVizField } from '../apps/types';

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

export type CustomDimensionFieldContext = Pick<
    Field,
    'name' | 'label' | 'description' | 'type' | 'table'
> & {
    id: string;
};

export type GenerateCustomDimensionRequest = {
    prompt: string;
    tableName: string;
    fieldsContext: CustomDimensionFieldContext[];
    currentSql?: string;
};

export type GeneratedCustomDimension = {
    sql: string;
    displayName: CustomSqlDimension['name'];
    dimensionType: CustomSqlDimension['dimensionType'];
};

export type ApiAiGenerateCustomDimensionResponse = {
    status: 'ok';
    results: GeneratedCustomDimension;
};

export type FormulaAiContext = {
    tableName: string;
    fieldsContext: TableCalculationFieldContext[];
    existingTableCalculations: string[];
};

export type GenerateFormulaTableCalculationRequest =
    | ({
          mode: 'prompt';
          prompt: string;
          currentFormula?: string;
      } & FormulaAiContext)
    | ({
          mode: 'convert-sql';
          sourceSql: string;
      } & FormulaAiContext);

export type GeneratedFormulaTableCalculation = {
    formula: string;
    displayName: TableCalculation['displayName'];
    type: TableCalculation['type'];
    format: TableCalculation['format'];
};

export type ApiAiGenerateFormulaTableCalculationResponse = {
    status: 'ok';
    results: GeneratedFormulaTableCalculation;
};

export type TooltipFieldContext = {
    name: string;
    label?: string;
};

export type GenerateTooltipRequest = {
    prompt: string;
    fieldsContext: TooltipFieldContext[];
    currentHtml?: string;
};

export type GeneratedTooltip = {
    html: string;
};

export type ApiAiGenerateTooltipResponse = {
    status: 'ok';
    results: GeneratedTooltip;
};

/** Chart Studio: which fields of a table fit a chart type's declared inputs. */
export type SuggestChartTypeFieldsRequest = {
    prompt: string;
    /** Answers to the clarifying questions, in the order they were asked. */
    clarifications: string[];
    exploreName: string;
    /** The declared inputs to pick for. A rebuild sends only the new ones. */
    fields: DataAppVizField[];
};

export type SuggestedChartTypeFieldAlternative = {
    fieldId: string;
    reason: string;
};

export type SuggestedChartTypeField = {
    /** The declared input's name. */
    fieldName: string;
    /** Item ids in the explore. One unless the input accepts multiple; empty when nothing of the right type exists. */
    fieldIds: string[];
    /** One line, shown on hover. */
    reason: string;
    /** Up to two runners-up, shown in the select's Suggested group. */
    alternatives: SuggestedChartTypeFieldAlternative[];
};

export type SuggestedChartTypeFields = {
    suggestions: SuggestedChartTypeField[];
};

export type ApiAiSuggestChartTypeFieldsResponse = {
    status: 'ok';
    results: SuggestedChartTypeFields;
};

/** Chart Studio: which table fits a chart type, before any preview data is attached. */
export type SuggestChartTypeExploreRequest = {
    prompt: string;
    clarifications: string[];
    fields: DataAppVizField[];
};

export type SuggestedChartTypeExplore = {
    exploreName: string;
    /** One line: what the table has, what the chart wants. */
    reason: string;
};

export type SuggestedChartTypeExploreResult = {
    suggestion: SuggestedChartTypeExplore | null;
};

export type ApiAiSuggestChartTypeExploreResponse = {
    status: 'ok';
    results: SuggestedChartTypeExploreResult;
};
