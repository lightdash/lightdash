import { subject } from '@casl/ability';
import {
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    type SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import type { DbProjectParameter } from '../database/entities/projectParameters';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import type { ProjectModel } from '../models/ProjectModel/ProjectModel';
import type { ProjectParametersModel } from '../models/ProjectParametersModel';
import { BaseService } from './BaseService';

type ProjectParametersServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectParametersModel: ProjectParametersModel;
    projectModel: ProjectModel;
};

export class ProjectParametersService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectParametersModel: ProjectParametersModel;

    private readonly projectModel: ProjectModel;

    constructor(args: ProjectParametersServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.projectParametersModel = args.projectParametersModel;
        this.projectModel = args.projectModel;
    }

    async findProjectParameters(projectUuid: string, names?: string[]) {
        return this.projectParametersModel.find(projectUuid, names);
    }

    async findProjectParametersPaginated(
        user: SessionUser,
        projectUuid: string,
        options?: {
            search?: string;
            sortBy?: 'name' | 'created_at';
            sortOrder?: 'asc' | 'desc';
        },
        paginateArgs?: KnexPaginateArgs,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.projectParametersModel.findPaginated(
            projectUuid,
            options,
            paginateArgs,
        );
    }
}
