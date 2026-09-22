import { ChartType, type SemanticChartAsCode } from '@lightdash/common';
import { useMemo } from 'react';
import InlineErrorState from '../../components/common/InlineErrorState';
import { buildQueryArgs } from '../../hooks/explorer/buildQueryArgs';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import { useGetReadyQueryResults } from '../../hooks/useQueryResults';
import { getDocumentChartVersion } from './documentChartEditor';
import DocumentChartVisualization from './DocumentChartVisualization';
import ReportChartFrame from './presentation/ReportChartFrame';

type Props = {
    projectUuid: string;
    spaceUuid: string;
    chart: SemanticChartAsCode;
};

const DocumentDraftChart = ({ projectUuid, spaceUuid, chart }: Props) => {
    const { canViewExplore } = useContextMenuPermissions({ projectUuid });
    const version = useMemo(
        () =>
            chart.chartConfig.type === ChartType.DATA_APP_VIZ
                ? null
                : getDocumentChartVersion(chart),
        [chart],
    );
    const explore = useExploreByProjectUuid(chart.tableName, projectUuid, {
        enabled: canViewExplore && version !== null,
    });
    const queryArgs = useMemo(() => {
        if (!version || !canViewExplore) {
            return null;
        }
        return buildQueryArgs({
            activeFields: new Set([
                ...version.metricQuery.dimensions,
                ...version.metricQuery.metrics,
                ...version.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                ),
            ]),
            tableName: version.tableName,
            projectUuid,
            explore: explore.data,
            computedMetricQuery: version.metricQuery,
            parameters: version.parameters,
            isEditMode: true,
            minimal: true,
            savedChart: version,
        });
    }, [version, canViewExplore, projectUuid, explore.data]);
    const query = useGetReadyQueryResults(queryArgs, []);

    if (!canViewExplore || explore.error) {
        return (
            <ReportChartFrame
                ariaLabel={chart.name}
                description={chart.description}
            >
                <InlineErrorState
                    message={
                        !canViewExplore
                            ? 'You need Explore access to preview this unsaved chart.'
                            : 'The explore for this chart could not be loaded.'
                    }
                    onRetry={
                        canViewExplore
                            ? () => {
                                  void explore.refetch();
                              }
                            : undefined
                    }
                />
            </ReportChartFrame>
        );
    }

    return (
        <DocumentChartVisualization
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={chart}
            query={{
                ...query,
                data: query.isPreviousData ? undefined : query.data,
            }}
        />
    );
};

export default DocumentDraftChart;
