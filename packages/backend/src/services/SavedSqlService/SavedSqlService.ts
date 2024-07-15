import { subject } from '@casl/ability';
import {
    ApiCreateSqlChart,
    CreateSqlChart,
    ForbiddenError,
    SessionUser,
    SqlChart,
    UpdateSqlChart,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

type SavedSqlServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    savedSqlModel: SavedSqlModel;
};

export class SavedSqlService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly savedSqlModel: SavedSqlModel;

    constructor(args: SavedSqlServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.savedSqlModel = args.savedSqlModel;
    }

    async getSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string | undefined,
        slug?: string,
    ): Promise<SqlChart> {
        let savedChart;
        if (savedSqlUuid) {
            savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
                projectUuid,
            });
        } else if (slug) {
            savedChart = await this.savedSqlModel.getBySlug(projectUuid, slug);
        } else {
            throw new Error('Either savedSqlUuid or slug must be provided');
        }
        const space = await this.spaceModel.getSpaceSummary(
            savedChart.space.uuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            savedChart.space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: savedChart.organization.organizationUuid,
                    projectUuid: savedChart.project.projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError("You don't have access to this chart");
        }
        return savedChart;
    }

    async createSqlChart(
        user: SessionUser,
        projectUuid: string,
        sqlChart: CreateSqlChart,
    ): Promise<ApiCreateSqlChart['results']> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const space = await this.spaceModel.getSpaceSummary(sqlChart.spaceUuid);
        const { isPrivate } = space;
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            sqlChart.spaceUuid,
        );
        if (
            user.ability.cannot(
                'create',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have permission to create this chart",
            );
        }
        return this.savedSqlModel.create(user.userUuid, projectUuid, sqlChart);
    }

    async updateSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
        sqlChart: UpdateSqlChart,
    ): Promise<{ savedSqlUuid: string; savedSqlVersionUuid: string | null }> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const savedChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            projectUuid,
        });
        const space = await this.spaceModel.getSpaceSummary(
            savedChart.space.uuid,
        );

        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', {
                    organizationUuid: savedChart.organization.organizationUuid,
                    projectUuid: savedChart.project.projectUuid,
                    isPrivate: space.isPrivate,
                    access: await this.spaceModel.getUserSpaceAccess(
                        user.userUuid,
                        savedChart.space.uuid,
                    ),
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have permission to update this chart",
            );
        }

        // check permission if the chart is being moved to a different space
        if (
            sqlChart.unversionedData &&
            savedChart.space.uuid !== sqlChart.unversionedData.spaceUuid
        ) {
            const newSpace = await this.spaceModel.getSpaceSummary(
                sqlChart.unversionedData.spaceUuid,
            );
            if (
                user.ability.cannot(
                    'update',
                    subject('SavedChart', {
                        organizationUuid:
                            savedChart.organization.organizationUuid,
                        projectUuid: savedChart.project.projectUuid,
                        isPrivate: newSpace.isPrivate,
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            sqlChart.unversionedData.spaceUuid,
                        ),
                    }),
                )
            ) {
                throw new ForbiddenError(
                    "You don't have permission to move this chart to the new space",
                );
            }
        }

        return this.savedSqlModel.update({
            userUuid: user.userUuid,
            savedSqlUuid,
            sqlChart,
        });
    }

    async deleteSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
    ): Promise<void> {
        const sqlChart = await this.savedSqlModel.getByUuid(savedSqlUuid, {
            projectUuid,
        });
        const space = await this.spaceModel.getSpaceSummary(
            sqlChart.space.uuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            sqlChart.space.uuid,
        );
        if (
            user.ability.cannot(
                'delete',
                subject('SavedChart', {
                    organizationUuid: sqlChart.organization.organizationUuid,
                    projectUuid: sqlChart.project.projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.savedSqlModel.delete(savedSqlUuid);
    }
}
