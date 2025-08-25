import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    AndFilterGroup,
    AnonymousAccount,
    CommercialFeatureFlags,
    CompiledDimension,
    CreateEmbedJwt,
    CreateEmbedRequestBody,
    Dashboard,
    DashboardAvailableFilters,
    DashboardDAO,
    DashboardFilters,
    DateGranularity,
    DecodedEmbed,
    Embed,
    EmbedUrl,
    Explore,
    ExploreError,
    FieldValueSearchResult,
    FilterableDimension,
    ForbiddenError,
    formatRawRows,
    formatRows,
    getDashboardFiltersForTileAndTables,
    getDimensions,
    getFilterInteractivityValue,
    getItemId,
    InteractivityOptions,
    IntrinsicUserAttributes,
    isDashboardChartTileType,
    isDashboardSlugContent,
    isDashboardSqlChartTile,
    isExploreError,
    isFilterableDimension,
    isFilterInteractivityEnabled,
    MetricQuery,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    RunQueryTags,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    SortField,
    UpdateEmbed,
    UserAccessControls,
    UserAttributeValueMap,
    type ParametersValuesMap,
} from '@lightdash/common';
import { isArray } from 'lodash';
import { nanoid as nanoidGenerator } from 'nanoid';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { encodeLightdashJwt } from '../../../auth/lightdashJwt';
import { LightdashConfig } from '../../../config/parseConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationModel } from '../../../models/OrganizationModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { BaseService } from '../../../services/BaseService';
import { getDashboardParametersValuesMap } from '../../../services/ProjectService/getDashboardParametersValuesMap';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { getFilteredExplore } from '../../../services/UserAttributesService/UserAttributeUtils';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { SubtotalsCalculator } from '../../../utils/SubtotalsCalculator';
import { EmbedDashboardViewed, EmbedQueryViewed } from '../../analytics';
import { EmbedModel } from '../../models/EmbedModel';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    encryptionUtil: EncryptionUtil;
    embedModel: EmbedModel;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    projectModel: ProjectModel;
    userAttributesModel: UserAttributesModel;
    projectService: ProjectService;
    featureFlagModel: FeatureFlagModel;
    organizationModel: OrganizationModel;
};

