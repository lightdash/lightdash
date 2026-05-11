import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    AndFilterGroup,
    AnonymousAccount,
    ApiExecuteAsyncDashboardChartQueryResults,
    CalculateSubtotalsFromQuery,
    CalculateTotalFromQuery,
    CommercialFeatureFlags,
    CompiledDimension,
    CreateEmbedJwt,
    CreateEmbedRequestBody,
    DashboardAvailableFilters,
    DashboardDAO,
    DashboardFilters,
    DateGranularity,
    DateZoom,
    DecodedEmbed,
    Embed,
    EmbedContent,
    EmbedDashboard,
    EmbedUrl,
    ExecuteAsyncDashboardChartRequestParams,
    Explore,
    ExploreError,
    FieldValueSearchResult,
    FilterableDimension,
    ForbiddenError,
    formatRawRows,
    formatRows,
    getAvailableFilterFieldIds,
    getColumnTimezone,
    getDashboardFiltersForTileAndTables,
    getDimensionMapFromTables,
    getDimensions,
    getFilterInteractivityValue,
    getItemId,
    InteractivityOptions,
    IntrinsicUserAttributes,
    isChartContent,
    isDashboardChartTileType,
    isDashboardContent,
    isDashboardSlugContent,
    isDashboardSqlChartTile,
    isExploreError,
    isFilterableDimension,
    isFilterInteractivityEnabled,
    isParameterInteractivityEnabled,
    MetricQuery,
    NotFoundError,
    NotSupportedError,
    ParameterError,
    QueryExecutionContext,
    resolveQueryTimezone,
    RunQueryTags,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionAccount,
    SortField,
    UpdateEmbed,
    UserAccessControls,
    UserAttributeValueMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import { isArray } from 'lodash';
