import {
    isVizBigNumberConfig,
    isVizTableConfig,
    isWarehouseResourceLimitError,
    type DocumentQueryReference,
    type DocumentSqlChart as DocumentSqlChartDefinition,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { useEffect, type ReactNode } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import BigNumberView from '../../components/DataViz/visualizations/BigNumberView';
import ChartView from '../../components/DataViz/visualizations/ChartView';
import { Table } from '../../components/DataViz/visualizations/Table';
import { useDocumentExportStatus } from './documentExportStatus';
import ReportChartFrame from './presentation/ReportChartFrame';
import { useDocumentSqlChartResults } from './useDocumentSqlChartResults';

const CHART_STYLE = { height: '100%', width: '100%' };

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    reference: DocumentQueryReference;
    chart: DocumentSqlChartDefinition;
    showTitle?: boolean;
    actions?: ReactNode;
};

const DocumentSqlChart = ({
    projectUuid,
    spaceUuid,
    reference,
    chart,
    showTitle = false,
    actions,
}: Props) => {
    const query = useDocumentSqlChartResults({
        projectUuid,
        spaceUuid,
        reference,
        chart,
    });
    const exportStatus = useDocumentExportStatus();
    const isExporting = exportStatus !== null;
    const { chartId } = reference;
    useEffect(() => {
        if (query.isError) {
            exportStatus?.markErrored(chartId);
        } else if (query.isSuccess) {
            exportStatus?.markReady(chartId);
        }
    }, [exportStatus, chartId, query.isError, query.isSuccess]);

    const frame = (children: ReactNode, fit: 'fixed' | 'content' = 'fixed') => (
        <ReportChartFrame
            ariaLabel={chart.name}
            title={showTitle ? chart.name : undefined}
            description={showTitle ? undefined : chart.description}
            actions={isExporting ? undefined : actions}
            fit={fit}
        >
            {children}
        </ReportChartFrame>
    );

    if (query.isError) {
        const isResourceLimitError = isWarehouseResourceLimitError(
            query.error.error.message,
        );
        return frame(
            <InlineErrorState
                message={
                    isResourceLimitError
                        ? 'This chart exceeds the warehouse query limit.'
                        : 'The live data for this chart could not be loaded.'
                }
                onRetry={
                    isResourceLimitError || isExporting
                        ? undefined
                        : () => void query.refetch()
                }
            />,
        );
    }
    if (!query.data) {
        return frame(
            <Box data-tour-anchor="document-chart-loading">
                <EmptyStateLoader
                    title="Loading live chart data"
                    data-tour-status="true"
                />
            </Box>,
        );
    }
    const { config } = chart;
    if (isVizTableConfig(config)) {
        return frame(
            <Table
                resultsRunner={query.data.resultsRunner}
                columnsConfig={config.columns}
            />,
            'content',
        );
    }
    if (isVizBigNumberConfig(config)) {
        return frame(
            <BigNumberView
                spec={query.data.spec}
                isLoading={false}
                error={undefined}
                hasValueField={!!config.fieldConfig?.y?.length}
            />,
        );
    }
    return frame(
        <ChartView
            config={config}
            spec={query.data.spec}
            isLoading={false}
            error={undefined}
            style={CHART_STYLE}
        />,
    );
};

export default DocumentSqlChart;
