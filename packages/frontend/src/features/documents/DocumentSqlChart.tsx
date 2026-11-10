import {
    isApiError,
    type ApiError,
    type DocumentQueryReference,
    type DocumentSqlChart as DocumentSqlChartDefinition,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import DocumentSqlChartView from './DocumentSqlChartView';
import { useDocumentSqlChartResults } from './useDocumentSqlChartResults';

const getErrorMessage = (error: ApiError | Error | null) => {
    if (!error) return undefined;
    return isApiError(error) ? error.error.message : error.message;
};

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    reference: DocumentQueryReference;
    chart: DocumentSqlChartDefinition;
    showTitle?: boolean;
    actions?: ReactNode;
};

/** A SQL chart the Document owns. */
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
    return (
        <DocumentSqlChartView
            name={chart.name}
            description={chart.description}
            config={chart.config}
            results={{
                data: query.data,
                errorMessage: getErrorMessage(query.error),
                retry: () => void query.refetch(),
            }}
            exportChartId={reference.chartId}
            showTitle={showTitle}
            actions={actions}
        />
    );
};

export default DocumentSqlChart;
