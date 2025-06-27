import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    AndFilterGroup,
    CommercialFeatureFlags,
    CompiledDimension,
    CreateEmbed,
    CreateEmbedJwt,
    Dashboard,
    DashboardAvailableFilters,
    DashboardDAO,
    DashboardFilters,
    DateGranularity,
    DecodedEmbed,
    Embed,
    EmbedJwt,
    EmbedUrl,
    Explore,
    ExploreError,
    FieldValueSearchResult,
    FilterableDimension,
    ForbiddenError,
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
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    SortField,
    UpdateEmbed,
    UserAttributeValueMap,
} from '@lightdash/common';
import { isArray } from 'lodash';
import { nanoid as nanoidGenerator } from 'nanoid';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import {
    decodeLightdashJwt,
    encodeLightdashJwt,
} from '../../../auth/lightdashJwt';
import { LightdashConfig } from '../../../config/parseConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationModel } from '../../../models/OrganizationModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { BaseService } from '../../../services/BaseService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { getFilteredExplore } from '../../../services/UserAttributesService/UserAttributeUtils';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
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
        data: CreateEmbed,
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

    static async _permissionsGetDashboard(
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

    private async getDashboardUuidFromContent(
        decodedToken: EmbedJwt,
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
        embedToken: string,
        // TODO: WHY IS THIS OPTIONAL??
        checkPermissions: boolean = true,
    ): Promise<Dashboard & InteractivityOptions> {
        const { encodedSecret, dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const decodedToken = decodeLightdashJwt(embedToken, encodedSecret);
        const dashboardUuid = await this.getDashboardUuidFromContent(
            decodedToken,
            projectUuid,
        );

        if (checkPermissions)
            await EmbedService._permissionsGetDashboard(
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

        const externalId = EmbedService.getExternalId(decodedToken, embedToken);

        this.analytics.track<EmbedDashboardViewed>({
            anonymousId: 'embed',
            event: 'embed_dashboard.viewed',
            properties: {
                organizationId: dashboard.organizationUuid,
                projectId: dashboard.projectUuid,
                dashboardId: dashboard.uuid,
                externalId,
                context: decodedToken.content.isPreview
                    ? 'preview'
                    : 'production',
                tilesCount: dashboard.tiles.length,
                chartTilesCount: dashboard.tiles.filter(
                    isDashboardChartTileType,
                ).length,
                sqlChartTilesCount: dashboard.tiles.filter(
                    isDashboardSqlChartTile,
                ).length,
                canExportCsv: decodedToken.content.canExportCsv,
                canExportImages: decodedToken.content.canExportImages,
                canExportPagePdf: decodedToken.content.canExportPagePdf ?? true,
                canDateZoom: decodedToken.content.canDateZoom,
                ...(decodedToken.content.dashboardFiltersInteractivity
                    ? {
                          dashboardFiltersInteractivity: {
                              ...decodedToken.content
                                  .dashboardFiltersInteractivity,
                              // when value is boolean, convert it to FilterInteractivityValues so that we can track it consistently
                              enabled: getFilterInteractivityValue(
                                  decodedToken.content
                                      .dashboardFiltersInteractivity.enabled,
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
            dashboardFiltersInteractivity:
                decodedToken.content.dashboardFiltersInteractivity,
            canExportCsv: decodedToken.content.canExportCsv,
            canExportImages: decodedToken.content.canExportImages,
            canExportPagePdf: decodedToken.content.canExportPagePdf ?? true, // enabled by default for backwards compatibility
            canDateZoom: decodedToken.content.canDateZoom,
        };
    }

    async getAvailableFiltersForSavedQueries(
        projectUuid: string,
        embedToken: string,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
        checkPermissions: boolean = true,
    ): Promise<DashboardAvailableFilters> {
        const { encodedSecret, dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const decodedToken = decodeLightdashJwt(embedToken, encodedSecret);

        if (
            !isFilterInteractivityEnabled(
                decodedToken.content.dashboardFiltersInteractivity,
            )
        ) {
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

        const dashboardUuid = await this.getDashboardUuidFromContent(
            decodedToken,
            projectUuid,
        );

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

    private static getExternalId(decodedToken: EmbedJwt, embedToken: string) {
        return (
            decodedToken.user?.externalId ||
            decodedToken.iat?.toString() ||
            embedToken
        );
    }

    private async _getEmbedUserAttributes(
        organizationUuid: string,
        embedJwt: EmbedJwt,
    ) {
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
                          sanitizedValue = value.map((v) =>
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

    private async _runEmbedQuery({
        organizationUuid,
        projectUuid,
        metricQuery,
        explore,
        queryTags,
        embedJwt,
        dateZoomGranularity,
    }: {
        organizationUuid: string;
        projectUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        queryTags: Record<string, string>;
        embedJwt: EmbedJwt;
        dateZoomGranularity?: DateGranularity;
    }) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            explore,
        );

        const { userAttributes, intrinsicUserAttributes } =
            await this._getEmbedUserAttributes(organizationUuid, embedJwt);

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
        decodedToken: EmbedJwt,
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
            isFilterInteractivityEnabled(
                decodedToken.content.dashboardFiltersInteractivity,
            )
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
        embedToken: string,
        tileUuid: string,
        dashboardFilters?: DashboardFilters,
        dateZoomGranularity?: DateGranularity,
        dashboardSorts?: SortField[],
        checkPermissions: boolean = true,
    ) {
        const { encodedSecret, dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const decodedToken = decodeLightdashJwt(embedToken, encodedSecret);

        const dashboardUuid = await this.getDashboardUuidFromContent(
            decodedToken,
            projectUuid,
        );

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
            decodedToken,
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

        const externalId = EmbedService.getExternalId(decodedToken, embedToken);
        this.analytics.track<EmbedQueryViewed>({
            anonymousId: 'embed',
            event: 'embed_query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                dashboardId: dashboardUuid,
                chartId: chart.uuid,
                externalId,
            },
        });
        // Bigquery keys and values can contain only lowercase letters, numeric characters, underscores, and dashes
        const queryTags: Record<string, string> = {
            embed: 'true',
            external_id: externalId,
        };

        const { rows, cacheMetadata, fields } = await this._runEmbedQuery({
            organizationUuid,
            projectUuid,
            metricQuery: metricQueryWithDashboardOverrides,
            explore,
            queryTags,
            embedJwt: decodedToken,
            dateZoomGranularity,
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

    async calculateTotalFromSavedChart(
        embedToken: string,
        projectUuid: string,
        savedChartUuid: string,
        dashboardFilters?: DashboardFilters,
        invalidateCache?: boolean,
    ) {
        const { encodedSecret, dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const decodedToken = decodeLightdashJwt(embedToken, encodedSecret);

        const dashboardUuid = await this.getDashboardUuidFromContent(
            decodedToken,
            projectUuid,
        );

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
            decodedToken,
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

        const { warehouseClient } = await this._getWarehouseClient(
            projectUuid,
            explore,
        );

        const { userAttributes, intrinsicUserAttributes } =
            await this._getEmbedUserAttributes(
                dashboard.organizationUuid,
                decodedToken,
            );

        const { totalQuery: totalMetricQuery } =
            await this.projectService._getCalculateTotalQuery(
                userAttributes,
                intrinsicUserAttributes,
                explore,
                metricQuery,
                warehouseClient,
            );

        const { rows } = await this._runEmbedQuery({
            organizationUuid: dashboard.organizationUuid,
            projectUuid,
            metricQuery: totalMetricQuery,
            explore,
            queryTags: {},
            embedJwt: decodedToken,
        });

        if (rows.length === 0) {
            throw new NotFoundError('No results found');
        }

        const row = rows[0];

        return row;
    }

    async searchFilterValues({
        embedToken,
        projectUuid,
        filterUuid,
        search,
        limit,
        filters,
        forceRefresh,
    }: {
        embedToken: string;
        projectUuid: string;
        filterUuid: string;
        search: string;
        limit: number;
        filters: AndFilterGroup | undefined;
        forceRefresh: boolean;
    }): Promise<FieldValueSearchResult> {
        const { encodedSecret, dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const decodedToken = decodeLightdashJwt(embedToken, encodedSecret);
        const dashboardUuid = await this.getDashboardUuidFromContent(
            decodedToken,
            projectUuid,
        );
        await EmbedService._permissionsGetDashboard(
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
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            metricQuery,
            explore,
            queryTags: {
                embed: 'true',
                external_id: EmbedService.getExternalId(
                    decodedToken,
                    embedToken,
                ),
            },
            embedJwt: decodedToken,
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
