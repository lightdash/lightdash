import {
    CreateSqlChart,
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
        savedSqlUuid: string,
    ): Promise<SqlChart> {
        // todo: check permissions to project, space, sql
        return this.savedSqlModel.get(savedSqlUuid);
    }

    async createSqlChart(
        user: SessionUser,
        projectUuid: string,
        sqlChart: CreateSqlChart,
    ): Promise<string> {
        // todo: check permissions to project, space, sql
        const { savedSqlUuid } = await this.savedSqlModel.create(
            user.userUuid,
            sqlChart,
        );
        return savedSqlUuid;
    }

    async updateSqlChart(
        user: SessionUser,
        projectUuid: string,
        savedSqlUuid: string,
        sqlChart: UpdateSqlChart,
    ): Promise<{ savedSqlUuid: string; savedSqlVersionUuid: string | null }> {
        // todo: check permissions to project, space, sql chart, sql
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
        // todo: check permissions to project, sql chart
        await this.savedSqlModel.delete(savedSqlUuid);
    }
}
