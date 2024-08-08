import { subject } from '@casl/ability';
import { Cube } from '@cubejs-client/core';
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
    SemanticLayerQuery,
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
        return project;
    }

    async getSemanticLayerClient(projectUuid: string): Promise<{
        client: CubeClient;
        transformer: typeof cubeTransfomers;
    } /* | DbtCloudGraphqlClient */> {
        // TODO return same types from dbtcloud
        // TODO get different client based on project
        // For now, we get the client based on the available lightdash config
        // TODO move dbt to lightdashConfig
        /* const bearerToken = process.env.DBT_CLOUD_BEARER_TOKEN || undefined;
        if (bearerToken) {
            return this.dbtCloudClient;
        } */
        // TODO check if cube is available
        return {
            client: this.cubeClient,
            transformer: cubeTransfomers,
        };

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
                event: 'semantic_layer.get_view', // started, completed, error suffix when using wrapEvent
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            },
            async () => {
                const { client, transformer } =
                    await this.getSemanticLayerClient(projectUuid);
                const views = await client.getViews();
                return transformer.cubesToSemanticLayerViews(views);
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
    ): Promise<SemanticLayerField[]> {
        await this.checkCanViewProject(user, projectUuid);
        const { client, transformer } = await this.getSemanticLayerClient(
            projectUuid,
        );
        const [dimensions, metrics] = await client.getFields(table);
        return transformer.cubeFieldsToSemanticLayerFields(dimensions, metrics);
    }

    async getResults(
        user: SessionUser,
        projectUuid: string,
        query: SemanticLayerQuery,
    ): Promise<ResultRow[]> {
        await this.checkCanViewProject(user, projectUuid);
        const { client, transformer } = await this.getSemanticLayerClient(
            projectUuid,
        );

        const semanticQuery = transformer.semanticLayerQueryToCubeQuery(query);
        const results = await client.getResults(semanticQuery);
        const resultRows = transformer.cubeResultSetToResultRows(results);

        return resultRows;
    }

    async getSql(
        user: SessionUser,
        projectUuid: string,
        query: SemanticLayerQuery,
    ): Promise<string> {
        await this.checkCanViewProject(user, projectUuid);
        const { client, transformer } = await this.getSemanticLayerClient(
            projectUuid,
        );

        const semanticQuery = transformer.semanticLayerQueryToCubeQuery(query);
        const sqlQuery = await client.getSql(semanticQuery);
        const sql = transformer.cubeSqlToString(sqlQuery);

        return sql;
    }
}