export class EmbedService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly embedModel: EmbedModel;

    private readonly dashboardModel: DashboardModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly projectModel: ProjectModel;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly projectService: ProjectService;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly organizationModel: OrganizationModel;

    constructor(dependencies: Dependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.embedModel = dependencies.embedModel;
        this.dashboardModel = dependencies.dashboardModel;
        this.savedChartModel = dependencies.savedChartModel;
        this.projectModel = dependencies.projectModel;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.encryptionUtil = dependencies.encryptionUtil;
        this.userAttributesModel = dependencies.userAttributesModel;
        this.projectService = dependencies.projectService;
        this.featureFlagModel = dependencies.featureFlagModel;
        this.organizationModel = dependencies.organizationModel;
    }

    async getEmbedUrl(
        user: SessionUser,
        projectUuid: string,
        { expiresIn, ...jwtData }: CreateEmbedJwt,
    ): Promise<EmbedUrl> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { encodedSecret } = await this.embedModel.get(projectUuid);
        const jwtToken = encodeLightdashJwt(
            jwtData,
            encodedSecret,
            expiresIn || '1h',
        );

        const url = new URL(
            `/embed/${projectUuid}#${jwtToken}`,
            this.lightdashConfig.siteUrl,
        );
        return {
            url: url.href,
        };
    }

    async getConfig(
        user: SessionUser,
        projectUuid: string,
    ): Promise<DecodedEmbed> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const config = await this.embedModel.get(projectUuid);
        return {
            ...config,
            encodedSecret: undefined,
            secret: this.encryptionUtil.decrypt(
                Buffer.from(config.encodedSecret),
            ),
        };
    }

    async saveConfig(
        user: SessionUser,
        projectUuid: string,
        data: CreateEmbedRequestBody,
    ): Promise<DecodedEmbed> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const secret = nanoidGenerator();
        const encodedSecret = this.encryptionUtil.encrypt(secret);
        await this.embedModel.save(
            projectUuid,
            encodedSecret,
            data.dashboardUuids,
            user.userUuid,
        );

        return this.getConfig(user, projectUuid);
    }

    async updateDashboards(
        user: SessionUser,
        projectUuid: string,
        { dashboardUuids, allowAllDashboards }: UpdateEmbed,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.embedModel.updateDashboards(projectUuid, {
            dashboardUuids,
            allowAllDashboards,
        });
    }

    // eslint-disable-next-line class-methods-use-this
    checkDashboardPermissions(
        embed: Pick<Embed, 'dashboardUuids' | 'allowAllDashboards'>,
        dashboardUuid: string,
    ) {
        if (
            !embed.allowAllDashboards &&
            !embed.dashboardUuids.includes(dashboardUuid)
        ) {
            throw new ForbiddenError(
                `Dashboard ${dashboardUuid} is not embedded`,
            );
        }
    }

    private async isFeatureEnabled(user: {
        userUuid: string;
        organizationUuid: string;
    }) {
        const organization = await this.organizationModel.get(
            user.organizationUuid,
        );

        if (!organization) {
            throw new ForbiddenError('Organization not found');
        }

        const isEnabled = await this.featureFlagModel.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
                organizationName: organization.name,
            },
            featureFlagId: CommercialFeatureFlags.Embedding,
        });

        if (!isEnabled.enabled) throw new ForbiddenError('Feature not enabled');
    }

    /**
     * Meant to be used for {@link jwtAuthMiddleware} to extract the dashboard UUID from the JWT content.
     */
    async getDashboardUuidFromJwt(
        decodedToken: CreateEmbedJwt,
        projectUuid: string,
    ) {
        if (isDashboardSlugContent(decodedToken.content)) {
            const dashboard = (
                await this.dashboardModel.find({
                    projectUuid,
                    slug: decodedToken.content.dashboardSlug,
                })
            )[0];

            if (!dashboard) {
                throw new NotFoundError(
                    `Dashboard ${decodedToken.content.dashboardSlug} not found`,
                );
            }

            return dashboard.uuid;
        }

        return decodedToken.content.dashboardUuid;
    }

    async getDashboard(
        projectUuid: string,
        account: AnonymousAccount,
        // TODO: WHY IS THIS OPTIONAL??
        checkPermissions: boolean = true,
    ): Promise<Dashboard & InteractivityOptions> {
        const { data: decodedToken, source: embedToken } =
            account.authentication;
        const { dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const dashboardUuid = account.access.dashboardId;

        if (checkPermissions)
            this.checkDashboardPermissions(
                {
                    dashboardUuids,
                    allowAllDashboards,
                },
                dashboardUuid,
            );

        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid: dashboard.organizationUuid,
        });

        const externalId = account.user.id;
        const {
            isPreview,
            canExportCsv,
            canExportImages,
            canExportPagePdf,
            canDateZoom,
        } = decodedToken.content;

        this.analytics.trackAccount<EmbedDashboardViewed>(account, {
            event: 'embed_dashboard.viewed',
            properties: {
                projectId: dashboard.projectUuid,
                dashboardId: dashboard.uuid,
                context: isPreview ? 'preview' : 'production',
                tilesCount: dashboard.tiles.length,
                chartTilesCount: dashboard.tiles.filter(
                    isDashboardChartTileType,
                ).length,
                sqlChartTilesCount: dashboard.tiles.filter(
                    isDashboardSqlChartTile,
                ).length,
                canExportCsv,
                canExportImages,
                canExportPagePdf: canExportPagePdf ?? true,
                canDateZoom,
                ...(account.access.filtering
                    ? {
                          dashboardFiltersInteractivity: {
                              ...account.access.filtering,
                              // when value is boolean, convert it to FilterInteractivityValues so that we can track it consistently
                              enabled: getFilterInteractivityValue(
                                  account.access.filtering.enabled,
                              ),
                          },
                      }
                    : {}),
            },
        });
        return {
            ...dashboard,
            isPrivate: false,
            access: [],
            dashboardFiltersInteractivity: account.access.filtering,
            canExportCsv,
            canExportImages,
            canExportPagePdf: canExportPagePdf ?? true, // enabled by default for backwards compatibility
            canDateZoom,
        };
    }

    async getAvailableFiltersForSavedQueries(
        projectUuid: string,
        account: AnonymousAccount,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
        checkPermissions: boolean = true,
    ): Promise<DashboardAvailableFilters> {
        const dashboardUuid = account.access.dashboardId;
        const { dashboardUuids, allowAllDashboards } =
            await this.embedModel.get(projectUuid);

        if (!isFilterInteractivityEnabled(account.access.filtering)) {
            // If dashboard filters interactivity is not enabled, we return an empty list
            return {
                savedQueryFilters: {},
                allFilterableFields: [],
            };
        }

        let allFilters: {
            uuid: string;
            filters: CompiledDimension[];
        }[] = [];

        const savedQueryUuids = savedChartUuidsAndTileUuids.map(
            ({ savedChartUuid }) => savedChartUuid,
        );

        if (checkPermissions)
            savedQueryUuids.map(async (chartUuid) =>
                this._permissionsGetChartAndResults(
                    { dashboardUuids, allowAllDashboards },
                    projectUuid,
                    chartUuid,
                    dashboardUuid,
                ),
            );

        const savedCharts =
            await this.savedChartModel.getInfoForAvailableFilters(
                savedQueryUuids,
            );

        const exploreCacheKeys: Record<string, boolean> = {};
        const exploreCache: Record<string, Explore | ExploreError> = {};

        const explorePromises = savedCharts.reduce<
            Promise<{ key: string; explore: Explore | ExploreError }>[]
        >((acc, chart) => {
            const key = chart.tableName;
            if (!exploreCacheKeys[key]) {
                const exploreId = chart.tableName;
                const cachedExplore = this.projectModel.getExploreFromCache(
                    projectUuid,
                    exploreId,
                );
                acc.push(cachedExplore.then((explore) => ({ key, explore })));
                exploreCacheKeys[key] = true;
            }
            return acc;
        }, []);

        const [resolvedExplores] = await Promise.all([
            Promise.all(explorePromises),
        ]);

        resolvedExplores.forEach(({ key, explore }) => {
            exploreCache[key] = explore;
        });

        const filterPromises = savedCharts.map(async (savedChart) => {
            const explore = exploreCache[savedChart.tableName];
            if (isExploreError(explore))
                return { uuid: savedChart.uuid, filters: [] };
            const filters = getDimensions(explore).filter(
                (field) => isFilterableDimension(field) && !field.hidden,
            );

            return { uuid: savedChart.uuid, filters };
        });

        allFilters = await Promise.all(filterPromises);

        const allFilterableFields: FilterableDimension[] = [];
        const filterIndexMap: Record<string, number> = {};

        allFilters.forEach((filterSet) => {
            filterSet.filters.forEach((filter) => {
                const fieldId = getItemId(filter);
                if (!(fieldId in filterIndexMap)) {
                    filterIndexMap[fieldId] = allFilterableFields.length;
                    allFilterableFields.push(filter);
                }
            });
        });

        const savedQueryFilters = savedChartUuidsAndTileUuids.reduce<
            DashboardAvailableFilters['savedQueryFilters']
        >((acc, savedChartUuidAndTileUuid) => {
            const filterResult = allFilters.find(
                (result) =>
                    result.uuid === savedChartUuidAndTileUuid.savedChartUuid,
            );
            if (!filterResult || !filterResult.filters.length) return acc;

            const filterIndexes = filterResult.filters.map(
                (filter) => filterIndexMap[getItemId(filter)],
            );
            return {
                ...acc,
                [savedChartUuidAndTileUuid.tileUuid]: filterIndexes,
            };
        }, {});

        return {
            savedQueryFilters,
            allFilterableFields,
        };
    }

    /**
     * Meant for use in {@link jwtAuthMiddleware} should not be called locally from the class.
     */
    async getEmbedUserAttributes(
        organizationUuid: string,
        embedJwt: CreateEmbedJwt,
    ): Promise<UserAccessControls> {
        const orgUserAttributes = await this.userAttributesModel.find({
            organizationUuid,
        });
        const defaultUserAttributes =
            orgUserAttributes.reduce<UserAttributeValueMap>((acc, curr) => {
                acc[curr.name] = curr.attributeDefault
                    ? [curr.attributeDefault]
                    : [];
                return acc;
            }, {});
        const embedTokenUserAttributes = embedJwt.userAttributes
            ? Object.entries(
                  embedJwt.userAttributes,
              ).reduce<UserAttributeValueMap>((acc, [key, value]) => {
                  if (value !== null && value !== undefined) {
                      let sanitizedValue: string[];
                      if (typeof value === 'string') {
                          sanitizedValue = [value];
                      } else if (isArray(value)) {
                          sanitizedValue = (value as unknown[]).map((v) =>
                              typeof v === 'string' ? v : JSON.stringify(v),
                          );
                      } else {
                          sanitizedValue = [JSON.stringify(value)];
                      }
                      acc[key] = sanitizedValue;
                  }
                  return acc;
              }, {})
            : {};

        const userAttributes = {
            ...defaultUserAttributes,
            ...embedTokenUserAttributes,
        };

        const intrinsicUserAttributes: IntrinsicUserAttributes = {
            email: embedJwt.user?.email,
        };

        return { userAttributes, intrinsicUserAttributes };
    }

    private async _permissionsGetChartAndResults(
        embed: Pick<Embed, 'dashboardUuids' | 'allowAllDashboards'>,
        projectUuid: string,
        chartUuid: string,
        dashboardUuid: string,
    ) {
        const { allowAllDashboards, dashboardUuids } = embed;
        if (!allowAllDashboards && !dashboardUuids.includes(dashboardUuid)) {
            throw new ForbiddenError(
                `Dashboard ${dashboardUuid} is not embedded`,
            );
        }

        const chartInDashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            chartUuid,
        );
        const chartInDashboardUuids = chartInDashboards.map((d) => d.uuid);
        if (!chartInDashboardUuids.includes(dashboardUuid)) {
            throw new ForbiddenError(
                `This chart does not belong to dashboard ${dashboardUuid}`,
            );
        }
    }

    private async _getWarehouseClient(projectUuid: string, explore: Explore) {
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );

        const { warehouseClient, sshTunnel } =
            await this.projectService._getWarehouseClient(
                projectUuid,
                credentials,
                {
                    snowflakeVirtualWarehouse: explore.warehouse,
                    databricksCompute: explore.databricksCompute,
                },
            );

        return { warehouseClient, sshTunnel };
    }

    // eslint-disable-next-line class-methods-use-this
    private getAccessControls(account: AnonymousAccount): UserAccessControls {
        const { userAttributes, intrinsicUserAttributes } =
            account.access.controls ?? {};
        if (!userAttributes || !intrinsicUserAttributes) {
            throw new ForbiddenError(
                'User attributes are required for embed queries',
            );
        }
        return { userAttributes, intrinsicUserAttributes };
    }

    private async _runEmbedQuery({
        projectUuid,
        metricQuery,
        explore,
        queryTags,
        account,
        dateZoomGranularity,
        combinedParameters,
    }: {
        projectUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        queryTags: Omit<Required<RunQueryTags>, 'user_uuid' | 'chart_uuid'> & {
            embed: 'true';
            external_id: string;
            chart_uuid?: string; // optional because query for filter autocomplete doesn't have chart uuid
        };
        account: AnonymousAccount;
        dateZoomGranularity?: DateGranularity;
        combinedParameters?: ParametersValuesMap;
    }) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            explore,
        );

        const { userAttributes, intrinsicUserAttributes } =
            this.getAccessControls(account);

        // Filter the explore access and fields based on the user attributes
        const filteredExplore = getFilteredExplore(explore, userAttributes);

        const compiledQuery = await ProjectService._compileQuery(
            metricQuery,
            filteredExplore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
            dateZoomGranularity
                ? {
                      granularity: dateZoomGranularity,
                  }
                : undefined,
            undefined,
            combinedParameters,
        );

        const results =
            await this.projectService.getResultsFromCacheOrWarehouse({
                projectUuid,
                context: QueryExecutionContext.EMBED,
                warehouseClient,
                metricQuery,
                query: compiledQuery.query,
                queryTags,
                invalidateCache: false,
            });
        await sshTunnel.disconnect();
        return { ...results, fields: compiledQuery.fields };
    }

    private async _getChartFromDashboardTiles(
        dashboard: DashboardDAO,
        tileUuid: string,
    ) {
        const tile = dashboard.tiles
            .filter(isDashboardChartTileType)
            .find(({ uuid }) => uuid === tileUuid);

        if (!tile) {
            throw new ParameterError(
                `Tile ${tileUuid} not found in dashboard ${dashboard.uuid}`,
            );
        }
        const chartUuid = tile.properties.savedChartUuid;
        if (chartUuid === null) {
            throw new ParameterError(
                `Tile ${tileUuid} does not have a saved chart uuid`,
            );
        }

        const chart = await this.savedChartModel.get(chartUuid);

        return chart;
    }

    // eslint-disable-next-line class-methods-use-this
    private async _getAppliedDashboardFilters(
        account: AnonymousAccount,
        explore: Explore,
        dashboard: DashboardDAO,
        tileUuid: string,
        dashboardFilters?: DashboardFilters,
    ) {
        const tables = Object.keys(explore.tables);

        let appliedDashboardFilters = getDashboardFiltersForTileAndTables(
            tileUuid,
            tables,
            dashboard.filters,
        );
        if (
            dashboardFilters &&
            isFilterInteractivityEnabled(account.access.filtering)
        ) {
            appliedDashboardFilters = getDashboardFiltersForTileAndTables(
                tileUuid,
                tables,
                dashboardFilters,
            );
        }

        return appliedDashboardFilters;
    }

    async getChartAndResults(
        projectUuid: string,
        account: AnonymousAccount,
        tileUuid: string,
        dashboardFilters?: DashboardFilters,
        dateZoomGranularity?: DateGranularity,
        dashboardSorts?: SortField[],
        checkPermissions: boolean = true,
    ) {
        const { dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);

        const dashboardUuid = account.access.dashboardId;
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        const chart = await this._getChartFromDashboardTiles(
            dashboard,
            tileUuid,
        );

        const { organizationUuid } = chart;
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });

        if (checkPermissions)
            await this._permissionsGetChartAndResults(
                { allowAllDashboards, dashboardUuids },
                projectUuid,
                chart.uuid,
                dashboardUuid,
            );

        const exploreId = chart.tableName;
        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            exploreId,
        );

        if (isExploreError(explore)) {
            throw new ForbiddenError(
                `Explore ${exploreId} on project ${projectUuid} has errors : ${explore.errors}`,
            );
        }

        const appliedDashboardFilters = await this._getAppliedDashboardFilters(
            account,
            explore,
            dashboard,
            tileUuid,
            dashboardFilters,
        );

        const metricQueryWithDashboardSorts =
            dashboardSorts && dashboardSorts.length > 0
                ? {
                      ...chart.metricQuery,
                      sorts: dashboardSorts,
                  }
                : chart.metricQuery;

        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...addDashboardFiltersToMetricQuery(
                metricQueryWithDashboardSorts,
                appliedDashboardFilters,
                explore,
            ),
        };

        const externalId = account.user.id;
        this.analytics.trackAccount<EmbedQueryViewed>(account, {
            event: 'embed_query.executed',
            properties: {
                projectId: projectUuid,
                dashboardId: dashboardUuid,
                chartId: chart.uuid,
            },
        });

        const dashboardParameters = getDashboardParametersValuesMap(dashboard);

        // No parameters are passed in embed requests, just combine the saved parameters
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            {},
            dashboardParameters,
        );

        const { rows, cacheMetadata, fields } = await this._runEmbedQuery({
            projectUuid,
            metricQuery: metricQueryWithDashboardOverrides,
            explore,
            queryTags: {
                embed: 'true',
                external_id: externalId,
                project_uuid: projectUuid,
                organization_uuid: organizationUuid,
                chart_uuid: chart.uuid,
                dashboard_uuid: dashboardUuid,
                explore_name: chart.tableName,
                query_context: QueryExecutionContext.EMBED,
            },
            account,
            dateZoomGranularity,
            combinedParameters,
        });

        return {
            appliedDashboardFilters: undefined,
            chart: {
                ...chart,
                isPrivate: false,
                access: [],
            },
            explore,
            rows: formatRows(rows, fields),
            cacheMetadata,
            metricQuery: metricQueryWithDashboardOverrides,
            fields,
        };
    }

    /**
     * Common setup logic for saved chart calculations in embed context
     */
    private async _prepareSavedChartForCalculation(
        account: AnonymousAccount,
        projectUuid: string,
        savedChartUuid: string,
        dashboardFilters?: DashboardFilters,
    ) {
        const dashboardUuid = account.access.dashboardId;
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        const tile = dashboard.tiles
            .filter(isDashboardChartTileType)
            .find(
                ({ properties }) =>
                    properties.savedChartUuid === savedChartUuid,
            );

        if (!tile) {
            throw new ParameterError(
                `Tile for saved chart ${savedChartUuid} not found`,
            );
        }

        if (!tile.properties.savedChartUuid) {
            throw new ParameterError(
                `Tile ${savedChartUuid} does not have a saved chart uuid`,
            );
        }

        const chart = await this._getChartFromDashboardTiles(
            dashboard,
            tile.uuid,
        );

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            chart.tableName,
        );

        if (isExploreError(explore)) {
            throw new ForbiddenError(
                `Explore ${chart.tableName} on project ${projectUuid} has errors : ${explore.errors}`,
            );
        }

        const appliedDashboardFilters = await this._getAppliedDashboardFilters(
            account,
            explore,
            dashboard,
            tile.uuid,
            dashboardFilters,
        );
        const metricQuery = appliedDashboardFilters
            ? addDashboardFiltersToMetricQuery(
                  chart.metricQuery,
                  appliedDashboardFilters,
              )
            : chart.metricQuery;

        return {
            dashboardUuid,
            chart,
            explore,
            metricQuery,
        };
    }

    async calculateTotalFromSavedChart(
        account: AnonymousAccount,
        projectUuid: string,
        savedChartUuid: string,
        dashboardFilters?: DashboardFilters,
        invalidateCache?: boolean,
    ) {
        const { dashboardUuid, chart, explore, metricQuery } =
            await this._prepareSavedChartForCalculation(
                account,
                projectUuid,
                savedChartUuid,
                dashboardFilters,
            );

        const { warehouseClient } = await this._getWarehouseClient(
            projectUuid,
            explore,
        );

        const { userAttributes, intrinsicUserAttributes } =
            this.getAccessControls(account);

        const { totalQuery: totalMetricQuery } =
            await this.projectService._getCalculateTotalQuery(
                userAttributes,
                intrinsicUserAttributes,
                explore,
                metricQuery,
                warehouseClient,
            );

        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const dashboardParameters = getDashboardParametersValuesMap(dashboard);

        // No parameters are passed in embed requests, just combine the saved parameters
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            {},
            dashboardParameters,
        );

        const { rows } = await this._runEmbedQuery({
            projectUuid,
            metricQuery: totalMetricQuery,
            explore,
            queryTags: {
                embed: 'true',
                external_id: account.user.id,
                project_uuid: projectUuid,
                organization_uuid: chart.organizationUuid,
                chart_uuid: chart.uuid,
                dashboard_uuid: dashboardUuid,
                explore_name: chart.tableName,
                query_context: QueryExecutionContext.CALCULATE_TOTAL,
            },
            account,
            combinedParameters,
        });

        if (rows.length === 0) {
            throw new NotFoundError('No results found');
        }

        const row = rows[0];

        return row;
    }

    async calculateSubtotalsFromSavedChart(
        account: AnonymousAccount,
        projectUuid: string,
        savedChartUuid: string,
        dashboardFilters?: DashboardFilters,
        columnOrder?: string[],
        pivotDimensions?: string[],
        invalidateCache?: boolean,
    ) {
        const { dashboardUuid, chart, explore, metricQuery } =
            await this._prepareSavedChartForCalculation(
                account,
                projectUuid,
                savedChartUuid,
                dashboardFilters,
            );

        // If columnOrder is not provided, derive it from the chart's metricQuery
        const finalColumnOrder = columnOrder || [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...(metricQuery.additionalMetrics?.map((m) => m.name) || []),
        ];

        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const dashboardParameters = getDashboardParametersValuesMap(dashboard);

        // No parameters are passed in embed requests, just combine the saved parameters
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            {},
            dashboardParameters,
        );

        return this._calculateSubtotalsForEmbed(
            account,
            projectUuid,
            explore,
            metricQuery,
            finalColumnOrder,
            pivotDimensions,
            chart.organizationUuid,
            chart.uuid,
            dashboardUuid,
            combinedParameters,
        );
    }

    private async _calculateSubtotalsForEmbed(
        account: AnonymousAccount,
        projectUuid: string,
        explore: Explore,
        metricQuery: MetricQuery,
        columnOrder: string[],
        pivotDimensions?: string[],
        organizationUuid?: string,
        chartUuid?: string,
        dashboardUuid?: string,
        combinedParameters?: ParametersValuesMap,
    ) {
        // Use the shared utility to prepare dimension groups
        const { dimensionGroupsToSubtotal, analyticsData } =
            SubtotalsCalculator.prepareDimensionGroups(
                metricQuery,
                columnOrder,
                pivotDimensions,
            );

        // Track analytics for embed context
        this.analytics.trackAccount(account, {
            event: 'embed_query.subtotal',
            properties: {
                projectId: projectUuid,
                dashboardId: dashboardUuid,
                chartId: chartUuid,
                organizationId: organizationUuid,
                exploreName: explore.name,
                ...analyticsData,
            },
        });

        // Run the query for each dimension group using embed query runner
        const subtotalsPromises = dimensionGroupsToSubtotal.map<
            Promise<[string, Record<string, unknown>[]]>
        >(async (subtotalDimensions) => {
            let subtotals: Record<string, unknown>[] = [];

            try {
                // Use utility to create properly configured subtotal query
                const { metricQuery: subtotalMetricQuery } =
                    SubtotalsCalculator.createSubtotalQueryConfig(
                        metricQuery,
                        subtotalDimensions,
                        pivotDimensions,
                    );

                const { rows, fields } = await this._runEmbedQuery({
                    projectUuid,
                    metricQuery: subtotalMetricQuery,
                    explore,
                    queryTags: {
                        embed: 'true',
                        external_id: account.user.id,
                        project_uuid: projectUuid,
                        organization_uuid: organizationUuid || '',
                        chart_uuid: chartUuid || '',
                        dashboard_uuid: dashboardUuid || '',
                        explore_name: explore.name,
                        query_context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                    },
                    account,
                    combinedParameters,
                });

                // Format raw rows (this matches the logic in ProjectService)
                subtotals = formatRawRows(rows, fields) as Record<
                    string,
                    number
                >[];
            } catch (e) {
                this.logger.error(
                    `Error running subtotal query for dimensions ${subtotalDimensions.join(
                        ',',
                    )}`,
                );
            }

            return [
                SubtotalsCalculator.getSubtotalKey(subtotalDimensions),
                subtotals,
            ] satisfies [string, Record<string, unknown>[]];
        });

        const subtotalsEntries = await Promise.all(subtotalsPromises);
        return SubtotalsCalculator.formatSubtotalEntries(subtotalsEntries);
    }

    async searchFilterValues({
        account,
        projectUuid,
        filterUuid,
        search,
        limit,
        filters,
        forceRefresh,
    }: {
        account: AnonymousAccount;
        projectUuid: string;
        filterUuid: string;
        search: string;
        limit: number;
        filters: AndFilterGroup | undefined;
        forceRefresh: boolean;
    }): Promise<FieldValueSearchResult> {
        const { dashboardUuids, allowAllDashboards } =
            await this.embedModel.get(projectUuid);
        const dashboardUuid = account.access.dashboardId;
        this.checkDashboardPermissions(
            {
                dashboardUuids,
                allowAllDashboards,
            },
            dashboardUuid,
        );
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const dashboardFilters = dashboard.filters.dimensions;
        const filter = dashboardFilters.find((f) => f.id === filterUuid);
        if (!filter) {
            throw new ParameterError(`Filter ${filterUuid} not found`);
        }

        const initialFieldId = filter.target.fieldId;
        const { metricQuery, explore, field } =
            await this.projectService._getFieldValuesMetricQuery({
                projectUuid,
                table: filter.target.tableName,
                initialFieldId,
                search,
                limit,
                filters,
            });

        const { rows, cacheMetadata } = await this._runEmbedQuery({
            projectUuid: dashboard.projectUuid,
            metricQuery,
            explore,
            queryTags: {
                embed: 'true',
                external_id: account.user.id,
                project_uuid: projectUuid,
                organization_uuid: dashboard.organizationUuid,
                dashboard_uuid: dashboardUuid,
                explore_name: explore.name,
                query_context: QueryExecutionContext.FILTER_AUTOCOMPLETE,
            },
            account,
        });

        return {
            search,
            results: rows.map((row) => row[getItemId(field)]),
            refreshedAt: cacheMetadata.cacheUpdatedTime || new Date(),
            cached: cacheMetadata.cacheHit,
        };
    }

    async getEmbeddingByProjectId(projectUuid: string) {
        return this.embedModel.get(projectUuid);
    }
}
