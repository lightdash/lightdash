import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('export');
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

    return (
        <Callout
            variant="warning"
            title={t('largeExportWarning.title')}
            data-testid="large-export-warning"
        >
            {t('largeExportWarning.body', {
                cellMillions,
                count: exportTimeoutMinutes,
            })}
        </Callout>
    );
};

export default LargeExportWarning;
