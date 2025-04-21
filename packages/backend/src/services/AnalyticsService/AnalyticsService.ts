import {
    AnyType,
    ApiDownloadCsv,
    ForbiddenError,
    isUserWithOrg,
    SchedulerJobStatus,
    SessionUser,
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

type AnalyticsServiceArguments = {
    analytics: LightdashAnalytics;
    analyticsModel: AnalyticsModel;
    s3Client: S3Client;
    projectModel: ProjectModel;
};

export class AnalyticsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly analyticsModel: AnalyticsModel;

    private readonly projectModel: ProjectModel;

    private readonly s3Client: S3Client;

    constructor(args: AnalyticsServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.analyticsModel = args.analyticsModel;
        this.s3Client = args.s3Client;
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
        const fileId = `usage-analytics-${projectUuid}-${nanoid()}.csv`;
        const fileName = `lightdash raw usage analytics.csv`;
        const csvHeader = Object.keys(results[0]);
        const csvBody = stringify(results, {
            delimiter: ',',
            header: true,
            columns: csvHeader,
        });
        const s3upload = await this.s3Client.uploadCsv(
            csvBody,
            fileId,
            fileName,
        );
        return s3upload;
    }
}
