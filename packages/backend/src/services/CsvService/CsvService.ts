import { subject } from '@casl/ability';
import {
    ApiSqlQueryResults,
    DimensionType,
    DownloadCsvPayload,
    DownloadMetricCsv,
    Field,
    ForbiddenError,
    formatItemValue,
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
import * as fsPromise from 'fs/promises';

import moment from 'moment';
import { nanoid } from 'nanoid';
import { pipeline, Readable, Transform, TransformCallback } from 'stream';
import { Worker } from 'worker_threads';
import { analytics } from '../../analytics/client';
import {
    DownloadCsv,
    parseAnalyticsLimit,
} from '../../analytics/LightdashAnalytics';
import { S3Service } from '../../clients/Aws/s3';
import { schedulerClient } from '../../clients/clients';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import Logger from '../../logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { UserModel } from '../../models/UserModel';
import { runWorkerThread } from '../../utils';
import { ProjectService } from '../ProjectService/ProjectService';

type CsvServiceDependencies = {
    projectService: ProjectService;
    s3Service: S3Service;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    userModel: UserModel;
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

    userModel: UserModel;

    constructor({
        userModel,
        projectService,
        s3Service,
        savedChartModel,
        dashboardModel,
    }: CsvServiceDependencies) {
        this.userModel = userModel;
        this.projectService = projectService;
        this.s3Service = s3Service;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
    }

    static convertRowToCsv(
        row: Record<string, any>,
        itemMap: Record<string, Field | TableCalculation>,
        onlyRaw: boolean,
        sortedFieldIds: string[],
    ) {
        return sortedFieldIds.map((id: string) => {
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
    }

    static async writeRowsToFile(
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
            `writeRowsToFile with ${rows.length} rows and ${selectedFieldIds.length} columns`,
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

        // Increasing CHUNK_SIZE increases memory usage, but increases speed of CSV generation
        const CHUNK_SIZE = 50000;
        const readStream = Readable.from(rows, {
            objectMode: true,
            highWaterMark: CHUNK_SIZE,
        });

        const stringifier = stringify({
            delimiter: ',',
            header: true,
            columns: csvHeader,
        });

        const rowTransformer = new Transform({
            objectMode: true,
            transform(
                chunk: any,
                encoding: BufferEncoding,
                callback: TransformCallback,
            ) {
                callback(
                    null,
                    CsvService.convertRowToCsv(
                        chunk,
                        itemMap,
                        onlyRaw,
                        sortedFieldIds,
                    ),
                );
            },
        });

        const writePromise = new Promise<string>((resolve, reject) => {
            pipeline(
                readStream,
                rowTransformer,
                stringifier,
                writeStream,
                async (err) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(fileId);
                },
            );
        });

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
        jobId?: string,
    ): Promise<AttachmentUrl> {
        const chart = await this.savedChartModel.get(chartUuid);
        const {
            metricQuery,
            chartConfig: { config },
        } = chart;
        const exploreId = chart.tableName;
        const onlyRaw = options?.formatted === false;

        const analyticProperties: DownloadCsv['properties'] | undefined = jobId
            ? {
                  jobId,
                  userId: user.userUuid,
                  organizationId: user.organizationUuid,
                  projectId: chart.projectUuid,
                  fileType: 'csv',
                  values: onlyRaw ? 'raw' : 'formatted',
                  limit: parseAnalyticsLimit(options?.limit),
                  storage: this.s3Service.isEnabled() ? 's3' : 'local',
                  context: 'scheduled delivery chart',
                  numColumns:
                      metricQuery.dimensions.length +
                      metricQuery.metrics.length +
                      metricQuery.tableCalculations.length,
              }
            : undefined;

        if (analyticProperties) {
            analytics.track({
                event: 'download_results.started',
                userId: user.userUuid,
                properties: analyticProperties,
            });
        }

        const rows = await this.projectService.runQuery(
            user,
            metricQuery,
            chart.projectUuid,
            exploreId,
            getSchedulerCsvLimit(options),
        );
        const numberRows = rows.length;

        if (numberRows === 0)
            return { path: '#no-results', filename: `${chart.name} (empty)` };

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

        const fileId = await CsvService.writeRowsToFile(
            rows,
            onlyRaw,
            metricQuery,
            itemMap,
            isTableChartConfig(config) ? config.showTableNames ?? false : true,
            getCustomLabelsFromTableConfig(config),
            chart.tableConfig.columnOrder,
        );

        if (analyticProperties) {
            analytics.track({
                event: 'download_results.completed',
                userId: user.userUuid,
                properties: { ...analyticProperties, numRows: numberRows },
            });
        }

        try {
            const csvContent = await fsPromise.readFile(`/tmp/${fileId}`, {
                encoding: 'utf-8',
            });
            const s3Url = await this.s3Service.uploadCsv(csvContent, fileId);

            await fsPromise.unlink(`/tmp/${fileId}`);

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

    async downloadSqlCsv({
        user,
        projectUuid,
        sql,
        customLabels,
    }: {
        user: SessionUser;
        projectUuid: string;
        sql: string;
        customLabels: Record<string, string> | undefined;
    }) {
        const jobId = nanoid();
        const analyticsProperties: DownloadCsv['properties'] = {
            jobId,
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            projectId: projectUuid,
            tableId: 'sql_runner',
            values: 'raw',
            context: 'sql runner',
            fileType: 'csv',
            storage: this.s3Service.isEnabled() ? 's3' : 'local',
        };
        try {
            const { organizationUuid } = user;

            if (
                user.ability.cannot(
                    'manage',
                    subject('ExportCsv', { organizationUuid, projectUuid }),
                )
            ) {
                throw new ForbiddenError();
            }

            analytics.track({
                event: 'download_results.started',
                userId: user.userUuid,
                properties: {
                    ...analyticsProperties,
                },
            });

            const results: ApiSqlQueryResults =
                await this.projectService.runSqlQuery(user!, projectUuid, sql);

            const csvContent = await CsvService.convertSqlQueryResultsToCsv(
                results,
                customLabels,
            );

            const fileId = `csv-${jobId}.csv`;

            let fileUrl;
            try {
                fileUrl = await this.s3Service.uploadCsv(csvContent, fileId);
            } catch (e) {
                // Can't store file in S3, storing locally
                await fsPromise.writeFile(
                    `/tmp/${fileId}`,
                    csvContent,
                    'utf-8',
                );
                fileUrl = `${lightdashConfig.siteUrl}/api/v1/projects/${projectUuid}/csv/${fileId}`;
            }

            analytics.track({
                event: 'download_results.completed',
                userId: user.userUuid,
                properties: {
                    ...analyticsProperties,
                    numRows: results.rows.length,
                    numColumns: Object.keys(results.fields).length,
                },
            });

            return fileUrl;
        } catch (e) {
            analytics.track({
                event: 'download_results.error',
                userId: user.userUuid,
                properties: {
                    ...analyticsProperties,
                    error: `${e}`,
                },
            });
            throw e;
        }
    }

    static async scheduleDownloadCsv(
        user: SessionUser,
        csvOptions: DownloadMetricCsv,
    ) {
        if (
            user.ability.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: user.organizationUuid,
                    projectUuid: csvOptions.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const payload: DownloadCsvPayload = {
            ...csvOptions,
            userUuid: user.userUuid,
        };
        const { jobId } = await schedulerClient.downloadCsvJob(payload);

        return { jobId };
    }

    async downloadCsv(
        jobId: string,
        {
            userUuid,
            projectUuid,
            exploreId,
            metricQuery,
            onlyRaw,
            csvLimit,
            showTableNames,
            customLabels,
            columnOrder,
        }: DownloadMetricCsv,
    ) {
        const user = await this.userModel.findSessionUserByUUID(userUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const baseAnalyticsProperties: DownloadCsv['properties'] = {
            jobId,
            userId: userUuid,
            organizationId: user.organizationUuid,
            projectId: projectUuid,
            fileType: 'csv',
            storage: this.s3Service.isEnabled() ? 's3' : 'local',
        };
        try {
            const numberColumns =
                metricQuery.dimensions.length +
                metricQuery.metrics.length +
                metricQuery.tableCalculations.length;
            const analyticsProperties: DownloadCsv['properties'] = {
                ...baseAnalyticsProperties,
                tableId: exploreId,
                values: onlyRaw ? 'raw' : 'formatted',
                context: 'results',
                limit: parseAnalyticsLimit(csvLimit),

                numColumns: numberColumns,
            };
            analytics.track({
                event: 'download_results.started',
                userId: user.userUuid!,
                properties: analyticsProperties,
            });

            const rows = await this.projectService.runQuery(
                user,
                metricQuery,
                projectUuid,
                exploreId,
                csvLimit,
            );
            const numberRows = rows.length;

            const explore = await this.projectService.getExplore(
                user,
                projectUuid,
                exploreId,
            );
            const itemMap = getItemMap(
                explore,
                metricQuery.additionalMetrics,
                metricQuery.tableCalculations,
            );

            const fileId = await CsvService.writeRowsToFile(
                rows,
                onlyRaw,
                metricQuery,
                itemMap,
                showTableNames,
                customLabels,
                columnOrder || [],
            );

            let fileUrl;
            try {
                const csvContent = await fsPromise.readFile(`/tmp/${fileId}`, {
                    encoding: 'utf-8',
                });
                fileUrl = await this.s3Service.uploadCsv(csvContent, fileId);

                await fsPromise.unlink(`/tmp/${fileId}`);
            } catch (e) {
                fileUrl = `${lightdashConfig.siteUrl}/api/v1/projects/${projectUuid}/csv/${fileId}`;
            }

            analytics.track({
                event: 'download_results.completed',
                userId: user.userUuid,
                properties: {
                    ...analyticsProperties,
                    numRows: numberRows,
                },
            });

            return fileUrl;
        } catch (e) {
            analytics.track({
                event: 'download_results.error',
                userId: user.userUuid,
                properties: {
                    ...baseAnalyticsProperties,
                    error: `${e}`,
                },
            });

            throw e;
        }
    }
}
