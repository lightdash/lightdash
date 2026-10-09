import {
    getDocumentRuntimeChartConfig,
    type DocumentChartContent,
    type DocumentExploreChartContent,
    type DocumentQueryReference,
} from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import DocumentChartExploreButton from './DocumentChartExploreButton';
import DocumentChartVisualization from './DocumentChartVisualization';
import DocumentSqlChart from './DocumentSqlChart';
import DocumentSqlChartOpenButton from './DocumentSqlChartOpenButton';
import { useDocumentChartQuery } from './useDocument';

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    documentUuid: string;
    versionUuid: string;
    chartId: string;
    content: DocumentChartContent;
    showTitle?: boolean;
    /** Replaces the Explore button, e.g. with editing controls. */
    actions?: ReactNode;
};

const DocumentExploreChart = ({
    projectUuid,
    spaceUuid,
    renderTarget,
    content,
    showTitle,
    actions,
}: {
    projectUuid: string;
    spaceUuid: string | null;
    renderTarget: DocumentQueryReference;
    content: DocumentExploreChartContent;
    showTitle: boolean;
    actions?: ReactNode;
}) => {
    const { documentUuid, versionUuid, chartId } = renderTarget;
    const { chart } = content;
    const authoringEnabled = useContentAuthoringEnabled();
    const { canViewExplore } = useContextMenuPermissions({ projectUuid });
    const query = useDocumentChartQuery(
        projectUuid,
        documentUuid,
        versionUuid,
        chartId,
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
    const renderTarget = useMemo(
        () => ({ documentUuid, versionUuid, chartId }),
        [documentUuid, versionUuid, chartId],
    );
    if (content.source === 'sql') {
        return (
            <DocumentSqlChart
                projectUuid={projectUuid}
                spaceUuid={spaceUuid}
                reference={renderTarget}
                chart={content.chart}
                showTitle={showTitle}
                actions={
                    actions ?? (
                        <DocumentSqlChartOpenButton
                            projectUuid={projectUuid}
                            chart={content.chart}
                        />
                    )
                }
            />
        );
    }
    return (
        <DocumentExploreChart
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            renderTarget={renderTarget}
            content={content}
            showTitle={showTitle}
            actions={actions}
        />
    );
};

export default DocumentChart;
