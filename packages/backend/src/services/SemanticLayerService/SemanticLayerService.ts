import { subject } from '@casl/ability';
import {
    CatalogField,
    CatalogTable,
    DashboardSearchResult,
    FieldSearchResult,
    ForbiddenError,
    isTableErrorSearchResult,
    MetricQuery,
    ResultRow,
    SavedChartSearchResult,
    SearchFilters,
    SearchResults,
    SessionUser,
    SpaceSearchResult,
    TableErrorSearchResult,
    TableSearchResult,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';
import { hasUserAttributes } from '../UserAttributesService/UserAttributeUtils';

type SearchServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
};

export class SemanticLayerService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
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

    async getTables(
        user: SessionUser,
        projectUuid: string,
    ): Promise<CatalogTable[]> {
        await this.checkCanViewProject(user, projectUuid);
        // TODO get semanticlayer
        // TODO use client to get tables from semanticLayer
        // TODO convert tables to catalog type
        return [];
    }

    async getFields(
        user: SessionUser,
        projectUuid: string,
        table: string,
    ): Promise<CatalogField[]> {
        await this.checkCanViewProject(user, projectUuid);
        // TODO get semanticlayer
        // TODO use client to get fields from semanticLayer
        // TODO convert fields to catalog type
        return [];
    }

    async getResults(
        user: SessionUser,
        projectUuid: string,
        query: MetricQuery,
    ): Promise<ResultRow[]> {
        await this.checkCanViewProject(user, projectUuid);
        // TODO get semanticlayer
        // TODO use client to get results from semanticLayer
        // TODO convert results to ResultRow type
        return [];
    }

    async getSql(
        user: SessionUser,
        projectUuid: string,
        query: MetricQuery,
    ): Promise<string> {
        await this.checkCanViewProject(user, projectUuid);
        // TODO get semanticlayer
        // TODO use client to get sql from semanticLayer
        // TODO convert sql to catalog type
        return '';
    }
}
