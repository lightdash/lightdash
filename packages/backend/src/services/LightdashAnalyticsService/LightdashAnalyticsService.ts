import {
    LightdashAnalytics,
    type DeprecatedRouteCalled,
} from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { BaseService } from '../BaseService';

type LightdashAnalyticsServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
};

export class LightdashAnalyticsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly savedChartModel: SavedChartModel;

    constructor(args: LightdashAnalyticsServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.savedChartModel = args.savedChartModel;
    }

    async trackDeprecatedRouteCalled(
        event: Omit<DeprecatedRouteCalled, 'properties'> & {
            properties: Pick<
                DeprecatedRouteCalled['properties'],
                'route' | 'context'
            >;
        },
        projectResourceMeta:
            | {
                  projectUuid: string;
              }
            | { chartUuid: string },
    ) {
        let projectId;

        if ('projectUuid' in projectResourceMeta) {
            projectId = projectResourceMeta.projectUuid;
        } else if ('chartUuid' in projectResourceMeta) {
            const chart = await this.savedChartModel.getSummary(
                projectResourceMeta.chartUuid,
            );
            projectId = chart.projectUuid;
        }

        if (projectId) {
            const { organizationUuid } = await this.projectModel.getSummary(
                projectId,
            );

            this.analytics.track({
                ...event,
                properties: {
                    ...event.properties,
                    organizationId: organizationUuid,
                    projectId,
                },
            });
        }
    }
}
