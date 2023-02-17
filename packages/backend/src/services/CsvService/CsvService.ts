import {
    ApiQueryResults,
    DimensionType,
    Field,
    getItemLabel,
    getItemMap,
    isDashboardChartTileType,
    isField,
    MetricQuery,
    SessionUser,
    TableCalculation,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';
import * as fs from 'fs/promises';
import moment from 'moment';
import { nanoid } from 'nanoid';
import { S3Service } from '../../clients/Aws/s3';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { ProjectService } from '../ProjectService/ProjectService';

type CsvServiceDependencies = {
    projectService: ProjectService;
    s3Service: S3Service;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
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

    static async convertApiResultsToCsv(
        results: ApiQueryResults,
        onlyRaw: boolean,
        metricQuery: MetricQuery,
        itemMap: Record<string, Field | TableCalculation>,
    ): Promise<string> {
        // Ignore fields from results that are not selected in metrics or dimensions
        const selectedFieldIds = [
            ...metricQuery.metrics,
            ...metricQuery.dimensions,
            ...metricQuery.tableCalculations.map((tc: any) => tc.name),
        ];
        const csvHeader = Object.keys(results.rows[0])
            .filter((id) => selectedFieldIds.includes(id))
            .map((id) => getItemLabel(itemMap[id]));
        const csvBody = results.rows.map((row) =>
            Object.keys(row)
                .filter((id) => selectedFieldIds.includes(id))
                .map((id) => {
                    const rowData = row[id];
                    const item = itemMap[id];
                    if (
                        isField(item) &&
                        item.type === DimensionType.TIMESTAMP
                    ) {
                        return moment(rowData.value.raw).format(
                            'YYYY-MM-DD HH:mm:ss',
                        );
                    }
                    if (isField(item) && item.type === DimensionType.DATE) {
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
    }

    async getCsvForChart(
        user: SessionUser,
        chartUuid: string,
    ): Promise<AttachmentUrl> {
        const chart = await this.savedChartModel.get(chartUuid);
        const { metricQuery } = chart;
        const exploreId = chart.tableName;
        const onlyRaw = false;

        const results: ApiQueryResults = await this.projectService.runQuery(
            user,
            metricQuery,
            chart.projectUuid,
            exploreId,
            metricQuery.limit,
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

    async getCsvsForDashboard(user: SessionUser, dashboardUuid: string) {
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
            chartUuids.map((chartUuid) => this.getCsvForChart(user, chartUuid)),
        );
        return csvUrls;
    }
}
