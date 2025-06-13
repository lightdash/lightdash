import {
    getCustomLabelsFromTableConfig,
    getHiddenTableFields,
    getItemMap,
    isField,
    isTableChartConfig,
    pivotQueryResults,
    type ApiChartAndResults,
    type ApiExploreResults,
    type ItemsMap,
    type SavedChart,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { stringify } from 'csv-stringify/browser/esm';
import { useCallback, type FC } from 'react';
import type { InfiniteQueryResults } from '../../hooks/useQueryResults';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

const pivotResultsAsCsv = (
    chartAndResults: Pick<ApiChartAndResults, 'chart' | 'rows' | 'explore'>,
    columnLimit: number,
): string[][] => {
    const { chart, rows, explore } = chartAndResults;

    if (!isTableChartConfig(chart.chartConfig.config) || !chart.pivotConfig) {
        console.error('Pivot table not supported for CSV download');
        return [[]];
    }
    const itemMap = getItemMap(
        explore,
        chart.metricQuery.additionalMetrics,
        chart.metricQuery.tableCalculations,
    );
    const customLabels = getCustomLabelsFromTableConfig(
        chart.chartConfig.config,
    );
    const hiddenFields = getHiddenTableFields(chart.chartConfig);
    const getFieldLabel = (fieldId: string) => {
        const customLabel = customLabels?.[fieldId];
        if (customLabel !== undefined) return customLabel;
        const field = itemMap[fieldId];
        return (field && isField(field) && field?.label) || fieldId;
    };

    const pivotedResults = pivotQueryResults({
        pivotConfig: {
            pivotDimensions: chart.pivotConfig.columns,
            metricsAsRows: false,
            hiddenMetricFieldIds: hiddenFields,
            columnOrder: chart.tableConfig.columnOrder,
        },
        metricQuery: chart.metricQuery,
        rows: rows,
        options: {
            maxColumns: columnLimit,
        },
        getField: (fieldId: string) => itemMap && itemMap[fieldId],
        getFieldLabel,
    });

    const headers = pivotedResults.headerValues.reduce<string[][]>(
        (acc, row, i) => {
            const values = row.map((header) =>
                'value' in header
                    ? header.value.formatted
                    : getFieldLabel(header.fieldId),
            );
            const fields = pivotedResults.titleFields[i];
            const fieldLabels = fields.map((field) =>
                field ? getFieldLabel(field.fieldId) : '-',
            );

            acc[i] = [...fieldLabels, ...values];

            return acc;
        },
        [[]],
    );

    const fieldIds = Object.values(
        pivotedResults.retrofitData.pivotColumnInfo,
    ).map((field) => field.fieldId);

    const hasIndex = pivotedResults.indexValues.length > 0;
    const pivotedRows: string[][] =
        pivotedResults.retrofitData.allCombinedData.map((row) => {
            // Fields that return `null` don't appear in the pivot table
            // If there are no index fields, we need to add an empty string to the beginning of the row
            const noIndexPrefix = hasIndex ? [] : [''];
            const formattedRows = fieldIds.map((fieldId) => {
                return row[fieldId]?.value?.formatted || '-';
            });
            return [...noIndexPrefix, ...formattedRows];
        });

    return [...headers, ...pivotedRows];
};
export const DashboardMinimalDownloadCsv: FC<{
    explore: ApiExploreResults;
    resultsData: InfiniteQueryResults & { fields?: ItemsMap };
    chart: SavedChart;
}> = ({ explore, resultsData, chart }) => {
    const { track } = useTracking();
    const { health } = useApp();

    const handleDownload = useCallback(async () => {
        if (!resultsData.rows || !resultsData.fields) {
            console.warn('No rows to download');
            return;
        }

        let csvRows: string[][] = [[]];
        if (
            isTableChartConfig(chart.chartConfig.config) &&
            chart.pivotConfig &&
            health.data
        ) {
            csvRows = pivotResultsAsCsv(
                { chart, rows: resultsData.rows, explore },
                health.data.pivotTable.maxColumnLimit,
            );
        } else {
            const fieldIds = Object.keys(resultsData.fields);
            const csvHeader = Object.values(resultsData.fields).map((field) =>
                isField(field) ? field.label : field.name,
            );
            const csvBody = resultsData.rows.map((row) =>
                fieldIds.map(
                    (reference) => row[reference].value.formatted || '-',
                ),
            );

            csvRows = [csvHeader, ...csvBody];
        }

        const csvContent = await new Promise<string>((resolve, reject) => {
            stringify(
                csvRows,
                {
                    delimiter: ',',
                },
                (err, output) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(output);
                    }
                },
            );
        });

        const csvWithBOM = '\uFEFF' + csvContent;
        const blob = new Blob([csvWithBOM], {
            type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute(
            'download',
            `${chart.name}-${new Date().toISOString()}.csv`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [chart, resultsData, explore, health.data]);

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconTableExport} />}
            onClick={async () => {
                track({ name: EventName.EMBED_DOWNLOAD_CSV_CLICKED });
                await handleDownload();
            }}
        >
            Download data
        </Menu.Item>
    );
};
