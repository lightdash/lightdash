import { subject } from '@casl/ability';
import {
    DashboardSearchResult,
    FieldSearchResult,
    ForbiddenError,
    isTableErrorSearchResult,
    SavedChartSearchResult,
    SearchFilters,
    SearchResults,
    SessionUser,
    SpaceSearchResult,
    TableErrorSearchResult,
    TableSearchResult,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';
import { hasUserAttributes } from '../UserAttributesService/UserAttributeUtils';

type SearchServiceArguments = {
    analytics: LightdashAnalytics;
    searchModel: SearchModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    userAttributesModel: UserAttributesModel;
};

export class SearchService extends BaseService {
    private readonly searchModel: SearchModel;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly userAttributesModel: UserAttributesModel;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.searchModel = args.searchModel;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.userAttributesModel = args.userAttributesModel;
    }

    async getSearchResults(
        user: SessionUser,
        projectUuid: string,
        query: string,
        filters?: SearchFilters,
    ): Promise<SearchResults> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const results = await this.searchModel.search(
            projectUuid,
            query,
            filters,
        );

        const spaceUuids = [
            ...new Set([
                ...results.dashboards.map((dashboard) => dashboard.spaceUuid),
                ...results.sqlCharts.map((sqlChart) => sqlChart.spaceUuid),
                ...results.savedCharts.map(
                    (savedChart) => savedChart.spaceUuid,
                ),
                ...results.spaces.map((space) => space.uuid),
            ]),
        ];
        const spaces = await Promise.all(
            spaceUuids.map((spaceUuid) =>
                this.spaceModel.getSpaceSummary(spaceUuid),
            ),
        );
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const filterItem = async (
            item:
                | DashboardSearchResult
                | SpaceSearchResult
                | SavedChartSearchResult,
        ) => {
            const spaceUuid: string =
                'spaceUuid' in item ? item.spaceUuid : item.uuid;
            const itemSpace = spaces.find((s) => s.uuid === spaceUuid);
            return (
                itemSpace &&
                hasViewAccessToSpace(
                    user,
                    itemSpace,
                    spacesAccess[spaceUuid] ?? [],
                )
            );
        };

        const hasExploreAccess = user.ability.can(
            'manage',
            subject('Explore', {
                organizationUuid,
                projectUuid,
            }),
        );

        const dimensionsHaveUserAttributes = results.fields.some(
            (field) =>
                field.requiredAttributes !== undefined ||
                Object.values(field.tablesRequiredAttributes || {}).some(
                    (tableHaveUserAttributes) =>
                        tableHaveUserAttributes !== undefined,
                ),
        );
        const tablesHaveUserAttributes = results.tables.some(
            (table) =>
                !isTableErrorSearchResult(table) &&
                table.requiredAttributes !== undefined,
        );
        let filteredFields: FieldSearchResult[] = [];
        let filteredTables: (TableSearchResult | TableErrorSearchResult)[] = [];
        if (hasExploreAccess) {
            if (dimensionsHaveUserAttributes || tablesHaveUserAttributes) {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );
                filteredFields = results.fields.filter(
                    (field) =>
                        hasUserAttributes(
                            field.requiredAttributes,
                            userAttributes,
                        ) &&
                        Object.values(
                            field.tablesRequiredAttributes || {},
                        ).every((tableHaveUserAttributes) =>
                            hasUserAttributes(
                                tableHaveUserAttributes,
                                userAttributes,
                            ),
                        ),
                );
                filteredTables = results.tables.filter(
                    (table) =>
                        isTableErrorSearchResult(table) ||
                        hasUserAttributes(
                            table.requiredAttributes,
                            userAttributes,
                        ),
                );
            } else {
                filteredFields = results.fields;
                filteredTables = results.tables;
            }
        }

        const hasDashboardAccess = await Promise.all(
            results.dashboards.map(filterItem),
        );
        const hasSavedChartAccess = await Promise.all(
            results.savedCharts.map(filterItem),
        );
        const hasSqlChartAccess = await Promise.all(
            results.sqlCharts.map(filterItem),
        );

        const hasSpaceAccess = await Promise.all(
            results.spaces.map(filterItem),
        );
        const filteredResults = {
            ...results,
            tables: filteredTables,
            fields: filteredFields,
            dashboards: results.dashboards.filter(
                (_, index) => hasDashboardAccess[index],
            ),
            savedCharts: results.savedCharts.filter(
                (_, index) => hasSavedChartAccess[index],
            ),
            sqlCharts: results.sqlCharts.filter(
                (_, index) => hasSqlChartAccess[index],
            ),
            spaces: results.spaces.filter((_, index) => hasSpaceAccess[index]),
            pages: user.ability.can(
                'view',
                subject('Analytics', {
                    organizationUuid,
                }),
            )
                ? results.pages
                : [], // For now there is only 1 page and it is for admins only
        };
        this.analytics.track({
            event: 'project.search',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                spacesResultsCount: filteredResults.spaces.length,
                dashboardsResultsCount: filteredResults.dashboards.length,
                savedChartsResultsCount: filteredResults.savedCharts.length,
                sqlChartsResultsCount: filteredResults.sqlCharts.length,
                tablesResultsCount: filteredResults.tables.length,
                fieldsResultsCount: filteredResults.fields.length,
            },
        });
        return filteredResults;
    }
}
