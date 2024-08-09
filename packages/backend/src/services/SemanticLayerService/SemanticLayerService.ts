import { subject } from '@casl/ability';
import {
    ForbiddenError,
    MissingConfigError,
    SemanticLayerField,
    SemanticLayerQuery,
    SemanticLayerResultRow,
    SemanticLayerView,
    SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import CubeClient from '../../clients/cube/CubeClient';
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
        return project;
    }

    async getSemanticLayerClient(
        projectUuid: string,
    ): Promise<CubeClient | DbtCloudGraphqlClient> {
        // TODO: get different client based on project, right now we're only doing this based on config

        if (
            !!this.lightdashConfig.dbtCloud.bearerToken &&
            !!this.lightdashConfig.dbtCloud.environmentId
        ) {
            return this.dbtCloudClient;
        }

        if (
            !!this.lightdashConfig.cube.token &&
            !!this.lightdashConfig.cube.domain
        ) {
            return this.cubeClient;
        }

        throw new MissingConfigError('No semantic layer available');
    }

    async getViews(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerView[]> {
        const { organizationUuid } = await this.checkCanViewProject(
            user,
            projectUuid,
        );

        return this.analytics.wrapEvent<any[]>(
            {
                event: 'semantic_layer.get_views', // started, completed, error suffix when using wrapEvent
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            },
            async () => {
                const client = await this.getSemanticLayerClient(projectUuid);
                return client.getViews();
            },
            // Extra properties for analytic event after the function is executed
            (result) => ({
                viewCount: result.length,
            }),
        );
    }

    async getFields(
        user: SessionUser,
        projectUuid: string,
        table: string,
        selectedFields: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ): Promise<SemanticLayerField[]> {
        await this.checkCanViewProject(user, projectUuid);
        const client = await this.getSemanticLayerClient(projectUuid);
        return client.getFields(table, selectedFields);
    }

    async getResults(
        user: SessionUser,
        projectUuid: string,
        query: SemanticLayerQuery,
    ): Promise<SemanticLayerResultRow[]> {
        await this.checkCanViewProject(user, projectUuid);
        const client = await this.getSemanticLayerClient(projectUuid);

        return client.getResults(query);
    }

    async getSql(
        user: SessionUser,
        projectUuid: string,
        query: SemanticLayerQuery,
    ): Promise<string> {
        await this.checkCanViewProject(user, projectUuid);
        const client = await this.getSemanticLayerClient(projectUuid);
        return client.getSql(query);
    }
}
