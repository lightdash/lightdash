import {
    type ToolRunQueryBuiltinChartConfig,
    type ToolRunQueryChartConfig,
} from '../../schemas';

export type AiAgentChartTypeOption =
    | 'table'
    | 'bar'
    | 'horizontal'
    | 'line'
    | 'scatter'
    | 'pie'
    | 'funnel';

export type AiVizMetadata = {
    title?: string;
    description?: string;
};

/** What the runQuery chart builders read off a query: its fields and chart config. */
export type RunQueryChartInput = {
    title: string;
    description: string;
    queryConfig: { dimensions: string[]; metrics: string[] };
    chartConfig: ToolRunQueryChartConfig | null;
};

export type RunQueryBuiltinChartInput = Omit<
    RunQueryChartInput,
    'chartConfig'
> & { chartConfig: ToolRunQueryBuiltinChartConfig | null };
