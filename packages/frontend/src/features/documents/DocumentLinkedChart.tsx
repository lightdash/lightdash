import {
    QueryExecutionContext,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type DocumentSavedChartKind,
} from '@lightdash/common';
import { ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineIcon from '../../components/common/MantineIcon';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useSavedSqlChartResults } from '../sqlRunner/hooks/useSavedSqlChartResults';
import DocumentChartVisualization from './DocumentChartVisualization';
import DocumentSqlChartView from './DocumentSqlChartView';
import ReportChartFrame from './presentation/ReportChartFrame';
import { toSemanticChartAsCode } from './savedChartContent';

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

/** Marks the chart as linked, opens it, then the editor's own actions. */
const LinkedChartActions = ({
    href,
    actions,
}: {
    href: string | null;
    actions?: ReactNode;
}) => {
    const isEmbedded = useIsEmbedded();
    return (
        <Group gap="xs" wrap="nowrap">
            <Tooltip label="Shows the saved chart live">
                <Badge variant="light">Linked</Badge>
            </Tooltip>
            {href && !isEmbedded && (
                <Tooltip label="Open chart">
                    <ActionIcon
                        component="a"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open linked chart"
                    >
                        <MantineIcon icon={IconExternalLink} />
                    </ActionIcon>
                </Tooltip>
            )}
            {actions}
        </Group>
    );
};

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
    const lightdashApi = useLightdashApi();

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
                actions={<LinkedChartActions href={null} actions={actions} />}
            />
        );
    }
    const asCode = toSemanticChartAsCode(savedChart.data, {
        name: attributes.title,
        description: attributes.description,
    });
    return (
        <DocumentChartVisualization
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={asCode}
            query={query}
            showTitle
            actions={
                <LinkedChartActions
                    href={`/projects/${projectUuid}/saved/${savedChart.data.uuid}`}
                    actions={actions}
                />
            }
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
                actions={<LinkedChartActions href={null} actions={actions} />}
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
            actions={
                <LinkedChartActions
                    href={`/projects/${projectUuid}/sql-runner/${chart.slug}`}
                    actions={actions}
                />
            }
        />
    );
};

export default DocumentLinkedChart;
