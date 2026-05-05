import { subject } from '@casl/ability';
import {
    AnyType,
    assertIsAccountWithOrg,
    ForbiddenError,
    NotFoundError,
    SchedulerJobStatus,
    UserActivity,
    type Account,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
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
}
