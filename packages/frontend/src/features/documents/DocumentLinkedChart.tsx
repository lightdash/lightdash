import {
    QueryExecutionContext,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type DocumentSavedChartKind,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { lightdashApi } from '../../api';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { useSavedSqlChartResults } from '../sqlRunner/hooks/useSavedSqlChartResults';
import DocumentChartVisualization from './DocumentChartVisualization';
import DocumentSqlChartView from './DocumentSqlChartView';
import ReportChartFrame from './presentation/ReportChartFrame';

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    kind: DocumentSavedChartKind;
    /** The link's tag attributes: `uuid` (or `slug`), and optional `title` and `description`. */
    attributes: Record<string, string>;
    actions?: ReactNode;
};

/**
 * A saved chart or saved SQL chart the Document links to. It runs as the
 * reader, so the Document grants no access to it.
 */
const DocumentLinkedChart = (props: Props) =>
    props.kind === 'chart' ? (
        <LinkedSavedChart {...props} />
    ) : (
        <LinkedSqlChart {...props} />
    );

const LinkedChartMessage = ({
    title,
    error,
    actions,
}: {
    title: string | undefined;
    error: ApiError | null;
    actions?: ReactNode;
}) => (
    <ReportChartFrame
        title={title ?? 'Linked chart'}
        actions={actions}
        fit="content"
    >
        {error === null ? (
            <EmptyStateLoader title="Loading linked chart" />
        ) : (
            <Text c="dimmed" size="sm" p="md">
                {error.error.statusCode === 403
                    ? "You don't have access to this chart."
                    : 'This chart is no longer available.'}
            </Text>
        )}
    </ReportChartFrame>
);

const LinkedSavedChart = ({
    projectUuid,
    spaceUuid,
    attributes,
    actions,
}: Props) => {
    const savedChart = useSavedQuery({
        uuidOrSlug: attributes.uuid ?? attributes.slug,
        projectUuid,
    });
    const chartUuid = savedChart.data?.uuid;
    const query = useQuery<ApiExecuteAsyncMetricQueryResults, ApiError>({
        queryKey: ['document-linked-chart', projectUuid, chartUuid],
        queryFn: ({ signal }) =>
            lightdashApi<ApiExecuteAsyncMetricQueryResults>({
                url: `/projects/${projectUuid}/query/chart`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify({
                    chartUuid,
                    context: QueryExecutionContext.CHART,
                }),
                signal,
            }),
        enabled: chartUuid !== undefined,
        retry: false,
        refetchOnWindowFocus: false,
    });
    if (!savedChart.data) {
        return (
            <LinkedChartMessage
                title={attributes.title}
                error={savedChart.error}
                actions={actions}
            />
        );
    }
    const chart = savedChart.data;
    // A saved chart's config is the runtime form the visualization reads
    const asCode = {
        name: attributes.title ?? chart.name,
        description: attributes.description ?? chart.description,
        tableName: chart.tableName,
        metricQuery: chart.metricQuery,
        chartConfig: chart.chartConfig,
        tableConfig: chart.tableConfig,
        pivotConfig: chart.pivotConfig,
        parameters: chart.parameters,
    } as SemanticChartAsCode;
    return (
        <DocumentChartVisualization
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={asCode}
            query={query}
            showTitle
            actions={actions}
        />
    );
};

const LinkedSqlChart = ({ projectUuid, attributes, actions }: Props) => {
    const { chartQuery, chartResultsQuery } = useSavedSqlChartResults({
        savedSqlUuid: attributes.uuid,
        slug: attributes.uuid ? undefined : attributes.slug,
        projectUuid,
    });
    if (!chartQuery.data) {
        return (
            <LinkedChartMessage
                title={attributes.title}
                error={chartQuery.error ? (chartQuery.error as ApiError) : null}
                actions={actions}
            />
        );
    }
    const chart = chartQuery.data;
    return (
        <DocumentSqlChartView
            name={attributes.title ?? chart.name}
            description={
                attributes.description ?? chart.description ?? undefined
            }
            config={chart.config}
            results={{
                data: chartResultsQuery.data && {
                    resultsRunner: chartResultsQuery.data.resultsRunner,
                    spec: chartResultsQuery.data.chartSpec,
                },
                errorMessage: chartResultsQuery.error?.error?.message,
                retry: () => void chartResultsQuery.refetch(),
            }}
            showTitle
            actions={actions}
        />
    );
};

export default DocumentLinkedChart;
