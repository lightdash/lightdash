import { type FC } from 'react';
import Callout from '../common/Callout';
import {
    getExportCellEstimate,
    getExportTimeoutMinutes,
    isLargeExport,
} from './exportCellEstimate';
import { type Limit } from './types';

type LargeExportWarningProps = {
    limit: Limit;
    customLimit: number;
    totalResults: number;
    columnOrder: string[] | undefined;
    hiddenFields: string[] | undefined;
    csvCellsLimit: number;
    exportTimeoutMs: number | undefined;
};

const LargeExportWarning: FC<LargeExportWarningProps> = ({
    limit,
    customLimit,
    totalResults,
    columnOrder,
    hiddenFields,
    csvCellsLimit,
    exportTimeoutMs,
}) => {
    const cellEstimate = getExportCellEstimate({
        limit,
        customLimit,
        totalResults,
        columnOrder: columnOrder ?? [],
        hiddenFields: hiddenFields ?? [],
        csvCellsLimit,
    });
    if (!isLargeExport(cellEstimate)) return null;

    const exportTimeoutMinutes = getExportTimeoutMinutes(exportTimeoutMs);
    const cellMillions = (cellEstimate / 1_000_000).toLocaleString(undefined, {
        maximumFractionDigits: 1,
    });
    const sizeAndDuration =
        exportTimeoutMinutes === null
            ? `This export is about ${cellMillions} million cells and may take a long time to finish.`
            : `This export is about ${cellMillions} million cells. Exports must finish within ${exportTimeoutMinutes} ${exportTimeoutMinutes === 1 ? 'minute' : 'minutes'}, and one this large may take longer.`;

    return (
        <Callout
            variant="warning"
            title="Large export"
            data-testid="large-export-warning"
        >
            {sizeAndDuration} Filter the results or use a scheduled delivery to
            Google Sheets.
        </Callout>
    );
};

export default LargeExportWarning;
