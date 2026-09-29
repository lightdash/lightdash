import {
    getDocumentRuntimeChartConfig,
    type DocumentCell,
} from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import DocumentChartExploreButton from './DocumentChartExploreButton';
import DocumentChartVisualization from './DocumentChartVisualization';
import { useDocumentCellQuery } from './useDocument';

type Props = {
    projectUuid: string;
    spaceUuid: string;
    documentUuid: string;
    versionUuid: string;
    cellIndex: number;
    cell: Extract<DocumentCell, { type: 'chart' }>;
    showTitle?: boolean;
    /** Replaces the Explore button, e.g. with editing controls. */
    actions?: ReactNode;
};

const DocumentChart = ({
    projectUuid,
    spaceUuid,
    documentUuid,
    versionUuid,
    cellIndex,
    cell,
    showTitle = false,
    actions,
}: Props) => {
    const { chart } = cell.content;
    const authoringEnabled = useContentAuthoringEnabled();
    const { canViewExplore } = useContextMenuPermissions({ projectUuid });
    const query = useDocumentCellQuery(
        projectUuid,
        documentUuid,
        versionUuid,
        cellIndex,
    );
    const renderTarget = useMemo(
        () => ({ documentUuid, versionUuid, cellIndex }),
        [documentUuid, versionUuid, cellIndex],
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
                (cell.content.source === 'semantic' &&
                authoringEnabled &&
                canViewExplore &&
                query.data &&
                !query.isFetching ? (
                    <DocumentChartExploreButton
                        projectUuid={projectUuid}
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