import { nanoid as nanoidGenerator } from 'nanoid';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { fromJwt } from '../../../auth/account';
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
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import {
    getAvailableParameterDefinitions,
    getDashboardParametersValuesMap,
} from '../../../services/ProjectService/parameters';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { getFilteredExplore } from '../../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../../utils';
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
    asyncQueryService: AsyncQueryService;
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

    private readonly asyncQueryService: AsyncQueryService;

    constructor(dependencies: Dependencies) {
        super();
        this.asyncQueryService = dependencies.asyncQueryService;
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
        account: SessionAccount,
        projectUuid: string,
        { expiresIn, ...jwtData }: CreateEmbedJwt,
    ): Promise<EmbedUrl> {
        const auditedAbility = this.createAuditedAbility(account);
        const { user } = account;
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            auditedAbility.cannot(
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

        // Generate different URL paths based on content type
        let urlPath: string;
        if (jwtData.content.type === 'chart') {
            urlPath = `/embed/${projectUuid}/chart/${jwtData.content.contentId}#${jwtToken}`;
        } else {
            urlPath = `/embed/${projectUuid}#${jwtToken}`;
        }

        const url = new URL(urlPath, this.lightdashConfig.siteUrl);
        return {
            url: url.href,
        };
    }

    async getConfig(
        account: SessionAccount,
        projectUuid: string,
    ): Promise<DecodedEmbed> {
        const auditedAbility = this.createAuditedAbility(account);
        const { user } = account;
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            auditedAbility.cannot(
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

    async createConfig(
        account: SessionAccount,
        projectUuid: string,
        data: CreateEmbedRequestBody,
    ): Promise<DecodedEmbed> {
        const auditedAbility = this.createAuditedAbility(account);
        const { user } = account;
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            auditedAbility.cannot(
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
            user.userUuid,
            data.dashboardUuids,
            this.lightdashConfig.embedding.allowAll.dashboards,
            data.chartUuids,
            this.lightdashConfig.embedding.allowAll.charts,
        );

        return this.getConfig(account, projectUuid);
    }

    async updateDashboards(
        account: SessionAccount,
        projectUuid: string,
        {
            dashboardUuids,
            allowAllDashboards,
        }: Pick<UpdateEmbed, 'dashboardUuids' | 'allowAllDashboards'>,
    ) {
        const auditedAbility = this.createAuditedAbility(account);
        const { user } = account;
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });
        if (
            auditedAbility.cannot(
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

    async updateConfig(
        account: SessionAccount,
        projectUuid: string,
        {
            dashboardUuids,
            allowAllDashboards,
            chartUuids,
            allowAllCharts,
        }: UpdateEmbed,
    ) {
        const auditedAbility = this.createAuditedAbility(account);
        const { user } = account;
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });

        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.embedModel.updateConfig(projectUuid, {
            dashboardUuids,
            allowAllDashboards,
            chartUuids,
            allowAllCharts,
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

        if (isDashboardContent(decodedToken.content)) {
            return decodedToken.content.dashboardUuid;
        }

        throw new ParameterError('JWT content is not of type dashboard');
    }

    /**
     * Meant to be used for {@link jwtAuthMiddleware} to extract the chart UUID from the JWT content.
     */
    async getChartFromJwt(decodedToken: CreateEmbedJwt, projectUuid: string) {
        if (!isChartContent(decodedToken.content)) {
            throw new ParameterError('JWT content is not of type chart');
        }

        const { contentId } = decodedToken.content;
        const chart = await this.savedChartModel.get(contentId);

        if (chart.projectUuid !== projectUuid) {
            throw new NotFoundError(
                `Chart ${contentId} not found in project ${projectUuid}`,
            );
        }

        return chart;
    }

    /**
     * Extract content UUID (dashboard or chart) from JWT based on content type
     */
    async getContentUuidFromJwt(
        decodedToken: CreateEmbedJwt,
        projectUuid: string,
    ): Promise<EmbedContent> {
        if (decodedToken.content.type === 'dashboard') {
            const dashboardUuid = await this.getDashboardUuidFromJwt(
                decodedToken,
                projectUuid,
            );
            return {
                dashboardUuid,
                type: 'dashboard',
                chartUuids: [],
                explores: [],
            };
        }

        if (decodedToken.content.type === 'chart') {
            const chart = await this.getChartFromJwt(decodedToken, projectUuid);
            return {
                dashboardUuid: undefined,
                chartUuids: [chart.uuid],
                type: 'chart',
                explores: [chart.tableName],
            };
        }

        throw new ParameterError(
            `Unknown content type: ${
                (decodedToken.content as { type: string }).type
            }`,
        );
    }

    async getDashboard(
        projectUuid: string,
        account: AnonymousAccount,
        {
            paletteUuid,
            checkPermissions = true,
        }: {
            paletteUuid?: string;
            checkPermissions?: boolean;
        } = {},
    ): Promise<EmbedDashboard> {
        const { data: decodedToken, source: embedToken } =
            account.authentication;
        const { dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const { dashboardUuid } = account.access.content;

        if (decodedToken.content.type !== 'dashboard') {
            throw new ForbiddenError('Not authorized for dashboard content');
        }

        if (!dashboardUuid) {
            throw new ParameterError('Dashboard ID is required');
        }

        if (checkPermissions)
            this.checkDashboardPermissions(
                {
                    dashboardUuids,
                    allowAllDashboards,
                },
                dashboardUuid,
            );

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        await this.isFeatureEnabled({
            userUuid: user?.userUuid ?? account.user.id,
            organizationUuid: dashboard.organizationUuid,
        });

        const externalId = account.user.id;

        if (!isDashboardContent(decodedToken.content)) {
            throw new ParameterError('JWT content is not of type dashboard');
        }
        const {
            isPreview,
            canExportCsv,
            canExportImages,
            canExportPagePdf,
            canDateZoom,
        } = decodedToken.content;
        // Embed paletteUuid query param overrides everything; otherwise fall back
        // through chart → dashboard → space → project → org via the resolver.
        let selectedPalette: {
            colors: string[];
            darkColors: string[] | null;
        } | null = null;
        if (paletteUuid) {
            const override = await this.organizationModel.findColorPalette(
                dashboard.organizationUuid,
                paletteUuid,
            );
            if (override) {
                selectedPalette = {
                    colors: override.colors,
                    darkColors: override.darkColors,
                };
            }
        } else {
            const resolved = await this.savedChartModel.resolveColorPalette({
                projectUuid: dashboard.projectUuid,
                dashboardUuid: dashboard.uuid,
            });
            selectedPalette = {
                colors: resolved.colors,
                darkColors: resolved.darkColors,
            };
        }

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
            inheritsFromOrgOrProject: true,
            access: [],
            dashboardFiltersInteractivity: account.access.filtering,
            parameterInteractivity: account.access.parameters,
            canExportCsv,
            canExportImages,
            canExportPagePdf: canExportPagePdf ?? true, // enabled by default for backwards compatibility
            canDateZoom,
            selectedPalette,
        };
    }

    async getAvailableFiltersForSavedQueries(
        projectUuid: string,
        account: AnonymousAccount,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
        checkPermissions: boolean = true,
    ): Promise<DashboardAvailableFilters> {
        const { dashboardUuid } = account.access.content;

        if (!dashboardUuid) {
            throw new ParameterError(
                'Dashboard ID is required for this operation',
            );
        }

        const { dashboardUuids, allowAllDashboards } =
            await this.embedModel.get(projectUuid);

        if (!isFilterInteractivityEnabled(account.access.filtering)) {
            // If dashboard filters interactivity is not enabled, we return an empty list
            return {
                savedQueryFilters: {},
                allFilterableFields: [],
                allFilterableMetrics: [],
                savedQueryMetricFilters: {},
            };
        }

        let allFilters: {
            uuid: string;
            filters: CompiledDimension[];
        }[] = [];

        const savedQueryUuids = savedChartUuidsAndTileUuids.map(
            ({ savedChartUuid }) => savedChartUuid,
        );

        if (checkPermissions) {
            await Promise.all(
                savedQueryUuids.map((chartUuid) =>
                    this._permissionsGetChartAndResults(
                        { dashboardUuids, allowAllDashboards },
                        projectUuid,
                        chartUuid,
                        dashboardUuid,
                    ),
                ),
            );
        }

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
            allFilterableMetrics: [],
            savedQueryMetricFilters: {},
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

        const chartExists =
            await this.dashboardModel.savedChartExistsInDashboard(
                projectUuid,
                dashboardUuid,
                chartUuid,
            );
        if (!chartExists) {
            throw new ForbiddenError(
                `This chart does not belong to dashboard ${dashboardUuid}`,
            );
        }
    }

    private async _getWarehouseClient(
        account: AnonymousAccount,
        projectUuid: string,
        explore: Explore,
    ) {
        // Resolve via ProjectService so OAuth tokens are refreshed before use
        // (e.g. Databricks oauth_m2m must exchange client_id+secret for an
        // access token — fetching the raw row from the model would yield an
        // empty `token` and crash the warehouse client).
        const credentials =
            await this.projectService.getWarehouseCredentialsForEmbed({
                projectUuid,
                account,
            });

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

    /**
     * Get all available parameter definitions for a project and explore
     * @param projectUuid - The UUID of the project
     * @param explore - The explore to get the parameters for
     * @returns Parameter definitions object
     */
    private async getAvailableParameters(
        projectUuid: string,
        explore: Explore,
    ): Promise<ParameterDefinitions> {
        const projectParameters =
            await this.projectService.projectParametersModel.find(projectUuid);

        return getAvailableParameterDefinitions(projectParameters, explore);
    }

    private async _runEmbedQuery({
        projectUuid,
        metricQuery,
        explore,
        queryTags,
        account,
        timezone,
        dateZoomGranularity,
        combinedParameters,
        useTimezoneAwareDateTrunc,
    }: {
        projectUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        queryTags: Omit<
            Required<RunQueryTags>,
            'user_uuid' | 'chart_uuid' | 'dashboard_uuid'
        > & {
            embed: 'true';
            external_id: string;
            chart_uuid?: string; // optional because query for filter autocomplete doesn't have chart uuid
            dashboard_uuid?: string; // optional for standalone chart embeds
        };
        account: AnonymousAccount;
        timezone: string;
        dateZoomGranularity?: DateGranularity | string;
        combinedParameters?: ParametersValuesMap;
        useTimezoneAwareDateTrunc: boolean;
    }) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            account,
            projectUuid,
            explore,
        );

        const { userAttributes, intrinsicUserAttributes } =
            this.getAccessControls(account);

        // Filter the explore access and fields based on the user attributes
        const filteredExplore = getFilteredExplore(explore, userAttributes);

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            filteredExplore,
        );

        const compiledQuery = await ProjectService._compileQuery({
            metricQuery,
            explore: filteredExplore,
            warehouseSqlBuilder: warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            timezone,
            dateZoom: dateZoomGranularity
                ? {
                      granularity: dateZoomGranularity,
                  }
                : undefined,
            parameters: combinedParameters,
            availableParameterDefinitions,
            useTimezoneAwareDateTrunc,
            columnTimezone: getColumnTimezone(warehouseClient.credentials),
        });

        const results =
            await this.projectService.getResultsFromCacheOrWarehouse({
                projectUuid,
                userUuid: null,
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
        const availableFieldIds = getAvailableFilterFieldIds(explore);

        let appliedDashboardFilters = getDashboardFiltersForTileAndTables(
            tileUuid,
            availableFieldIds,
            dashboard.filters,
        );
        if (
            dashboardFilters &&
            isFilterInteractivityEnabled(account.access.filtering)
        ) {
            appliedDashboardFilters = getDashboardFiltersForTileAndTables(
                tileUuid,
                availableFieldIds,
                dashboardFilters,
            );
        }

        return appliedDashboardFilters;
    }

    async executeAsyncDashboardTileQuery({
        account,
        projectUuid,
        tileUuid,
        dashboardFilters,
        dateZoom,
        invalidateCache,
        dashboardSorts,
        parameters,
        pivotResults,
        limit,
    }: {
        account: AnonymousAccount;
        projectUuid: string;
        tileUuid: string;
    } & Pick<
        ExecuteAsyncDashboardChartRequestParams,
        | 'dashboardFilters'
        | 'dashboardSorts'
        | 'pivotResults'
        | 'invalidateCache'
        | 'dateZoom'
        | 'parameters'
        | 'limit'
    >): Promise<ApiExecuteAsyncDashboardChartQueryResults> {
        const { dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);

        const { dashboardUuid } = account.access.content;

        if (!dashboardUuid) {
            throw new ParameterError(
                'Dashboard ID is required for this operation',
            );
        }

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        const chart = await this._getChartFromDashboardTiles(
            dashboard,
            tileUuid,
        );

        const { organizationUuid } = chart;
        await this.isFeatureEnabled({
            userUuid: user?.userUuid ?? account.user.id,
            organizationUuid,
        });

        await this._permissionsGetChartAndResults(
            { allowAllDashboards, dashboardUuids },
            projectUuid,
            chart.uuid,
            dashboardUuid,
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
            tileUuid,
            dashboardFilters,
        );

        // Record analytics event
        this.analytics.trackAccount<EmbedQueryViewed>(account, {
            event: 'embed_query.executed',
            properties: {
                projectId: projectUuid,
                dashboardId: dashboardUuid,
                chartId: chart.uuid,
            },
        });

        const dashboardParameters = getDashboardParametersValuesMap(dashboard);
        const acceptedUserParameters =
            isParameterInteractivityEnabled(account.access.parameters) &&
            parameters
                ? parameters
                : {};
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            explore,
            acceptedUserParameters,
            dashboardParameters,
        );

        // Execute using AsyncQueryService method with embed context
        return this.asyncQueryService.executeAsyncDashboardChartQuery({
            account,
            projectUuid,
            chartUuid: chart.uuid,
            tileUuid,
            dashboardSorts: dashboardSorts ?? [],
            dashboardUuid,
            dashboardFilters: appliedDashboardFilters,
            dateZoom,
            invalidateCache,
            limit,
            context: QueryExecutionContext.EMBED,
            parameters: combinedParameters,
            pivotResults,
        });
    }

    async getChartAndResults(
        projectUuid: string,
        account: AnonymousAccount,
        tileUuid: string,
        dashboardFilters?: DashboardFilters,
        dateZoomGranularity?: DateGranularity | string,
        dashboardSorts?: SortField[],
        userParameters?: ParametersValuesMap,
        checkPermissions: boolean = true,
    ) {
        const { dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);

        const { dashboardUuid } = account.access.content;

        if (!dashboardUuid) {
            throw new ParameterError(
                'Dashboard ID is required for this operation',
            );
        }

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        const chart = await this._getChartFromDashboardTiles(
            dashboard,
            tileUuid,
        );

        const { organizationUuid } = chart;
        await this.isFeatureEnabled({
            userUuid: user?.userUuid ?? account.user.id,
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

        const acceptedUserParameters =
            isParameterInteractivityEnabled(account.access.parameters) &&
            userParameters
                ? userParameters
                : {};
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            explore,
            acceptedUserParameters,
            dashboardParameters,
        );

        const projectTimezone =
            await this.projectService.getQueryTimezoneForProject(projectUuid);
        const timezone = resolveQueryTimezone(
            metricQueryWithDashboardOverrides,
            projectTimezone,
            null,
        );

        const isTimezoneSupportEnabled =
            await this.projectService.isTimezoneSupportEnabled({
                userUuid: user?.userUuid ?? account.user.id,
                organizationUuid,
            });
        const displayTimezone = isTimezoneSupportEnabled ? timezone : undefined;

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
            timezone,
            dateZoomGranularity,
            combinedParameters,
            useTimezoneAwareDateTrunc: isTimezoneSupportEnabled,
        });

        return {
            appliedDashboardFilters: undefined,
            chart: {
                ...chart,
                inheritsFromOrgOrProject: true,
                access: [],
            },
            explore,
            rows: formatRows(
                rows,
                fields,
                undefined,
                undefined,
                displayTimezone,
            ),
            cacheMetadata,
            metricQuery: metricQueryWithDashboardOverrides,
            fields,
        };
    }

    /**
     * Common setup logic for saved chart calculations in embed context.
     * Supports both chart embeds (direct chart access) and dashboard embeds (chart via tile).
     */
    private async _prepareSavedChartForCalculation(
        account: AnonymousAccount,
        projectUuid: string,
        savedChartUuid: string,
        dashboardFilters?: DashboardFilters,
    ) {
        const { type, dashboardUuid, chartUuids } = account.access.content;

        // Handle chart embeds (direct chart access)
        if (type === 'chart') {
            // Validate that the requested chart matches the embedded chart
            if (!chartUuids.includes(savedChartUuid)) {
                throw new ForbiddenError(
                    `Not authorized to access chart ${savedChartUuid}`,
                );
            }

            const chart = await this.savedChartModel.get(savedChartUuid);

            if (chart.projectUuid !== projectUuid) {
                throw new NotFoundError(
                    `Chart ${savedChartUuid} not found in project ${projectUuid}`,
                );
            }

            const explore = await this.projectModel.getExploreFromCache(
                projectUuid,
                chart.tableName,
            );

            if (isExploreError(explore)) {
                throw new ForbiddenError(
                    `Explore ${chart.tableName} on project ${projectUuid} has errors : ${explore.errors}`,
                );
            }

            return {
                dashboardUuid: undefined,
                chart,
                explore,
                metricQuery: chart.metricQuery,
            };
        }

        // Handle dashboard embeds (chart via tile)

        if (!dashboardUuid) {
            throw new ParameterError(
                'Dashboard ID is required for this operation',
            );
        }

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

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
        userParameters?: ParametersValuesMap,
        invalidateCache?: boolean,
    ) {
        const { dashboardUuid, chart, explore, metricQuery } =
            await this._prepareSavedChartForCalculation(
                account,
                projectUuid,
                savedChartUuid,
                dashboardFilters,
            );

        const { userAttributes, intrinsicUserAttributes } =
            this.getAccessControls(account);
        const filteredExplore = getFilteredExplore(explore, userAttributes);

        // For chart embeds, dashboardUuid is undefined - use empty parameters
        const dashboardParameters = dashboardUuid
            ? getDashboardParametersValuesMap(
                  await this.dashboardModel.getByIdOrSlug(dashboardUuid),
              )
            : {};

        const acceptedUserParameters =
            isParameterInteractivityEnabled(account.access.parameters) &&
            userParameters
                ? userParameters
                : {};
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            explore,
            acceptedUserParameters,
            dashboardParameters,
        );

        try {
            const row = await this.asyncQueryService.calculateMetricQueryTotal({
                account,
                projectUuid,
                organizationUuid: chart.organizationUuid,
                metricQuery,
                explore: filteredExplore,
                context: QueryExecutionContext.CALCULATE_TOTAL,
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
                parameters: combinedParameters,
                invalidateCache,
                userAccessControls: {
                    userAttributes,
                    intrinsicUserAttributes,
                },
            });

            if (!row) {
                throw new NotFoundError('No results found');
            }

            return row as Record<string, number>;
        } catch (e) {
            if (e instanceof NotSupportedError) {
                this.logger.warn(e.message);
                return {}; // no totals
            }
            throw e;
        }
    }

    async calculateSubtotalsFromSavedChart(
        account: AnonymousAccount,
        projectUuid: string,
        savedChartUuid: string,
        dashboardFilters?: DashboardFilters,
        userParameters?: ParametersValuesMap,
        columnOrder?: string[],
        pivotDimensions?: string[],
        invalidateCache?: boolean,
        dateZoom?: DateZoom,
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

        // For chart embeds, dashboardUuid is undefined - use empty parameters
        const dashboardParameters = dashboardUuid
            ? getDashboardParametersValuesMap(
                  await this.dashboardModel.getByIdOrSlug(dashboardUuid),
              )
            : {};

        const acceptedUserParameters =
            isParameterInteractivityEnabled(account.access.parameters) &&
            userParameters
                ? userParameters
                : {};
        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            explore,
            acceptedUserParameters,
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
            dateZoom,
            invalidateCache,
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
        dateZoom?: DateZoom,
        invalidateCache?: boolean,
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

        if (dimensionGroupsToSubtotal.length === 0) {
            return {};
        }

        const { userAttributes, intrinsicUserAttributes } =
            this.getAccessControls(account);

        return this.asyncQueryService.calculateMetricQuerySubtotals({
            account,
            projectUuid,
            organizationUuid: organizationUuid || '',
            metricQuery,
            explore: getFilteredExplore(explore, userAttributes),
            context: QueryExecutionContext.CALCULATE_SUBTOTAL,
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
            columnOrder,
            pivotDimensions,
            parameters: combinedParameters,
            dateZoom,
            invalidateCache,
            userAccessControls: {
                userAttributes,
                intrinsicUserAttributes,
            },
        });
    }

    /**
     * Calculate totals from a raw metric query in embed context.
     * This is used when exploring data directly (not from a saved chart).
     */
    async calculateTotalFromQuery(
        account: AnonymousAccount,
        projectUuid: string,
        data: CalculateTotalFromQuery,
    ): Promise<Record<string, number>> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            data.explore,
        );

        if (isExploreError(explore)) {
            throw new ForbiddenError(
                `Explore ${data.explore} on project ${projectUuid} has errors: ${explore.errors}`,
            );
        }

        const { userAttributes, intrinsicUserAttributes } =
            this.getAccessControls(account);
        const filteredExplore = getFilteredExplore(explore, userAttributes);

        // Handle parameter interactivity - only accept user parameters if enabled
        const acceptedUserParameters =
            isParameterInteractivityEnabled(account.access.parameters) &&
            data.parameters
                ? data.parameters
                : {};

        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            explore,
            acceptedUserParameters,
        );

        try {
            const row = await this.asyncQueryService.calculateMetricQueryTotal({
                account,
                projectUuid,
                organizationUuid,
                metricQuery: data.metricQuery,
                explore: filteredExplore,
                context: QueryExecutionContext.CALCULATE_TOTAL,
                queryTags: {
                    embed: 'true',
                    external_id: account.user.id,
                    project_uuid: projectUuid,
                    organization_uuid: organizationUuid,
                    dashboard_uuid: '',
                    explore_name: data.explore,
                    query_context: QueryExecutionContext.CALCULATE_TOTAL,
                },
                parameters: combinedParameters,
                invalidateCache: data.invalidateCache,
                userAccessControls: {
                    userAttributes,
                    intrinsicUserAttributes,
                },
            });

            if (!row) {
                throw new NotFoundError('No results found');
            }

            return row as Record<string, number>;
        } catch (e) {
            if (e instanceof NotSupportedError) {
                this.logger.warn(e.message);
                return {}; // no totals
            }
            throw e;
        }
    }

    /**
     * Calculate subtotals from a raw metric query in embed context.
     * This is used when exploring data directly (not from a saved chart).
     */
    async calculateSubtotalsFromQuery(
        account: AnonymousAccount,
        projectUuid: string,
        data: CalculateSubtotalsFromQuery,
    ) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            data.explore,
        );

        if (isExploreError(explore)) {
            throw new ForbiddenError(
                `Explore ${data.explore} on project ${projectUuid} has errors: ${explore.errors}`,
            );
        }

        // Handle parameter interactivity - only accept user parameters if enabled
        const acceptedUserParameters =
            isParameterInteractivityEnabled(account.access.parameters) &&
            data.parameters
                ? data.parameters
                : {};

        const combinedParameters = await this.projectService.combineParameters(
            projectUuid,
            explore,
            acceptedUserParameters,
        );

        return this._calculateSubtotalsForEmbed(
            account,
            projectUuid,
            explore,
            data.metricQuery,
            data.columnOrder,
            data.pivotDimensions,
            organizationUuid,
            undefined, // no chartUuid for raw query
            undefined, // no dashboardUuid for raw query
            combinedParameters,
            data.dateZoom,
            data.invalidateCache,
        );
    }

    async searchFilterValues({
        account,
        projectUuid,
        filterUuid,
        search,
        limit,
        filters,
        forceRefresh,
        tableName: fallbackTableName,
        fieldId: fallbackFieldId,
    }: {
        account: AnonymousAccount;
        projectUuid: string;
        filterUuid: string;
        search: string;
        limit: number;
        filters: AndFilterGroup | undefined;
        forceRefresh: boolean;
        tableName?: string;
        fieldId?: string;
    }): Promise<FieldValueSearchResult> {
        const { dashboardUuids, allowAllDashboards, user } =
            await this.embedModel.get(projectUuid);
        const { dashboardUuid } = account.access.content;

        if (!dashboardUuid) {
            throw new ParameterError(
                'Dashboard ID is required for this operation',
            );
        }

        this.checkDashboardPermissions(
            {
                dashboardUuids,
                allowAllDashboards,
            },
            dashboardUuid,
        );
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const dashboardFilters = dashboard.filters.dimensions;
        const filter = dashboardFilters.find((f) => f.id === filterUuid);

        // For SDK-injected filters, the UUID is dynamically generated and
        // won't exist in saved dashboard filters. Fall back to tableName/fieldId
        // from the request body, but only if the field is within the dashboard's
        // explores (to prevent arbitrary field enumeration).
        let resolvedTableName = filter?.target.tableName;
        let resolvedFieldId = filter?.target.fieldId;

        if (!resolvedTableName || !resolvedFieldId) {
            if (!fallbackTableName || !fallbackFieldId) {
                throw new ParameterError(
                    `Filter ${filterUuid} not found and no fallback field provided`,
                );
            }

            // Validate the fallback field is within the dashboard's explores
            const chartTiles = dashboard.tiles.filter(isDashboardChartTileType);
            const savedChartUuids = [
                ...new Set(
                    chartTiles
                        .map((tile) => tile.properties.savedChartUuid)
                        .filter(Boolean),
                ),
            ];
            const savedCharts =
                await this.savedChartModel.getInfoForAvailableFilters(
                    savedChartUuids as string[],
                );
            const explores = await Promise.all(
                [...new Set(savedCharts.map((chart) => chart.tableName))].map(
                    (tableName) =>
                        this.projectModel.getExploreFromCache(
                            projectUuid,
                            tableName,
                        ),
                ),
            );

            const isFieldInDashboardExplores = explores.some(
                (explore) =>
                    !isExploreError(explore) &&
                    fallbackTableName in explore.tables &&
                    fallbackFieldId in
                        getDimensionMapFromTables(explore.tables),
            );

            if (!isFieldInDashboardExplores) {
                throw new ParameterError(
                    `Field ${fallbackFieldId} is not available on this dashboard`,
                );
            }

            resolvedTableName = fallbackTableName;
            resolvedFieldId = fallbackFieldId;
        }

        const { metricQuery, explore, field } =
            await this.projectService._getFieldValuesMetricQuery({
                projectUuid,
                table: resolvedTableName,
                initialFieldId: resolvedFieldId,
                search,
                limit,
                filters,
            });

        const projectTimezone =
            await this.projectService.getQueryTimezoneForProject(projectUuid);
        const timezone = resolveQueryTimezone(
            metricQuery,
            projectTimezone,
            null,
        );

        const useTimezoneAwareDateTrunc =
            await this.projectService.isTimezoneSupportEnabled({
                userUuid: user?.userUuid ?? account.user.id,
                organizationUuid: dashboard.organizationUuid,
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
            timezone,
            useTimezoneAwareDateTrunc,
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

    async getAccountFromJwt(projectUuid: string, encodedJwt: string) {
        return wrapSentryTransaction(
            'EmbedService.getAccountFromJwt',
            { project_uuid: projectUuid },
            async () => {
                const embed = await this.getEmbeddingByProjectId(projectUuid);
                const decodedToken = decodeLightdashJwt(
                    encodedJwt,
                    embed.encodedSecret,
                );
                const userAttributesPromise = this.getEmbedUserAttributes(
                    embed.organization.organizationUuid,
                    decodedToken,
                );
                const contentPromise = this.getContentUuidFromJwt(
                    decodedToken,
                    projectUuid,
                );
                const [content, userAttributes] = await Promise.all([
                    contentPromise,
                    userAttributesPromise,
                ]);

                if (!content) {
                    throw new NotFoundError(
                        'Cannot verify JWT. Content not found',
                    );
                }

                return fromJwt({
                    decodedToken,
                    source: encodedJwt,
                    embed,
                    content,
                    userAttributes,
                });
            },
        );
    }
}
