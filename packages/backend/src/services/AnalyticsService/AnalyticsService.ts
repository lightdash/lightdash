import { subject } from '@casl/ability';
import {
    AnyType,
    assertIsAccountWithOrg,
    DownloadActivityResults,
    ForbiddenError,
    KnexPaginateArgs,
    NotFoundError,
    PaginationError,
    SchedulerJobStatus,
    UserActivity,
    type Account,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../config/parseConfig';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DownloadAuditModel } from '../../models/DownloadAuditModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { CsvService } from '../CsvService/CsvService';

type AnalyticsServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    analyticsModel: AnalyticsModel;
    downloadAuditModel: DownloadAuditModel;
    projectModel: ProjectModel;
    csvService: CsvService;
};

export class AnalyticsService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly analyticsModel: AnalyticsModel;

    private readonly downloadAuditModel: DownloadAuditModel;

    private readonly projectModel: ProjectModel;

    private readonly csvService: CsvService;

    constructor(args: AnalyticsServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.analyticsModel = args.analyticsModel;
        this.downloadAuditModel = args.downloadAuditModel;
        this.csvService = args.csvService;
    }

    async getDashboardViews(dashboardUuid: string): Promise<number> {
        return this.analyticsModel.countDashboardViews(dashboardUuid);
    }

    async getUserActivity(
        projectUuid: string,
        account: Account,
    ): Promise<UserActivity> {
        assertIsAccountWithOrg(account);
        const { organizationUuid, name: projectName } =
            await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'usage_analytics.dashboard_viewed',
            userId: account.user.id,
            properties: {
                projectId: projectUuid,
                organizationId: account.organization.organizationUuid,
                dashboardType: 'user_activity',
            },
        });

        return this.analyticsModel.getUserActivity(
            projectUuid,
            account.organization.organizationUuid,
        );
    }

    async exportUserActivityRawCsv(
        projectUuid: string,
        account: Account,
    ): Promise<string> {
        assertIsAccountWithOrg(account);
        const { organizationUuid, name: projectName } =
            await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'usage_analytics.csv_download',
            userId: account.user.id,
            properties: {
                projectId: projectUuid,
                organizationId: account.organization.organizationUuid,
                dashboardType: 'user_activity',
            },
        });

        const results = await this.analyticsModel.getViewsRawData(projectUuid);
        if (results.length === 0) {
            throw new NotFoundError('No user activity data found');
        }

        const fileName = `lightdash raw usage analytics.csv`;
        const csvHeader = Object.keys(results[0]);
        const csvBody = stringify(results, {
            delimiter: ',',
            header: true,
            columns: csvHeader,
        });

        const upload = await this.csvService.downloadCsvFile({
            csvContent: csvBody,
            fileName,
            projectUuid,
            organizationUuid,
            createdByUserUuid: account.user.id,
        });
        return upload.path;
    }

    async getDownloadActivity(
        projectUuid: string,
        account: Account,
        paginateArgs: KnexPaginateArgs,
        cursor?: string,
    ): Promise<DownloadActivityResults> {
        const { maxPageSize } = this.lightdashConfig.query;
        if (paginateArgs.pageSize > maxPageSize) {
            throw new PaginationError(
                `page size is too large, max is ${maxPageSize}`,
            );
        }
        assertIsAccountWithOrg(account);
        const { organizationUuid, name: projectName } =
            await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'usage_analytics.download_activity_viewed',
            userId: account.user.id,
            properties: {
                projectId: projectUuid,
                organizationId: account.organization.organizationUuid,
            },
        });

        return this.downloadAuditModel.getDownloads(
            organizationUuid,
            projectUuid,
            paginateArgs,
            cursor,
        );
    }
}
