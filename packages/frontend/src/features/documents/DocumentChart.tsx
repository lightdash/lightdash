import {
    getDocumentRuntimeChartConfig,
    type DocumentChartContent,
} from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import DocumentChartExploreButton from './DocumentChartExploreButton';
import DocumentChartVisualization from './DocumentChartVisualization';
import { useDocumentChartQuery } from './useDocument';

type Props = {
    projectUuid: string;
    spaceUuid: string;
    documentUuid: string;
    versionUuid: string;
    chartId: string;
    content: DocumentChartContent;
    showTitle?: boolean;
    /** Replaces the Explore button, e.g. with editing controls. */
    actions?: ReactNode;
};

const DocumentChart = ({
    projectUuid,
    spaceUuid,
    documentUuid,
    versionUuid,
    chartId,
    content,
    showTitle = false,
    actions,
}: Props) => {
    const { chart } = content;
    const authoringEnabled = useContentAuthoringEnabled();
    const { canViewExplore } = useContextMenuPermissions({ projectUuid });
    const query = useDocumentChartQuery(
        projectUuid,
        documentUuid,
        versionUuid,
        chartId,
    );
    const renderTarget = useMemo(
        () => ({ documentUuid, versionUuid, chartId }),
        [documentUuid, versionUuid, chartId],
    );
    return (
        <DocumentChartVisualization
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={chart}
            showTitle={showTitle}
            query={query}
            renderTarget={renderTarget}
            actions={
                actions ??
                (content.source === 'semantic' &&
                authoringEnabled &&
                canViewExplore &&
                query.data &&
                !query.isFetching ? (
                    <DocumentChartExploreButton
                        projectUuid={projectUuid}
                        documentUuid={documentUuid}
                        chart={{
                            ...chart,
                            chartConfig: getDocumentRuntimeChartConfig(
                                chart.chartConfig,
                            ),
                            metricQuery: query.data.metricQuery,
                            parameters: query.data.usedParametersValues,
                            tableConfig: chart.tableConfig ?? {
                                columnOrder: [],
                            },
                        }}
                    />
                ) : null)
            }
        />
    );
};

export default DocumentChart;
