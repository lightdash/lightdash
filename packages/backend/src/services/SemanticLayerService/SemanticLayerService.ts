import { subject } from '@casl/ability';
import {
    CatalogField,
    CatalogTable,
    ForbiddenError,
    MetricQuery,
    MissingConfigError,
    ResultRow,
    SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import DbtCloudGraphqlClient from '../../clients/dbtCloud/DbtCloudGraphqlClient';
import { LightdashConfig } from '../../config/parseConfig';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';

type SearchServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;

    // Clients
    // cubeClient: CubeClient;
    dbtCloudClient: DbtCloudGraphqlClient;
};

export class SemanticLayerService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    // Clients
    // private readonly cubeClient: CubeClient;
    private readonly dbtCloudClient: DbtCloudGraphqlClient;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        // Clients
        // this.cubeClient = cubeClient;
        this.dbtCloudClient = args.dbtCloudClient;
    }

    private async checkCanViewProject(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async getSemanticLayerClient(
        projectUuid: string,
    ): Promise<DbtCloudGraphqlClient> {
        // TODO get different client based on project
        // For now, we get the client based on the available lightdash config
        // TODO move dbt to lightdashConfig
        const bearerToken = process.env.DBT_CLOUD_BEARER_TOKEN || undefined;
        if (bearerToken) {
            return this.dbtCloudClient;
        }

        throw new MissingConfigError('No semantic layer available');
    }

    async getViews(
        user: SessionUser,
        projectUuid: string,
    ): Promise<CatalogTable[]> {
        await this.checkCanViewProject(user, projectUuid);
        const semanticLayer = await this.getSemanticLayerClient(projectUuid);
        // semanticLayer.getViews()
        // TODO convert tables to catalog type

        return [];
    }

    async getFields(
        user: SessionUser,
        projectUuid: string,
        table: string,
    ): Promise<CatalogField[]> {
        await this.checkCanViewProject(user, projectUuid);
        const semanticLayer = await this.getSemanticLayerClient(projectUuid);
        // semanticLayer.getFields()
        // TODO convert fields to catalog type
        return [];
    }

    async getResults(
        user: SessionUser,
        projectUuid: string,
        query: MetricQuery,
    ): Promise<ResultRow[]> {
        await this.checkCanViewProject(user, projectUuid);
        const semanticLayer = await this.getSemanticLayerClient(projectUuid);
        // semanticLayer.getResults()
        // TODO convert results to ResultRow type
        return [];
    }

    async getSql(
        user: SessionUser,
        projectUuid: string,
        query: MetricQuery,
    ): Promise<string> {
        await this.checkCanViewProject(user, projectUuid);
        const semanticLayer = await this.getSemanticLayerClient(projectUuid);
        // semanticLayer.getSql()
        // TODO convert sql to catalog type
        return '';
    }
}
