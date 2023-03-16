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
import * as fs from 'fs';

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
        const writeStream = fs.createWriteStream(`/tmp/${fileId}`);

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

        const writePromise = new Promise<string>((resolve, reject) => {
            stringifier.on('error', (err) => {
                reject(new Error(err.message));
            });
            stringifier.on('finish', () => {
                writeStream.close();
                resolve(fileId);
            });
        });

        stringifier.write(csvHeader);

        // Increasing CHUNK_SIZE increases memory usage, but increases speed of CSV generation
        const CHUNK_SIZE = 50000;
        while (rows.length > 0) {
            const chunk = rows.splice(0, CHUNK_SIZE);
            // eslint-disable-next-line no-await-in-loop
            const formattedRows = await runWorkerThread<string[]>(
                new Worker('./dist/services/CsvService/convertRowsToCsv.js', {
                    workerData: {
                        sortedFieldIds,
                        rows: chunk,
                        onlyRaw,
                        itemMap,
                    },
                }),
            );
            formattedRows.forEach((row) => {
                stringifier.write(row);
            });
        }
        stringifier.end();

        return writePromise;
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

        const rows = await this.projectService.runQuery(
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

        const fileId = await CsvService.convertRowsToCsv(
            rows,
            onlyRaw,
            metricQuery,
            itemMap,
            isTableChartConfig(config) ? config.showTableNames ?? false : true,
            getCustomLabelsFromTableConfig(config),
            chart.tableConfig.columnOrder,
        );

        try {
            const csvContent = fs.createReadStream(`/tmp/${fileId}`);
            const s3Url = await this.s3Service.uploadCsv(csvContent, fileId);
            return { filename: `${chart.name}`, path: s3Url };
        } catch (e) {
            // Can't store file in S3, storing locally
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
