import {
    type ApiScheduledDownloadCsv,
    type PivotConfig,
} from '@lightdash/common';
import { memo, type FC } from 'react';
import { ExportToGoogleSheet } from '../../features/export';
import useHealth from '../../hooks/health/useHealth';
import ExportResults, { type ExportResultsProps } from '../ExportResults';

/**
 * The export form for a results table, with Google Sheets beside Download when
 * the instance has Drive configured. Both ways out are on the one screen: an
 * earlier version put the form behind a "Download data" button, which left
 * anyone without the Google Sheets permission clicking through a chooser of
 * one.
 */
const ExportSelector: FC<
    ExportResultsProps & {
        getGsheetLink?: () => Promise<ApiScheduledDownloadCsv>;
        pivotConfig?: PivotConfig;
    }
> = memo(
    ({
        projectUuid,
        totalResults,
        getDownloadQueryUuid,
        getGsheetLink,
        columnOrder,
        customLabels,
        hiddenFields,
        showTableNames,
        chartName,
        pivotConfig,
        conditionalFormattings,
        showColumnTotals,
    }) => {
        const health = useHealth();
        const hasGoogleDrive =
            health.data?.auth.google.oauth2ClientId !== undefined &&
            health.data?.auth.google.googleDriveApiKey !== undefined;

        return (
            <ExportResults
                totalResults={totalResults}
                getDownloadQueryUuid={getDownloadQueryUuid}
                projectUuid={projectUuid}
                columnOrder={columnOrder}
                customLabels={customLabels}
                hiddenFields={hiddenFields}
                showTableNames={showTableNames}
                chartName={chartName}
                pivotConfig={pivotConfig}
                conditionalFormattings={conditionalFormattings}
                showColumnTotals={showColumnTotals}
                secondaryAction={
                    hasGoogleDrive && getGsheetLink ? (
                        <ExportToGoogleSheet getGsheetLink={getGsheetLink} />
                    ) : undefined
                }
            />
        );
    },
);

export default ExportSelector;
