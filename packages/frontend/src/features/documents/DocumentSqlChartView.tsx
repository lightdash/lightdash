import {
    isVizBigNumberConfig,
    isVizTableConfig,
    isWarehouseResourceLimitError,
    type AllVizChartConfig,
    type IResultsRunner,
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

const CHART_STYLE = { height: '100%', width: '100%' };

export type SqlChartResults = {
    resultsRunner: IResultsRunner;
    spec: Record<string, unknown>;
};

type Props = {
    name: string;
    description: string | undefined;
    config: AllVizChartConfig;
    /** Results while the query runs: data once ready, an error message on failure. */
    results: {
        data: SqlChartResults | undefined;
        errorMessage: string | undefined;
        retry: () => void;
    };
    /** The Document chart reported to a PDF export; none for a draft. */
    exportChartId?: string;
    showTitle?: boolean;
    actions?: ReactNode;
};

/** A SQL Runner chart in a Document frame, with the frame's loading and error states. */
const DocumentSqlChartView = ({
    name,
    description,
    config,
    results,
    exportChartId,
    showTitle = false,
    actions,
}: Props) => {
    const exportStatus = useDocumentExportStatus();
    const isExporting = exportStatus !== null;
    const isError = results.errorMessage !== undefined;
    const isReady = results.data !== undefined;
    useEffect(() => {
        if (exportChartId === undefined) {
            return;
        }
        if (isError) {
            exportStatus?.markErrored(exportChartId);
        } else if (isReady) {
            exportStatus?.markReady(exportChartId);
        }
    }, [exportStatus, exportChartId, isError, isReady]);

    const frame = (children: ReactNode, fit: 'fixed' | 'content' = 'fixed') => (
        <ReportChartFrame
            ariaLabel={name}
            title={showTitle ? name : undefined}
            description={showTitle ? undefined : description}
            actions={isExporting ? undefined : actions}
            fit={fit}
        >
            {children}
        </ReportChartFrame>
    );

    if (results.errorMessage !== undefined) {
        const isResourceLimitError = isWarehouseResourceLimitError(
            results.errorMessage,
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
                        : results.retry
                }
            />,
        );
    }
    if (!results.data) {
        return frame(
            <Box data-tour-anchor="document-chart-loading">
                <EmptyStateLoader
                    title="Loading live chart data"
                    data-tour-status="true"
                />
            </Box>,
        );
    }
    if (isVizTableConfig(config)) {
        return frame(
            <Table
                resultsRunner={results.data.resultsRunner}
                columnsConfig={config.columns}
            />,
            'content',
        );
    }
    if (isVizBigNumberConfig(config)) {
        return frame(
            <BigNumberView
                spec={results.data.spec}
                isLoading={false}
                error={undefined}
                hasValueField={!!config.fieldConfig?.y?.length}
            />,
        );
    }
    return frame(
        <ChartView
            config={config}
            spec={results.data.spec}
            isLoading={false}
            error={undefined}
            style={CHART_STYLE}
        />,
    );
};

export default DocumentSqlChartView;
