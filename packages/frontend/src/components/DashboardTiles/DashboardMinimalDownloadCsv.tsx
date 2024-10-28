import { isField, type ApiChartAndResults } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { stringify } from 'csv-stringify/browser/esm';
import { useCallback, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

export const DashboardMinimalDownloadCsv: FC<{
    chartAndResults: ApiChartAndResults;
}> = ({ chartAndResults: { chart, fields, rows } }) => {
    const handleDownload = useCallback(async () => {
        if (!rows || !fields) {
            console.warn('No rows to download');
            return;
        }

        const fieldIds = Object.keys(fields);
        const csvHeader = Object.values(fields).map((field) =>
            isField(field) ? field.label : field.name,
        );
        const csvBody = rows.map((row) =>
            fieldIds.map((reference) => row[reference].value.formatted || '-'),
        );
        const csvContent: string = await new Promise<string>(
            (resolve, reject) => {
                stringify(
                    [csvHeader, ...csvBody],
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
            },
        );

        const blob = new Blob([csvContent], {
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
    }, [chart, fields, rows]);

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconTableExport} />}
            onClick={async () => {
                await handleDownload();
            }}
        >
            Export CSV
        </Menu.Item>
    );
};
