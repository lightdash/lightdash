/* eslint-disable react-refresh/only-export-components */

import { Code } from '@mantine-8/core';
import { type ReactNode } from 'react';
import { getFieldDisplayName, getFilterDescriptions } from './utils';

interface ToolCallArgs {
    [key: string]: any;
}

interface ToolCall {
    toolName: string;
    args?: ToolCallArgs;
}

const FindFieldsDescription = ({ args }: { args: ToolCallArgs }) => {
    const fieldNames =
        args.embeddingSearchQueries?.map((query: any) => query.name) || [];

    return (
        <>
            Finding fields:{' '}
            {fieldNames.map((name: string, index: number) => (
                <span key={name}>
                    <Code size="xs">{name}</Code>
                    {index < fieldNames.length - 1 && ', '}
                </span>
            ))}
        </>
    );
};

const GenerateQueryFiltersDescription = ({ args }: { args: ToolCallArgs }) => {
    const filterDescriptions = getFilterDescriptions(args.filters);

    if (filterDescriptions.length === 0) return null;

    return (
        <>
            Applying filters:{' '}
            {filterDescriptions.map((desc, index) => (
                <span key={desc}>
                    <Code size="xs">{desc}</Code>
                    {index < filterDescriptions.length - 1 && ', '}
                </span>
            ))}
        </>
    );
};

const GenerateBarVizConfigDescription = ({ args }: { args: ToolCallArgs }) => {
    const config = args.vizConfig;
    const xDim = config.xDimension
        ? getFieldDisplayName(config.xDimension)
        : '';
    const yMetrics =
        config.yMetrics?.map((metric: string) => getFieldDisplayName(metric)) ||
        [];

    return (
        <>
            Creating bar chart: <Code size="xs">{yMetrics.join(', ')}</Code> by{' '}
            <Code size="xs">{xDim}</Code>
        </>
    );
};

const GenerateTimeSeriesVizConfigDescription = ({
    args,
}: {
    args: ToolCallArgs;
}) => {
    const config = args.vizConfig;
    const xDim = config.xDimension
        ? getFieldDisplayName(config.xDimension)
        : '';
    const yMetrics =
        config.yMetrics?.map((metric: string) => getFieldDisplayName(metric)) ||
        [];

    return (
        <>
            Creating time series: <Code size="xs">{yMetrics.join(', ')}</Code>{' '}
            over <Code size="xs">{xDim}</Code>
        </>
    );
};

const TOOL_DISPLAY_MESSAGES = {
    findFields: 'Finding relevant fields',
    generateBarVizConfig: 'Generating a bar chart',
    generateCsv: 'Generating CSV file',
    generateQueryFilters: 'Applying filters to the query',
    generateTimeSeriesVizConfig: 'Generating a line chart',
} as const;

export const getToolCallDescription = (toolCall: ToolCall): ReactNode => {
    const defaultDescription =
        TOOL_DISPLAY_MESSAGES[
            toolCall.toolName as keyof typeof TOOL_DISPLAY_MESSAGES
        ];

    switch (toolCall.toolName) {
        case 'findFields':
            return toolCall.args?.embeddingSearchQueries ? (
                <FindFieldsDescription args={toolCall.args} />
            ) : (
                defaultDescription
            );

        case 'generateQueryFilters':
            return toolCall.args?.filters ? (
                <GenerateQueryFiltersDescription args={toolCall.args} />
            ) : (
                defaultDescription
            );

        case 'generateBarVizConfig':
            return toolCall.args?.vizConfig ? (
                <GenerateBarVizConfigDescription args={toolCall.args} />
            ) : (
                defaultDescription
            );

        case 'generateTimeSeriesVizConfig':
            return toolCall.args?.vizConfig ? (
                <GenerateTimeSeriesVizConfigDescription args={toolCall.args} />
            ) : (
                defaultDescription
            );

        case 'generateCsv':
            return 'Exporting data to CSV file';

        default:
            return defaultDescription || null;
    }
};
