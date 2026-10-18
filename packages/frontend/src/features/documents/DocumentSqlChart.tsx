import {
    convertSqlChartToPipelineChart,
    type DocumentQueryReference,
    type DocumentSqlChart as DocumentSqlChartDefinition,
} from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import DocumentChartVisualization, {
    type DocumentVisualizedChart,
} from './DocumentChartVisualization';
import { useDocumentChartQuery } from './useDocument';

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    reference: DocumentQueryReference;
    chart: DocumentSqlChartDefinition;
    showTitle?: boolean;
    actions?: ReactNode;
};

/**
 * A SQL chart the Document owns, drawn like every other chart: the server
 * runs it as the pipeline chart it converts to, and the stored SQL runner
 * config becomes the explorer config over that run's fields.
 */
const DocumentSqlChart = ({
    projectUuid,
    spaceUuid,
    reference,
    chart,
    showTitle = false,
    actions,
}: Props) => {
    const query = useDocumentChartQuery(
        projectUuid,
        reference.documentUuid,
        reference.versionUuid,
        reference.chartId,
    );
    const visualizedChart = useMemo((): DocumentVisualizedChart => {
        const converted = convertSqlChartToPipelineChart({
            sql: chart.sql,
            limit: chart.limit,
            config: chart.config,
            warehouseConnectionUuid: chart.warehouseConnectionUuid ?? null,
        });
        return {
            name: chart.name,
            description: chart.description,
            tableName: converted.tableName,
            chartConfig: converted.chartConfig,
            pivotConfig: converted.pivotConfig,
            tableConfig: converted.tableConfig,
        };
    }, [chart]);
    return (
        <DocumentChartVisualization
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            chart={visualizedChart}
            query={query}
            showTitle={showTitle}
            renderTarget={reference}
            actions={actions}
        />
    );
};

export default DocumentSqlChart;
