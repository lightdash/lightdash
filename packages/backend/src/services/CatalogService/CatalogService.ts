import { subject } from '@casl/ability';
import {
    ApiCatalogSearch,
    CatalogAnalytics,
    CatalogField,
    CatalogFilter,
    CatalogMetadata,
    CatalogTable,
    CatalogType,
    ChartSummary,
    Explore,
    ExploreError,
    ForbiddenError,
    hasIntersection,
    InlineErrorType,
    isExploreError,
    SessionUser,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UserAttributeValueMap,
    type ApiSort,
    type CatalogFieldMap,
    type ChartUsageUpdate,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { parseFieldsFromCompiledTable } from '../../models/CatalogModel/utils/parser';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { wrapSentryTransaction } from '../../utils';
import { BaseService } from '../BaseService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    hasUserAttributes,
} from '../UserAttributesService/UserAttributeUtils';

export type CatalogArguments<T extends CatalogModel = CatalogModel> = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    userAttributesModel: UserAttributesModel;
    catalogModel: T;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
};

export class CatalogService<
    T extends CatalogModel = CatalogModel,
> extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    userAttributesModel: UserAttributesModel;

    catalogModel: T;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        userAttributesModel,
        catalogModel,
        savedChartModel,
        spaceModel,
    }: CatalogArguments<T>) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.userAttributesModel = userAttributesModel;
        this.catalogModel = catalogModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
    }

    private static async getCatalogFields(
        explores: (Explore | ExploreError)[],
        userAttributes: UserAttributeValueMap,
    ): Promise<CatalogField[]> {
        return explores.reduce<CatalogField[]>((acc, explore) => {
            if (isExploreError(explore)) {
                return acc;
            }
            if (doesExploreMatchRequiredAttributes(explore, userAttributes)) {
                const fields: CatalogField[] = Object.values(
                    explore.tables,
                ).flatMap((t) => parseFieldsFromCompiledTable(t));

                return [...acc, ...fields];
            }
            return acc;
        }, []);
    }

    private static isExploreFiltered(
        tablesConfiguration: TablesConfiguration,
        explore: Pick<SummaryExplore, 'tags' | 'name'>,
    ) {
        // Optimization tip:
        // Perhaps we should filter these in catalog on `index` rather than in real time (requires dbt refresh on table config changes)
        const {
            tableSelection: { type, value },
        } = tablesConfiguration;

        if (type === TableSelectionType.WITH_TAGS) {
            // TODO: Add support for custom explores - don't filter them out
            return hasIntersection(explore.tags || [], value || []);
        }
        if (type === TableSelectionType.WITH_NAMES) {
            // TODO: Add support for custom explores - don't filter them out
            return (value || []).includes(explore.name);
        }
        return true;
    }

    private async getCatalogTables(
        projectUuid: string,
        explores: (Explore | ExploreError)[],
        userAttributes: UserAttributeValueMap,
    ): Promise<CatalogTable[]> {
        const tablesConfiguration =
            await this.projectModel.getTablesConfiguration(projectUuid);
        return explores.reduce<CatalogTable[]>((acc, explore) => {
            if (isExploreError(explore)) {
                // If no dimensions found, we don't show the explore error
                if (
                    explore.errors.every(
                        (error) =>
                            error.type === InlineErrorType.NO_DIMENSIONS_FOUND,
                    )
                )
                    return acc;

                return [
                    ...acc,
                    {
                        name: explore.name,
                        label: explore.label,
                        errors: explore.errors,
                        groupLabel: explore.groupLabel,
                        description:
                            explore.baseTable &&
                            explore.tables?.[explore.baseTable]?.description,
                        type: CatalogType.Table,
                        joinedTables: explore.joinedTables,
                        chartUsage: undefined,
                    },
                ];
            }

            if (
                !CatalogService.isExploreFiltered(tablesConfiguration, explore)
            ) {
                return acc;
            }
            if (doesExploreMatchRequiredAttributes(explore, userAttributes)) {
                return [
                    ...acc,
                    {
                        name: explore.name,
                        label: explore.label,
                        description:
                            explore.tables[explore.baseTable].description,
                        type: CatalogType.Table,
                        groupLabel: explore.groupLabel,
                        joinedTables: explore.joinedTables,
                        tags: explore.tags,
                        chartUsage: undefined,
                    },
                ];
            }
            return acc;
        }, []);
    }

    private async searchCatalog(
        projectUuid: string,
        userAttributes: UserAttributeValueMap,
        query?: string,
        type?: CatalogType,
        filter?: CatalogFilter,
        paginateArgs?: KnexPaginateArgs,
        sortArgs?: ApiSort,
    ): Promise<KnexPaginatedData<(CatalogTable | CatalogField)[]>> {
        const tablesConfiguration =
            await this.projectModel.getTablesConfiguration(projectUuid);

        return wrapSentryTransaction(
            'CatalogService.searchCatalog',
            {
                projectUuid,
                userAttributesSize: Object.keys(userAttributes).length,
                query,
            },
            async () =>
                wrapSentryTransaction(
                    'CatalogService.searchCatalog.modelSearch',
                    {},
                    async () =>
                        this.catalogModel.search({
                            projectUuid,
                            searchQuery: query,
                            filter,
                            type,
                            paginateArgs,
                            tablesConfiguration,
                            userAttributes,
                            sortArgs,
                        }),
                ),
        );
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
        { search, type, filter }: ApiCatalogSearch,
    ): Promise<KnexPaginatedData<(CatalogField | CatalogTable)[]>> {
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

        const explores = await this.projectModel.getExploresFromCache(
            projectUuid,
        );

        if (!explores) {
            return {
                data: [],
            };
        }

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        // We keep errors in the list of explores
        const filteredExplores = explores.reduce<(Explore | ExploreError)[]>(
            (acc, explore) => {
                if (isExploreError(explore)) {
                    // If no dimensions found, we don't show the explore error
                    if (
                        explore.errors.every(
                            (error) =>
                                error.type ===
                                InlineErrorType.NO_DIMENSIONS_FOUND,
                        )
                    )
                        return acc;

                    return [...acc, explore];
                }
                if (
                    !doesExploreMatchRequiredAttributes(explore, userAttributes)
                ) {
                    return acc;
                }
                const filteredExplore = getFilteredExplore(
                    explore,
                    userAttributes,
                );
                return [...acc, filteredExplore];
            },
            [],
        );

        if (search) {
            // On search we don't show explore errors, because they are not indexed
            return this.searchCatalog(
                projectUuid,
                userAttributes,
                search,
                type,
                filter,
            );
        }

        if (type === CatalogType.Field) {
            return {
                data: await CatalogService.getCatalogFields(
                    filteredExplores,
                    userAttributes,
                ),
            };
        }

        // all tables
        return {
            data: await this.getCatalogTables(
                projectUuid,
                filteredExplores,
                userAttributes,
            ),
        };
    }

    async getMetadata(user: SessionUser, projectUuid: string, table: string) {
        // Right now we return the full cached explore based on name
        // We could extract some data to only return what we need instead
        // to make this request more lightweight
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
        const explore = await this.catalogModel.getMetadata(projectUuid, table);

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        if (!doesExploreMatchRequiredAttributes(explore, userAttributes)) {
            throw new ForbiddenError(
                `You don't have access to the explore ${explore.name}`,
            );
        }

        const baseTable = explore.tables?.[explore.baseTable];
        const fields = parseFieldsFromCompiledTable(baseTable);
        const filteredFields = fields.filter((field) =>
            hasUserAttributes(field.requiredAttributes, userAttributes),
        );

        const metadata: CatalogMetadata = {
            name: explore.name,
            label: explore.label,
            description: baseTable.description,
            modelName: explore.name,
            source: explore.ymlPath,
            fields: filteredFields,
            joinedTables: explore.joinedTables.map(
                (joinedTable) => joinedTable.table,
            ),
        };

        return metadata;
    }

    private filterChartsWithAccess = async (
        user: SessionUser,
        projectUuid: string,
        chatSummaries: ChartSummary[],
    ) => {
        // TODO move to space utils ?
        const spaces = await this.spaceModel.find({ projectUuid });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const allowedSpaceUuids = spaces
            .filter((space) =>
                user.ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: space.organizationUuid,
                        projectUuid,
                        isPrivate: space.isPrivate,
                        access: spacesAccess[space.uuid] ?? [],
                    }),
                ),
            )
            .map(({ uuid }) => uuid);

        return chatSummaries.filter((chart) =>
            allowedSpaceUuids.includes(chart.spaceUuid),
        );
    };

    async getAnalytics(
        user: SessionUser,
        projectUuid: string,
        table: string,
    ): Promise<CatalogAnalytics> {
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

        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
            exploreName: table,
        });
        const chartsWithAccess = await this.filterChartsWithAccess(
            user,
            projectUuid,
            chartSummaries,
        );
        const chartAnalytics: CatalogAnalytics['charts'] = chartsWithAccess.map(
            (chart) => ({
                name: chart.name,
                uuid: chart.uuid,
                spaceUuid: chart.spaceUuid,
                spaceName: chart.spaceName,
                dashboardName: chart.dashboardName,
                dashboardUuid: chart.dashboardUuid,
                chartKind: chart.chartKind,
            }),
        );
        return { charts: chartAnalytics };
    }

    async getFieldAnalytics(
        user: SessionUser,
        projectUuid: string,
        fieldId: string,
    ): Promise<CatalogAnalytics> {
        const { organizationUuid } = user;
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const chartUsageByFieldId =
            await this.savedChartModel.getChartUsageByFieldId(projectUuid, [
                fieldId,
            ]);

        const chartAnalytics =
            chartUsageByFieldId[fieldId]?.map((chart) => ({
                name: chart.name,
                uuid: chart.uuid,
                spaceUuid: chart.spaceUuid,
                spaceName: chart.spaceName,
                dashboardName: chart.dashboardName,
                dashboardUuid: chart.dashboardUuid,
            })) ?? [];

        return { charts: chartAnalytics };
    }

    async getMetricsCatalog(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        { search }: ApiCatalogSearch = {},
        sortArgs?: ApiSort,
    ): Promise<KnexPaginatedData<CatalogField[]>> {
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

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const paginatedCatalog = await this.searchCatalog(
            projectUuid,
            userAttributes,
            search,
            CatalogType.Field,
            CatalogFilter.Metrics,
            paginateArgs,
            sortArgs,
        );

        const { data: catalogMetrics, pagination } = paginatedCatalog;

        const paginatedCatalogMetrics = catalogMetrics.filter(
            (item): item is CatalogField => item.type === CatalogType.Field, // This is for type narrowing the values returned from `searchCatalog`
        );

        return {
            pagination,
            data: paginatedCatalogMetrics,
        };
    }

    async updateChartUsages(
        projectUuid: string,
        catalogFieldMap: CatalogFieldMap,
    ) {
        const chartUsagesByFieldId =
            await this.savedChartModel.getChartUsageByFieldId(
                projectUuid,
                Object.keys(catalogFieldMap),
            );

        const chartUsageUpdates = Object.entries(chartUsagesByFieldId).reduce<
            ChartUsageUpdate[]
        >((acc, [fieldId, chartSummaries]) => {
            const { fieldName, cachedExploreUuid } = catalogFieldMap[fieldId];

            acc.push({
                fieldName,
                chartUsage: chartSummaries.length,
                cachedExploreUuid,
            });

            return acc;
        }, []);

        await this.catalogModel.updateChartUsages(
            projectUuid,
            chartUsageUpdates,
        );

        return {
            chartUsageUpdates,
        };
    }
}
