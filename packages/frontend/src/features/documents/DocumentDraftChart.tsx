import { type SemanticChartAsCode } from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
    spaceUuid: string | null;
    chart: SemanticChartAsCode;
    actions?: ReactNode;
};

const DocumentDraftChart = ({
    projectUuid,
    spaceUuid,
    chart,
    actions,
}: Props) => {
    const { t } = useTranslation('documents');
    const { canViewExplore } = useContextMenuPermissions({ projectUuid });
    const version = useMemo(() => getDocumentChartVersion(chart), [chart]);
    const explore = useExploreByProjectUuid(chart.tableName, projectUuid, {
        enabled: canViewExplore,
    });
    const queryArgs = useMemo(() => {
        if (!canViewExplore) {
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
                title={chart.name}
                ariaLabel={chart.name}
                actions={actions}
            >
                <InlineErrorState
                    message={
                        !canViewExplore
                            ? t('chart.draftNoExploreAccess')
                            : t('chart.draftExploreLoadFailed')
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
            showTitle
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={chart}
            actions={actions}
            query={{
                ...query,
                data: query.isPreviousData ? undefined : query.data,
            }}
        />
    );
};

export default DocumentDraftChart;
