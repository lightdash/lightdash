import {
    type DocumentQueryReference,
    type DocumentSqlChart as DocumentSqlChartDefinition,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import DocumentSqlChartView from './DocumentSqlChartView';
import { useDocumentSqlChartResults } from './useDocumentSqlChartResults';

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
                errorMessage: query.error?.error.message,
                retry: () => void query.refetch(),
            }}
            exportChartId={reference.chartId}
            showTitle={showTitle}
            actions={actions}
        />
    );
};

export default DocumentSqlChart;
