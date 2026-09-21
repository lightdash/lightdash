import { ChartType, type DocumentCell } from '@lightdash/common';
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
};

const DocumentChart = ({
    projectUuid,
    spaceUuid,
    documentUuid,
    versionUuid,
    cellIndex,
    cell,
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
    return (
        <DocumentChartVisualization
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={chart}
            query={query}
            actions={
                cell.content.source === 'semantic' &&
                chart.chartConfig.type !== ChartType.DATA_APP_VIZ &&
                authoringEnabled &&
                canViewExplore &&
                query.data &&
                !query.isFetching ? (
                    <DocumentChartExploreButton
                        projectUuid={projectUuid}
                        chart={{
                            ...chart,
                            chartConfig: chart.chartConfig,
                            metricQuery: query.data.metricQuery,
                            parameters: query.data.usedParametersValues,
                            tableConfig: chart.tableConfig ?? {
                                columnOrder: [],
                            },
                        }}
                    />
                ) : null
            }
        />
    );
};

export default DocumentChart;
