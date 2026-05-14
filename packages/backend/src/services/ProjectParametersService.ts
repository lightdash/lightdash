import { subject } from '@casl/ability';
import {
    ForbiddenError,
    KnexPaginateArgs,
    type Account,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
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
        account: Account,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        options?: {
            search?: string;
            sortBy?: 'name';
            sortOrder?: 'asc' | 'desc';
        },
    ) {
        const { organizationUuid, name: projectName } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Use the new paginated combined query method
        return this.projectParametersModel.findCombinedParametersPaginated(
            projectUuid,
            paginateArgs,
            options,
        );
    }
}
