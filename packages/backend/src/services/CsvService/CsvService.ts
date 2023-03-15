import {
    ApiQueryResults,
    ApiSqlQueryResults,
    DimensionType,
    Field,
    formatItemValue,
    formatRows,
    friendlyName,
    getCustomLabelsFromTableConfig,
    getItemLabel,
    getItemLabelWithoutTableName,
    getItemMap,
    isDashboardChartTileType,
    isField,
    isTableChartConfig,
    MetricQuery,
    SchedulerCsvOptions,
    SessionUser,
    TableCalculation,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';

import moment from 'moment';
import { nanoid } from 'nanoid';
import { Worker } from 'worker_threads';
import { S3Service } from '../../clients/Aws/s3';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import Logger from '../../logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { runWorkerThread } from '../../utils';
import { ProjectService } from '../ProjectService/ProjectService';

type CsvServiceDependencies = {
    projectService: ProjectService;
    s3Service: S3Service;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
};

export const convertSqlToCsv = (
    results: ApiSqlQueryResults,
    customLabels: Record<string, string> = {},
): Promise<string> => {
    const csvHeader = Object.keys(results.rows[0]).map(
        (id) => customLabels[id] || friendlyName(id),
    );
    const csvBody = results?.rows.map((row) =>
        Object.values(results?.fields).map((field, fieldIndex) => {
            if (field.type === DimensionType.TIMESTAMP) {
                return moment(Object.values(row)[fieldIndex]).format(
                    'YYYY-MM-DD HH:mm:ss',
                );
            }
            if (field.type === DimensionType.DATE) {
                return moment(Object.values(row)[fieldIndex]).format(
                    'YYYY-MM-DD',
                );
            }
            return Object.values(row)[fieldIndex];
        }),
    );
    return new Promise((resolve, reject) => {
        stringify(
            [csvHeader, ...csvBody],
            {
                delimiter: ',',
            },
            (err, output) => {
                if (err) {
                    reject(new Error(err.message));
                }
                resolve(output);
            },
        );
    });
};

export const convertApiToCsv = (
    fieldIds: string[],
    rows: { [col: string]: any }[],
    onlyRaw: boolean,
    itemMap: Record<string, Field | TableCalculation>,
    showTableNames: boolean,
    columnOrder: string[],
    customLabels: Record<string, string> = {},
): Promise<string> => {
    // Ignore fields from results that are not selected in metrics or dimensions

    const sortedFieldIds = Object.keys(rows[0])
        .filter((id) => fieldIds.includes(id))
        .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b));

    const csvHeader = sortedFieldIds.map((id) => {
        if (customLabels[id]) {
            return customLabels[id];
        }
        if (itemMap[id]) {
            return showTableNames
                ? getItemLabel(itemMap[id])
                : getItemLabelWithoutTableName(itemMap[id]);
        }
        return id;
    });
    const csvBody = rows.map((row) =>
        sortedFieldIds.map((id) => {
            const rowData = row[id];
            const item = itemMap[id];
            const itemIsField = isField(item);

            if (itemIsField && item.type === DimensionType.TIMESTAMP) {
                return moment(rowData.value.raw).format('YYYY-MM-DD HH:mm:ss');
            }
            if (itemIsField && item.type === DimensionType.DATE) {
                return moment(rowData.value.raw).format('YYYY-MM-DD');
            }

            if (onlyRaw) {
                return rowData.value.raw;
            }

            return rowData.value.formatted;
        }),
    );

    return new Promise((resolve, reject) => {
        stringify(
            [csvHeader, ...csvBody],
            {
                delimiter: ',',
            },
            (err, output) => {
                if (err) {
                    reject(new Error(err.message));
                }
                resolve(output);
            },
        );
    });
};

const getSchedulerCsvLimit = (
    options: SchedulerCsvOptions | undefined,
): number | null | undefined => {
    switch (options?.limit) {
        case 'table':
        case undefined:
            return undefined;
        case 'all':
            return null;
        default:
            // Custom
            return options?.limit;
    }
};

export class CsvService {
    projectService: ProjectService;

    s3Service: S3Service;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    constructor({
        projectService,
        s3Service,
        savedChartModel,
        dashboardModel,
    }: CsvServiceDependencies) {
        this.projectService = projectService;
        this.s3Service = s3Service;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
    }

