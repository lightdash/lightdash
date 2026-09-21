import {
    type CustomSqlDimension,
    type Field,
    type TableCalculation,
} from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';
import { type DataAppVizField, type DataAppVizFieldType } from '../apps/types';

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

/** One chart input and the field the suggestion binds it to, if any. */
export type ChartTypeDataInputSuggestion = {
    name: string;
    label: string;
    type: DataAppVizFieldType;
    required: boolean;
    /** Null when no field in the explore could be bound to this input. */
    fieldId: string | null;
    fieldLabel: string | null;
    fieldType: 'dimension' | 'metric' | null;
    reason: string;
};

export type ChartTypeDataAlternative = {
    exploreName: string;
    exploreLabel: string;
    summary: string;
};

export type SuggestChartTypeDataRequest = {
    prompt: string;
    /** Null on the first prompt: the inputs are inferred from the prompt. */
    inputs: DataAppVizField[] | null;
    hint: string | null;
    /** Constrains the suggestion to one explore instead of searching. */
    exploreName: string | null;
};

export type SuggestedChartTypeData =
    | {
          kind: 'suggested';
          exploreName: string;
          exploreLabel: string;
          shapeSummary: string;
          inputs: ChartTypeDataInputSuggestion[];
          alternatives: ChartTypeDataAlternative[];
          /** Whether every required input was bound to a field. */
          fits: boolean;
      }
    | {
          kind: 'no_data';
          reason: string;
      };

export type ApiSuggestChartTypeDataResponse = {
    status: 'ok';
    results: SuggestedChartTypeData;
};
