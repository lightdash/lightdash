import {
    Account,
    AnyType,
    ApiDownloadCsv,
    ForbiddenError,
    isUserWithOrg,
    SchedulerJobStatus,
    SessionUser,
    UnusedContent,
    UserActivity,
} from '@lightdash/common';

import { subject } from '@casl/ability';
import { stringify } from 'csv-stringify/sync';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { S3Client } from '../../clients/Aws/S3Client';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { CsvService } from '../CsvService/CsvService';

type AnalyticsServiceArguments = {
    analytics: LightdashAnalytics;
    analyticsModel: AnalyticsModel;
    projectModel: ProjectModel;
    csvService: CsvService;
};

export class AnalyticsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly analyticsModel: AnalyticsModel;

    private readonly projectModel: ProjectModel;

    private readonly csvService: CsvService;

    constructor(args: AnalyticsServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.analyticsModel = args.analyticsModel;
        this.csvService = args.csvService;
    }

    async getDashboardViews(dashboardUuid: string): Promise<number> {
        return this.analyticsModel.countDashboardViews(dashboardUuid);
    }

    async getUserActivity(
        projectUuid: string,
        user: SessionUser,
    ): Promise<UserActivity> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'usage_analytics.dashboard_viewed',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                dashboardType: 'user_activity',
            },
        });

        return this.analyticsModel.getUserActivity(
            projectUuid,
            user.organizationUuid,
        );
    }

    async exportUserActivityRawCsv(
        projectUuid: string,
        user: SessionUser,
    ): Promise<string> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'usage_analytics.csv_download',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                dashboardType: 'user_activity',
            },
        });

        const results = await this.analyticsModel.getViewsRawData(projectUuid);
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
        });
        return upload.path;
    }

    async getUnusedContent(
        projectUuid: string,
        account: Account,
    ): Promise<UnusedContent> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);

        if (
            account.user.ability.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid,
                    projectUuid,
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
                organizationId: organizationUuid!,
                dashboardType: 'user_activity',
            },
        });

        return this.analyticsModel.getUnusedContent(projectUuid);
    }
}
