import { subject } from '@casl/ability';
import {
    ChartContent,
    ContentType,
    NotExistsError,
    SessionUser,
    SummaryContent,
} from '@lightdash/common';
import { intersection } from 'lodash';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { ContentFilters } from '../../models/ContentModel/ContentModelTypes';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type ContentServiceArguments = {
    analytics: LightdashAnalytics;
    spaceModel: SpaceModel;
    projectModel: ProjectModel;
    contentModel: ContentModel;
};

export class ContentService extends BaseService {
    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    spaceModel: SpaceModel;

    contentModel: ContentModel;

    constructor(args: ContentServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.spaceModel = args.spaceModel;
        this.projectModel = args.projectModel;
        this.contentModel = args.contentModel;
    }

    async find(
        user: SessionUser,
        filters: ContentFilters,
    ): Promise<SummaryContent[]> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const projectUuids = (
            await this.projectModel.getAllByOrganizationUuid(organizationUuid)
        )
            .filter((project) =>
                user.ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ),
            )
            .map((p) => p.projectUuid);
        const allowedProjectUuids = filters.projectUuids
            ? intersection(filters.projectUuids, projectUuids)
            : projectUuids; // todo: move this filter to project model query

        const spaces = await this.spaceModel.find({
            projectUuids: allowedProjectUuids,
            spaceUuids: filters.spaceUuids,
        });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((p) => p.uuid),
        );
        const allowedSpaceUuids = spaces
            .filter((space) =>
                hasViewAccessToSpace(
                    user,
                    space,
                    spacesAccess[space.uuid] ?? [],
                ),
            )
            .map((space) => space.uuid);

        return this.contentModel.findSummaryContents({
            ...filters,
            projectUuids: allowedProjectUuids,
            spaceUuids: allowedSpaceUuids,
        });
    }

    async findCharts(
        user: SessionUser,
        filters: ContentFilters,
    ): Promise<ChartContent[]> {
        return (await this.find(user, {
            ...filters,
            contentTypes: [ContentType.CHART],
        })) as ChartContent[];
    }
}