    static async convertRowsToCsv(
        rows: Record<string, any>[],
        onlyRaw: boolean,
        metricQuery: MetricQuery,
        itemMap: Record<string, Field | TableCalculation>,
        showTableNames: boolean,
        customLabels: Record<string, string> = {},
        columnOrder: string[] = [],
    ): Promise<string> {
        // Ignore fields from results that are not selected in metrics or dimensions
        const selectedFieldIds = [
            ...metricQuery.metrics,
            ...metricQuery.dimensions,
            ...metricQuery.tableCalculations.map((tc: any) => tc.name),
        ];
        Logger.debug(
            `convertRowsToCsv with ${rows.length} rows and ${selectedFieldIds.length} columns`,
        );

        const fileId = `csv-${nanoid()}.csv`;
        Logger.debug('file id', fileId);
        const writeStream = fsSync.createWriteStream(`/tmp/${fileId}`);

        // const formattedRows = formatRows(rows, itemMap);

        const sortedFieldIds = Object.keys(rows[0])
            .filter((id) => selectedFieldIds.includes(id))
            .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b));

        const csvHeader = sortedFieldIds.map((id) => {
            if (customLabels[id]) {
                return customLabels[id];
            }
            if (itemMap[id]) {
                return showTableNames
                    ? getItemLabel(itemMap[id])
                    : getItemLabelWithoutTableName(itemMap[id]);
            }
            return id;
        });

        /*
        const csvBody = formattedRows.map((row) =>
            sortedFieldIds.map((id) => {
                const rowData = row[id];
                const item = itemMap[id];
                const itemIsField = isField(item);

                if (itemIsField && item.type === DimensionType.TIMESTAMP) {
                    return moment(rowData.value.raw).format('YYYY-MM-DD HH:mm:ss');
                }
                if (itemIsField && item.type === DimensionType.DATE) {
                    return moment(rowData.value.raw).format('YYYY-MM-DD');
                }

                if (onlyRaw) {
                    return rowData.value.raw;
                }

                return rowData.value.formatted;
            }),
        ); */
        const stringifier = stringify({
            delimiter: ',',
        });
        stringifier.on('readable', () => {
            let row;
            do {
                row = stringifier.read();
                if (row) writeStream.write(row);
            } while (row);
        });

        return new Promise((resolve, reject) => {
            stringifier.on('error', (err) => {
                reject(new Error(err.message));
            });
            stringifier.on('finish', () => {
                writeStream.close();
                resolve(fileId);
            });

            stringifier.write(csvHeader);

            rows.forEach(async (row, index) => {
                const formattedRow = sortedFieldIds.map((id) => {
                    const data = row[id];
                    const item = itemMap[id];

                    const itemIsField = isField(item);
                    if (itemIsField && item.type === DimensionType.TIMESTAMP) {
                        return moment(data).format('YYYY-MM-DD HH:mm:ss');
                    }
                    if (itemIsField && item.type === DimensionType.DATE) {
                        return moment(data).format('YYYY-MM-DD');
                    }
                    if (onlyRaw) return data;
                    return formatItemValue(item, data);
                });

                /*  if (index % 1000 === 0)
                        await new Promise(r => setTimeout(r, 100))
*/
                stringifier.write(formattedRow);
                /* Object.keys(row).reduce((acc, columnName) => {
                        const col = row[columnName];
            
                        const item = itemMap[columnName];
                        return {
                            ...acc,
                            [columnName]: {
                                value: {
                                    raw: col,
                                    formatted: formatItemValue(item, col),
                                },
                            },
                        };
                    }, {}), */

                // formatRows(rows, itemMap);
            });

            //  stringifier.write(rows);

            stringifier.end();
        });

        /*
        const csvContentPromise: Promise<string> = new Promise((resolve, reject) => {
            stringify(
                [csvHeader, ...csvBody],
                {
                    delimiter: ',',
                },
                (err, output) => {
                    if (err) {
                        reject(new Error(err.message));
                    }
                    resolve(output);
                },
            ).pipe(writeStream);
        });

        const csvContent = await csvContentPromise; */

        // Can't store file in S3, storing locally
        //  await fs.writeFile(`/tmp/${fileId}`, csvContent, 'utf-8');

        // return fileId

        /*
        return convertApiToCsv(
            selectedFieldIds,
            formattedRows,
            onlyRaw,
            itemMap,
            showTableNames,
            columnOrder,
            customLabels,
        ); */
    }

    static async convertApiResultsToCsv(
        results: ApiQueryResults,
        onlyRaw: boolean,
        metricQuery: MetricQuery,
        itemMap: Record<string, Field | TableCalculation>,
        showTableNames: boolean,
        customLabels: Record<string, string> | undefined,
        columnOrder: string[],
    ): Promise<string> {
        // Ignore fields from results that are not selected in metrics or dimensions
        const selectedFieldIds = [
            ...metricQuery.metrics,
            ...metricQuery.dimensions,
            ...metricQuery.tableCalculations.map((tc: any) => tc.name),
        ];

        if (results.rows.length > 500) {
            Logger.debug(
                `Using worker to format csv with ${results.rows.length} lines`,
            );
            return runWorkerThread<string>(
                new Worker('./dist/services/CsvService/convertApiToCsv.js', {
                    workerData: {
                        fieldIds: selectedFieldIds,
                        rows: results.rows,
                        onlyRaw,
                        itemMap,
                        showTableNames,
                        columnOrder,
                        customLabels,
                    },
                }),
            );
        }
        return convertApiToCsv(
            selectedFieldIds,
            results.rows,
            onlyRaw,
            itemMap,
            showTableNames,
            columnOrder,
            customLabels,
        );
    }

    static async convertSqlQueryResultsToCsv(
        results: ApiSqlQueryResults,
        customLabels: Record<string, string> | undefined,
    ): Promise<string> {
        if (results.rows.length > 500) {
            Logger.debug(
                `Using worker to format csv with ${results.rows.length} lines`,
            );
            return runWorkerThread<string>(
                new Worker('./dist/services/CsvService/convertSqlToCsv.js', {
                    workerData: {
                        results,
                        customLabels,
                    },
                }),
            );
        }
        return convertSqlToCsv(results, customLabels);
    }

    async getCsvForChart(
        user: SessionUser,
        chartUuid: string,
        options: SchedulerCsvOptions | undefined,
    ): Promise<AttachmentUrl> {
        const chart = await this.savedChartModel.get(chartUuid);
        const {
            metricQuery,
            chartConfig: { config },
        } = chart;
        const exploreId = chart.tableName;
        const onlyRaw = options?.formatted === false;

        const results: ApiQueryResults =
            await this.projectService.runQueryAndFormatRows(
                user,
                metricQuery,
                chart.projectUuid,
                exploreId,
                getSchedulerCsvLimit(options),
            );

        const explore = await this.projectService.getExplore(
            user,
            chart.projectUuid,
            exploreId,
        );
        const itemMap = getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
        );

        const csvContent = await CsvService.convertApiResultsToCsv(
            results,
            onlyRaw,
            metricQuery,
            itemMap,
            isTableChartConfig(config) ? config.showTableNames ?? false : true,
            getCustomLabelsFromTableConfig(config),
            chart.tableConfig.columnOrder,
        );

        const fileId = `csv-${nanoid()}.csv`;

        try {
            const s3Url = await this.s3Service.uploadCsv(csvContent, fileId);
            return { filename: `${chart.name}`, path: s3Url };
        } catch (e) {
            // Can't store file in S3, storing locally
            await fs.writeFile(`/tmp/${fileId}`, csvContent, 'utf-8');
            const localUrl = `${lightdashConfig.siteUrl}/api/v1/projects/${chart.projectUuid}/csv/${fileId}`;
            return { filename: `${chart.name}`, path: localUrl };
        }
    }

    async getCsvsForDashboard(
        user: SessionUser,
        dashboardUuid: string,
        options: SchedulerCsvOptions | undefined,
    ) {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const chartUuids = dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid
            ) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);

        const csvUrls = await Promise.all(
            chartUuids.map((chartUuid) =>
                this.getCsvForChart(user, chartUuid, options),
            ),
        );
        return csvUrls;
    }
}
