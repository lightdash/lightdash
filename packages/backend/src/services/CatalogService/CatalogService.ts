import { subject } from '@casl/ability';
import {
    ApiCatalogSearch,
    CatalogAnalytics,
    CatalogField,
    CatalogFilter,
    CatalogItemIcon,
    CatalogItemsWithIcons,
    CatalogMetadata,
    CatalogTable,
    CatalogType,
    ChartSummary,
    CompiledDimension,
    DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
    Explore,
    ExploreError,
    FieldType,
    ForbiddenError,
    InlineErrorType,
    MAX_METRICS_TREE_NODE_COUNT,
    MetricWithAssociatedTimeDimension,
    NotFoundError,
    ParameterError,
    SessionUser,
    SummaryExplore,
    TableSelectionType,
    TablesConfiguration,
    TimeFrames,
    UserAttributeValueMap,
    getAvailableCompareMetrics,
    getAvailableSegmentDimensions,
    getAvailableTimeDimensionsFromTables,
    getDefaultTimeDimension,
    hasIntersection,
    isExploreError,
    type ApiMetricsTreeEdgePayload,
    type ApiSort,
    type CatalogFieldMap,
    type CatalogItem,
    type CatalogItemWithTagUuids,
    type CatalogMetricsTreeEdge,
    type ChartUsageIn,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { uniqBy } from 'lodash';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import type {
    DbCatalogTagsMigrateIn,
    DbMetricsTreeEdgeIn,
} from '../../database/entities/catalog';
import {
    CatalogModel,
    type CatalogSearchContext,
} from '../../models/CatalogModel/CatalogModel';
import { parseFieldsFromCompiledTable } from '../../models/CatalogModel/utils/parser';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import type { TagsModel } from '../../models/TagsModel';
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
    tagsModel: TagsModel;
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

    tagsModel: TagsModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        userAttributesModel,
        catalogModel,
        savedChartModel,
        spaceModel,
        tagsModel,
    }: CatalogArguments<T>) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.userAttributesModel = userAttributesModel;
        this.catalogModel = catalogModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.tagsModel = tagsModel;
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
                        // ! since we're not pulling from the catalog search table these do not exist (keep compatibility with data catalog)
                        catalogSearchUuid: '',
                        categories: [],
                        icon: null,
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
                        // ! since we're not pulling from the catalog search table these do not exist (keep compatibility with data catalog)
                        catalogSearchUuid: '',
                        categories: [],
                        icon: null,
                    },
                ];
            }
            return acc;
        }, []);
    }

    private async searchCatalog(
        projectUuid: string,
        userAttributes: UserAttributeValueMap,
        catalogSearch: ApiCatalogSearch,
        context: CatalogSearchContext,
        paginateArgs?: KnexPaginateArgs,
        sortArgs?: ApiSort,
    ): Promise<KnexPaginatedData<CatalogItem[]>> {
        const tablesConfiguration =
            await this.projectModel.getTablesConfiguration(projectUuid);

        return wrapSentryTransaction(
            'CatalogService.searchCatalog',
            {
                projectUuid,
                userAttributesSize: Object.keys(userAttributes).length,
                searchQuery: catalogSearch.searchQuery,
            },
            async () =>
                wrapSentryTransaction(
                    'CatalogService.searchCatalog.modelSearch',
                    {},
                    async () =>
                        this.catalogModel.search({
                            projectUuid,
                            catalogSearch,
                            paginateArgs,
                            tablesConfiguration,
                            userAttributes,
                            sortArgs,
                            context,
                        }),
                ),
        );
    }

    private async getFilteredExplores(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
    ) {
        const cachedExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
        );

        if (!cachedExplores) return [];

        const explores = Object.values(cachedExplores);

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

        return filteredExplores;
    }

    async indexCatalog(
        projectUuid: string,
        userUuid: string | undefined,
        embedderFn?: (
            documents: {
                name: string;
                description: string;
            }[],
        ) => Promise<Array<Array<number>>>,
    ) {
        const cachedExploresMap =
            await this.projectModel.getAllExploresFromCache(projectUuid);

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        const projectYamlTags = await this.tagsModel.getYamlTags(projectUuid);

        const result = await this.catalogModel.indexCatalog(
            projectUuid,
            cachedExploresMap,
            projectYamlTags,
            userUuid,
            embedderFn,
        );

        if (
            userUuid &&
            result.numberOfCategoriesApplied &&
            result.numberOfCategoriesApplied > 0
        ) {
            this.analytics.track({
                event: 'categories.applied',
                userId: userUuid,
                properties: {
                    count: result.numberOfCategoriesApplied,
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                    context: 'yaml',
                },
            });
        }

        return result;
    }

    /**
     * Migrates catalog item tags from the previous catalog to the new catalog
     * This is a best effort migration, if the catalog item is not found in the new catalog
     * it will not be migrated
     *
     * For the item to be found it needs to:
     * - have the same name
     * - have the same explore base table
     * - have the same field type
     * - have the same type
     * - be in the same project
     * @param projectUuid - project uuid
     * @param prevCatalogItemsWithTags - catalog items with tags before the catalog being re-indexed
     * @returns
     */
    async migrateCatalogItemTags(
        projectUuid: string,
        prevCatalogItemsWithTags: CatalogItemWithTagUuids[],
    ) {
        // Get all catalog items so we can match them with the previous catalog items
        const currentCatalogItems =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);

        const catalogTagsMigrateIn: DbCatalogTagsMigrateIn[] =
            currentCatalogItems.flatMap(
                ({
                    projectUuid: currentProjectUuid,
                    name: currentName,
                    tableName: currentTableName,
                    fieldType: currentFieldType,
                    type: currentType,
                    catalogSearchUuid: currentCatalogSearchUuid,
                }) => {
                    // Just a safeguard, this should never happen since the getTaggedCatalogItems query is scoped to the project
                    if (projectUuid !== currentProjectUuid) {
                        return [];
                    }

                    const prevCatalogItem = prevCatalogItemsWithTags.find(
                        ({
                            name: prevName,
                            tableName: prevTableName,
                            fieldType: prevFieldType,
                            type: prevType,
                            projectUuid: prevProjectUuid,
                        }) =>
                            prevName === currentName &&
                            prevTableName === currentTableName &&
                            prevFieldType === currentFieldType &&
                            prevType === currentType &&
                            prevProjectUuid === currentProjectUuid,
                    );

                    if (prevCatalogItem) {
                        // Pass the current catalog item uuid with the old tags
                        return prevCatalogItem.catalogTags.map(
                            ({
                                tagUuid: prevCatalogTagUuid,
                                createdByUserUuid: prevCreatedByUserUuid,
                                createdAt: prevCreatedAt,
                                taggedViaYaml: prevTaggedViaYaml,
                            }) => ({
                                catalog_search_uuid: currentCatalogSearchUuid,
                                tag_uuid: prevCatalogTagUuid,
                                created_by_user_uuid: prevCreatedByUserUuid,
                                created_at: prevCreatedAt,
                                is_from_yaml: prevTaggedViaYaml,
                            }),
                        );
                    }

                    return [];
                },
            );

        return this.catalogModel.migrateCatalogItemTags(catalogTagsMigrateIn);
    }

    async migrateCatalogItemIcons(
        projectUuid: string,
        prevCatalogItemsWithIcons: CatalogItemsWithIcons[],
    ) {
        // Get all catalog items so we can match them with the previous catalog items
        const currentCatalogItems =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);

        const iconMigrationUpdates = currentCatalogItems.flatMap(
            ({
                projectUuid: currentProjectUuid,
                name: currentName,
                tableName: currentExploreBaseTable,
                fieldType: currentFieldType,
                type: currentType,
                catalogSearchUuid: currentCatalogSearchUuid,
            }) => {
                // Just a safeguard, this should never happen since the getCatalogItems query is scoped to the project
                if (projectUuid !== currentProjectUuid) {
                    return [];
                }

                const prevCatalogItem = prevCatalogItemsWithIcons.find(
                    ({
                        name: prevName,
                        tableName: prevExploreBaseTable,
                        fieldType: prevFieldType,
                        type: prevType,
                        projectUuid: prevProjectUuid,
                    }) =>
                        prevName === currentName &&
                        prevExploreBaseTable === currentExploreBaseTable &&
                        prevFieldType === currentFieldType &&
                        prevType === currentType &&
                        prevProjectUuid === currentProjectUuid,
                );

                if (prevCatalogItem?.icon) {
                    return [
                        {
                            catalogSearchUuid: currentCatalogSearchUuid,
                            icon: prevCatalogItem.icon,
                        },
                    ];
                }

                return [];
            },
        );

        await this.catalogModel.updateCatalogItemIcon(iconMigrationUpdates);
    }

    async migrateMetricsTreeEdges(
        projectUuid: string,
        prevMetricTreeEdges: CatalogMetricsTreeEdge[],
    ) {
        // reusing catalog items with tags although we don't need the tags, but trying to avoid creating another function here
        const currentCatalogItems =
            await this.catalogModel.getCatalogItemsSummary(projectUuid);

        const metricEdgesMigrateIn: DbMetricsTreeEdgeIn[] =
            prevMetricTreeEdges.reduce<DbMetricsTreeEdgeIn[]>((acc, edge) => {
                const sourceCatalogItem = currentCatalogItems.find(
                    (catalogItem) =>
                        catalogItem.name === edge.source.name &&
                        catalogItem.tableName === edge.source.tableName &&
                        catalogItem.type === CatalogType.Field &&
                        catalogItem.fieldType === FieldType.METRIC,
                );

                const targetCatalogItem = currentCatalogItems.find(
                    (catalogItem) =>
                        catalogItem.name === edge.target.name &&
                        catalogItem.tableName === edge.target.tableName &&
                        catalogItem.type === CatalogType.Field &&
                        catalogItem.fieldType === FieldType.METRIC,
                );

                if (sourceCatalogItem && targetCatalogItem) {
                    return [
                        ...acc,
                        {
                            source_metric_catalog_search_uuid:
                                sourceCatalogItem.catalogSearchUuid,
                            target_metric_catalog_search_uuid:
                                targetCatalogItem.catalogSearchUuid,
                            created_by_user_uuid: edge.createdByUserUuid,
                            created_at: edge.createdAt,
                        },
                    ];
                }

                return acc;
            }, []);

        return this.catalogModel.migrateMetricsTreeEdges(metricEdgesMigrateIn);
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
        catalogSearch: ApiCatalogSearch,
        context: CatalogSearchContext,
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

        const filteredExplores = await this.getFilteredExplores(
            user,
            organizationUuid,
            projectUuid,
        );

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        if (catalogSearch.searchQuery) {
            // On search we don't show explore errors, because they are not indexed
            return this.searchCatalog(
                projectUuid,
                userAttributes,
                catalogSearch,
                context,
            );
        }

        if (catalogSearch.type === CatalogType.Field) {
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

        const chartSummaries =
            await this.savedChartModel.getChartSummariesForFieldId(
                projectUuid,
                fieldId,
            );

        const chartAnalytics =
            chartSummaries.map((chart) => ({
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
        context: CatalogSearchContext,
        paginateArgs?: KnexPaginateArgs,
        { searchQuery, catalogTags }: ApiCatalogSearch = {},
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
            {
                searchQuery,
                type: CatalogType.Field,
                filter: CatalogFilter.Metrics,
                catalogTags,
            },
            context,
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

    async setChartUsages(
        projectUuid: string,
        catalogFieldMap: CatalogFieldMap,
    ) {
        const chartUsagesForFields =
            await this.savedChartModel.getChartCountPerField(
                projectUuid,
                Object.keys(catalogFieldMap),
            );

        const chartUsageUpdates = chartUsagesForFields
            .map<ChartUsageIn | undefined>(({ fieldId, count }) => {
                const catalogField = catalogFieldMap[fieldId];

                if (!catalogField || Number.isNaN(count)) {
                    return undefined;
                }

                const { fieldName, cachedExploreUuid, fieldType } =
                    catalogField;

                return {
                    fieldName,
                    fieldType,
                    chartUsage: count,
                    cachedExploreUuid,
                } satisfies ChartUsageIn;
            })
            .filter((c): c is ChartUsageIn => Boolean(c));

        await this.catalogModel.setChartUsages(projectUuid, chartUsageUpdates);

        return {
            chartUsageUpdates,
        };
    }

    async tagCatalogItem(
        user: SessionUser,
        catalogSearchUuid: string,
        tagUuid: string,
    ) {
        const tag = await this.tagsModel.get(tagUuid);

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        const catalogSearch = await this.catalogModel.getCatalogItem(
            catalogSearchUuid,
        );

        if (!catalogSearch) {
            throw new NotFoundError('Catalog search not found');
        }

        if (catalogSearch.project_uuid !== tag.projectUuid) {
            throw new ForbiddenError(
                'Catalog search and tag are not in the same project',
            );
        }

        const { organizationUuid: tagOrganizationUuid } =
            await this.projectModel.getSummary(tag.projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Tags', {
                    projectUuid: tag.projectUuid,
                    organizationUuid: tagOrganizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.catalogModel.tagCatalogItem(
            user,
            catalogSearchUuid,
            tagUuid,
            false,
        );

        this.analytics.track({
            event: 'categories.applied',
            userId: user.userUuid,
            properties: {
                count: 1,
                projectId: tag.projectUuid,
                organizationId: tagOrganizationUuid,
                context: 'ui',
            },
        });
    }

    async untagCatalogItem(
        user: SessionUser,
        catalogSearchUuid: string,
        tagUuid: string,
    ) {
        const tag = await this.tagsModel.get(tagUuid);

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        const { organizationUuid: tagOrganizationUuid } =
            await this.projectModel.getSummary(tag.projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Tags', {
                    projectUuid: tag.projectUuid,
                    organizationUuid: tagOrganizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.catalogModel.untagCatalogItem(catalogSearchUuid, tagUuid);
    }

    async updateCatalogItemIcon(
        user: SessionUser,
        projectUuid: string,
        catalogSearchUuid: string,
        icon: CatalogItemIcon | null,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                // NOTE: being able to manage tags that the user can customise catalog items
                subject('Tags', {
                    projectUuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.catalogModel.updateCatalogItemIcon([
            {
                catalogSearchUuid,
                icon,
            },
        ]);
    }

    async getMetrics({
        user,
        projectUuid,
        metrics,
        timeIntervalOverride,
        userAttributes,
        addDefaultTimeDimension = true,
    }: {
        user: SessionUser;
        projectUuid: string;
        metrics: {
            tableName: string;
            metricName: string;
        }[];
        timeIntervalOverride?: TimeFrames;
        userAttributes?: UserAttributeValueMap;
        addDefaultTimeDimension?: boolean;
    }): Promise<MetricWithAssociatedTimeDimension[]> {
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

        const userAttributesForOrgMember =
            userAttributes ??
            (await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            }));

        const explores = await this.projectModel.findExploresFromCache(
            projectUuid,
            uniqBy(metrics, 'tableName').map((m) => m.tableName),
        );

        const filteredExplores = Object.fromEntries(
            Object.entries(explores).map(([tableName, explore]) => {
                if (isExploreError(explore)) {
                    return [tableName, undefined];
                }

                const filteredExplore = getFilteredExplore(
                    explore,
                    userAttributesForOrgMember,
                );
                return [tableName, filteredExplore];
            }),
        );

        const mappedMetrics = metrics
            .map((m) => {
                const explore = filteredExplores[m.tableName];

                const tables = explore?.tables;
                const metric = tables?.[m.tableName]?.metrics?.[m.metricName];

                if (!metric) {
                    return undefined;
                }

                const metricBaseTable = tables?.[metric?.table];

                const defaultTimeDimension = getDefaultTimeDimension(
                    metric,
                    metricBaseTable,
                );

                let availableTimeDimensions:
                    | ReturnType<typeof getAvailableTimeDimensionsFromTables>
                    | undefined;

                // If no default time dimension is defined, we can use the available time dimensions so the user can see what time dimensions are available
                if (!defaultTimeDimension || timeIntervalOverride) {
                    availableTimeDimensions =
                        getAvailableTimeDimensionsFromTables(tables);
                }

                let timeDimension:
                    | MetricWithAssociatedTimeDimension['timeDimension']
                    | undefined;

                if (defaultTimeDimension && !timeIntervalOverride) {
                    timeDimension = {
                        field: defaultTimeDimension.field,
                        interval: defaultTimeDimension.interval,
                        table: metric.table,
                    };
                } else if (
                    addDefaultTimeDimension &&
                    availableTimeDimensions &&
                    availableTimeDimensions.length > 0
                ) {
                    const firstAvailableTimeDimension =
                        availableTimeDimensions[0];

                    if (!firstAvailableTimeDimension.isIntervalBase) {
                        throw new Error(
                            'The first available time dimension is not an interval base dimension',
                        );
                    }

                    timeDimension = {
                        field: firstAvailableTimeDimension.name,
                        interval:
                            timeIntervalOverride ??
                            DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
                        table: firstAvailableTimeDimension.table,
                    };
                }

                return {
                    ...metric,
                    ...(availableTimeDimensions &&
                    availableTimeDimensions.length > 0
                        ? { availableTimeDimensions }
                        : {}),
                    timeDimension,
                };
            })
            .filter(
                (m): m is MetricWithAssociatedTimeDimension => m !== undefined,
            );

        return mappedMetrics;
    }

    async getMetric(
        user: SessionUser,
        projectUuid: string,
        tableName: string,
        metricName: string,
        timeIntervalOverride?: TimeFrames,
    ) {
        const metrics = await this.getMetrics({
            user,
            projectUuid,
            metrics: [{ tableName, metricName }],
            timeIntervalOverride,
        });

        if (metrics.length === 0) {
            throw new NotFoundError('Metric not found');
        }

        return metrics[0];
    }

    async getMetricsTree(
        user: SessionUser,
        projectUuid: string,
        metricUuids: string[],
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('MetricsTree', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (metricUuids.length > MAX_METRICS_TREE_NODE_COUNT) {
            throw new ParameterError(
                `Cannot get more than ${MAX_METRICS_TREE_NODE_COUNT} metrics in the metrics tree`,
            );
        }

        return this.catalogModel.getMetricsTree(projectUuid, metricUuids);
    }

    private async validateMetricsTreeEdge(
        projectUuid: string,
        edgePayload: ApiMetricsTreeEdgePayload,
    ) {
        const { sourceCatalogSearchUuid, targetCatalogSearchUuid } =
            edgePayload;

        const sourceCatalogItem = await this.catalogModel.getCatalogItem(
            sourceCatalogSearchUuid,
        );

        const targetCatalogItem = await this.catalogModel.getCatalogItem(
            targetCatalogSearchUuid,
        );

        if (!sourceCatalogItem) {
            throw new NotFoundError('Source metric not found');
        }

        if (sourceCatalogItem.field_type !== FieldType.METRIC) {
            throw new ParameterError('Source metric is not a valid metric');
        }

        if (sourceCatalogItem.project_uuid !== projectUuid) {
            throw new ForbiddenError(
                'Source metric is not in the same project',
            );
        }

        if (!targetCatalogItem) {
            throw new NotFoundError('Target metric not found');
        }

        if (targetCatalogItem.field_type !== FieldType.METRIC) {
            throw new ParameterError('Target metric is not a valid metric');
        }

        if (targetCatalogItem.project_uuid !== projectUuid) {
            throw new ForbiddenError(
                'Target metric is not in the same project',
            );
        }
    }

    async createMetricsTreeEdge(
        user: SessionUser,
        projectUuid: string,
        edgePayload: ApiMetricsTreeEdgePayload,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('MetricsTree', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { sourceCatalogSearchUuid, targetCatalogSearchUuid } =
            edgePayload;

        await this.validateMetricsTreeEdge(projectUuid, edgePayload);

        return this.catalogModel.createMetricsTreeEdge({
            source_metric_catalog_search_uuid: sourceCatalogSearchUuid,
            target_metric_catalog_search_uuid: targetCatalogSearchUuid,
            created_by_user_uuid: user.userUuid,
        });
    }

    async getAllCatalogMetricsWithTimeDimensions(
        user: SessionUser,
        projectUuid: string,
        context: CatalogSearchContext,
    ): Promise<MetricWithAssociatedTimeDimension[]> {
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

        const allCatalogMetrics = await this.catalogModel.search({
            projectUuid,
            userAttributes,
            context,
            catalogSearch: {
                type: CatalogType.Field,
                filter: CatalogFilter.Metrics,
            },
            tablesConfiguration: await this.projectModel.getTablesConfiguration(
                projectUuid,
            ),
        });

        const filteredMetrics = allCatalogMetrics.data.filter(
            (c): c is CatalogField => c.type === CatalogType.Field,
        );

        const allMetrics = await this.getMetrics({
            user,
            projectUuid,
            metrics: filteredMetrics.map((m) => ({
                tableName: m.tableName,
                metricName: m.name,
            })),
            userAttributes,
            addDefaultTimeDimension: false,
        });

        return getAvailableCompareMetrics(allMetrics);
    }

    async getSegmentDimensions(
        user: SessionUser,
        projectUuid: string,
        tableName: string,
        context: CatalogSearchContext,
    ): Promise<CompiledDimension[]> {
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

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            tableName,
        );

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const catalogDimensions = await this.catalogModel.search({
            projectUuid,
            userAttributes,
            exploreName: tableName,
            context,
            catalogSearch: {
                type: CatalogType.Field,
                filter: CatalogFilter.Dimensions,
            },
            tablesConfiguration: await this.projectModel.getTablesConfiguration(
                projectUuid,
            ),
        });

        const allDimensions = catalogDimensions.data
            .map((d) => explore?.tables?.[tableName]?.dimensions?.[d.name])
            .filter((d): d is CompiledDimension => d !== undefined);

        return getAvailableSegmentDimensions(allDimensions);
    }

    async deleteMetricsTreeEdge(
        user: SessionUser,
        projectUuid: string,
        edgePayload: ApiMetricsTreeEdgePayload,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('MetricsTree', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { sourceCatalogSearchUuid, targetCatalogSearchUuid } =
            edgePayload;

        await this.validateMetricsTreeEdge(projectUuid, edgePayload);

        return this.catalogModel.deleteMetricsTreeEdge({
            source_metric_catalog_search_uuid: sourceCatalogSearchUuid,
            target_metric_catalog_search_uuid: targetCatalogSearchUuid,
        });
    }

    async hasMetricsInCatalog(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
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

        // NOTE: No need to add user attribute filtering here since the catalog search already handles this for us. This is project-wide, not user-specific.
        return this.catalogModel.hasMetricsInCatalog(projectUuid);
    }
}
