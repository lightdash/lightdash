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
import { hasSpaceAccess } from '../SpaceService/SpaceService';
import { hasUserAttributes } from '../UserAttributesService/UserAttributeUtils';

type SearchServiceArguments = {
    analytics: LightdashAnalytics;
    searchModel: SearchModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    userAttributesModel: UserAttributesModel;
};

export class SearchService {
    private readonly searchModel: SearchModel;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly userAttributesModel: UserAttributesModel;

    constructor(args: SearchServiceArguments) {
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
        const filterItem = (
            item:
                | DashboardSearchResult
                | SpaceSearchResult
                | SavedChartSearchResult,
        ) => {
            const spaceUuid: string =
                'spaceUuid' in item ? item.spaceUuid : item.uuid;
            const itemSpace = spaces.find((s) => s.uuid === spaceUuid);
            return itemSpace && hasSpaceAccess(user, itemSpace, true);
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

        const filteredResults = {
            ...results,
            tables: filteredTables,
            fields: filteredFields,
            dashboards: results.dashboards.filter(filterItem),
            savedCharts: results.savedCharts.filter(filterItem),
            spaces: results.spaces.filter(filterItem),
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
                tablesResultsCount: filteredResults.tables.length,
                fieldsResultsCount: filteredResults.fields.length,
            },
        });
        return filteredResults;
    }
}
