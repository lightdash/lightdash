import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import type { DbProjectParameter } from '../database/entities/projectParameters';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import type { ProjectParametersModel } from '../models/ProjectParametersModel';
import { BaseService } from './BaseService';

type ProjectParametersServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectParametersModel: ProjectParametersModel;
};

export class ProjectParametersService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectParametersModel: ProjectParametersModel;

    constructor(args: ProjectParametersServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.projectParametersModel = args.projectParametersModel;
    }

    async findProjectParameters(projectUuid: string, names?: string[]) {
        return this.projectParametersModel.find(projectUuid, names);
    }
}
