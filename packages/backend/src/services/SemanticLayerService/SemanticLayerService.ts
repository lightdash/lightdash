import { subject } from '@casl/ability';
import {
    CatalogField,
    CatalogTable,
    CatalogType,
    FieldType,
    ForbiddenError,
    MetricQuery,
    MissingConfigError,
    NotFoundError,
    ResultRow,
    SemanticLayerField,
    SemanticLayerView,
    SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import CubeClient from '../../clients/cube/CubeClient';
import { cubeTransfomers } from '../../clients/cube/transformer';
import DbtCloudGraphqlClient from '../../clients/dbtCloud/DbtCloudGraphqlClient';
import { LightdashConfig } from '../../config/parseConfig';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';

type SearchServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;

    // Clients
    cubeClient: CubeClient;
    dbtCloudClient: DbtCloudGraphqlClient;
};

export class SemanticLayerService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    // Clients
    private readonly cubeClient: CubeClient;

    private readonly dbtCloudClient: DbtCloudGraphqlClient;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        // Clients
        this.cubeClient = args.cubeClient;
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
    ): Promise<CubeClient /* | DbtCloudGraphqlClient */> {
        // TODO return same types from dbtcloud
        // TODO get different client based on project
        // For now, we get the client based on the available lightdash config
        // TODO move dbt to lightdashConfig
        /* const bearerToken = process.env.DBT_CLOUD_BEARER_TOKEN || undefined;
        if (bearerToken) {
            return this.dbtCloudClient;
        } */
        // TODO check if cube is available
        return this.cubeClient;

        throw new MissingConfigError('No semantic layer available');
    }

    async getViews(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerView[]> {
        await this.checkCanViewProject(user, projectUuid);
        const semanticLayer = await this.getSemanticLayerClient(projectUuid);
        const views = await semanticLayer.getViews();
        return cubeTransfomers.cubesToSemanticLayerViews(views);
    }

    async getFields(
        user: SessionUser,
        projectUuid: string,
        table: string,
    ): Promise<SemanticLayerField[]> {
        await this.checkCanViewProject(user, projectUuid);
        const semanticLayer = await this.getSemanticLayerClient(projectUuid);
        const [dimensions, metrics] = await semanticLayer.getFields(table);
        return cubeTransfomers.cubeFieldsToSemanticLayerFields(
            dimensions,
            metrics,
        );
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
