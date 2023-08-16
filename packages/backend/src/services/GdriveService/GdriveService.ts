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
    isMomentInput,
    isTableChartConfig,
    MetricQuery,
    SchedulerCsvOptions,
    SchedulerFormat,
    SessionUser,
    TableCalculation,
    UploadMetricGsheet,
} from '@lightdash/common';

import { stringify } from 'csv-stringify';
import * as fs from 'fs';
import * as fsPromise from 'fs/promises';

import moment, { MomentInput } from 'moment';
import { nanoid } from 'nanoid';
import { pipeline, Readable, Transform, TransformCallback } from 'stream';
import { Worker } from 'worker_threads';
import { analytics } from '../../analytics/client';
import {
    DownloadCsv,
    parseAnalyticsLimit,
    QueryExecutionContext,
} from '../../analytics/LightdashAnalytics';
import { S3Service } from '../../clients/Aws/s3';
import { schedulerClient } from '../../clients/clients';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { UserModel } from '../../models/UserModel';
import { runWorkerThread } from '../../utils';
import { ProjectService } from '../ProjectService/ProjectService';

type GdriveServiceDependencies = {
    lightdashConfig: LightdashConfig;
    projectService: ProjectService;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    userModel: UserModel;
};

export class GdriveService {
    lightdashConfig: LightdashConfig;

    projectService: ProjectService;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    userModel: UserModel;

    constructor({
        lightdashConfig,
        userModel,
        projectService,
        savedChartModel,
        dashboardModel,
    }: GdriveServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.userModel = userModel;
        this.projectService = projectService;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
    }

    static async scheduleUploadGsheet(
        user: SessionUser,
        gsheetOptions: UploadMetricGsheet,
    ) {
        if (
            user.ability.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: user.organizationUuid,
                    projectUuid: gsheetOptions.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const payload: DownloadCsvPayload = {
            ...gsheetOptions,
            userUuid: user.userUuid,
        };
        const { jobId } = await schedulerClient.uploadGsheetFromQueryJob(
            payload,
        );

        return { jobId };
    }
}
