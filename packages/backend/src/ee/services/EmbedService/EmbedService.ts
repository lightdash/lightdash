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
    DashboardFilters,
    DecodedEmbed,
    EmbedJwt,
    EmbedJwtSchema,
    EmbedUrl,
    Explore,
    ExploreError,
    FieldValueSearchResult,
    FilterableDimension,
    FilterGroupItem,
    FilterOperator,
    findFieldByIdInExplore,
    ForbiddenError,
    formatRows,
    getDashboardFiltersForTileAndTables,
    getDimensions,
    getErrorMessage,
    getFilterInteractivityValue,
    getItemId,
    InteractivityOptions,
    IntrinsicUserAttributes,
    isChartTile,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    isDimension,
    isExploreError,
    isFilterableDimension,
    isFilterInteractivityEnabled,
    isFilterRule,
    MetricQuery,
    NotExistsError,
    ParameterError,
    QueryExecutionContext,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    UserAttributeValueMap,
    type LightdashUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import jwt from 'jsonwebtoken';
import { isArray } from 'lodash';
import { nanoid as nanoidGenerator } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
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
    }

    async getEmbedUrl(
        user: SessionUser,
        projectUuid: string,
        { expiresIn, ...jwtData }: CreateEmbedJwt,
    ): Promise<EmbedUrl> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { encodedSecret } = await this.embedModel.get(projectUuid);
        const jwtToken = this.encodeJwt(
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

    async getConfig(projectUuid: string): Promise<DecodedEmbed> {
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
                'manage',
                subject('CompileProject', {
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

        return this.getConfig(projectUuid);
    }

    async updateDashboards(
        user: SessionUser,
        projectUuid: string,
        dashboardUuids: string[],
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.embedModel.updateDashboards(projectUuid, dashboardUuids);
    }

    private encodeJwt(
        jwtData: CreateEmbedJwt,
        encodedSecret: string,
        expiresIn: string,
    ) {
        const secret = this.encryptionUtil.decrypt(Buffer.from(encodedSecret));
        return jwt.sign(jwtData, secret, { expiresIn });
    }

    // TODO test expiration
    private decodeJwt(token: string, encodedSecret: string): EmbedJwt {
        try {
            const secret = this.encryptionUtil.decrypt(
                Buffer.from(encodedSecret),
            );
            const decodedToken = jwt.verify(token, secret) as EmbedJwt;
            // Alert if the token is not in the expected format so we can inform the org before enforcing validation
            try {
                EmbedJwtSchema.parse(decodedToken);
            } catch (e) {
                if (e instanceof z.ZodError) {
                    const zodErrors = e.issues
                        .map((issue) => issue.message)
                        .join(', ');
                    this.logger.error(
                        `Invalid embed token ${decodedToken.content.dashboardUuid}: ${zodErrors}`,
                    );
                }
                this.logger.error(
                    `Invalid embed token ${
                        decodedToken.content.dashboardUuid
                    }: ${getErrorMessage(e)}`,
                );
                Sentry.captureException(e);
            }
            return decodedToken;
        } catch (e) {
            if (e instanceof jwt.TokenExpiredError) {
                throw new ForbiddenError('Your embed token has expired.');
            }
            if (e instanceof z.ZodError) {
                const zodErrors = e.issues
                    .map((issue) => issue.message)
                    .join(', ');
                throw new ParameterError(`Invalid embed token: ${zodErrors}`);
            }
            throw e;
        }
    }

    static async _permissionsGetDashboard(
        dashboardUuid: string,
        dashboardUuids: string[],
    ) {
        if (!dashboardUuids.includes(dashboardUuid)) {
            throw new ForbiddenError(
                `Dashboard ${dashboardUuid} is not embedded`,
            );
        }
    }

    private async isFeatureEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ) {
        const isEnabled = await this.featureFlagModel.get({
            user,
            featureFlagId: CommercialFeatureFlags.Embedding,
        });
        if (!isEnabled.enabled) throw new ForbiddenError('Feature not enabled');
    }

    async getDashboard(
        projectUuid: string,
        embedToken: string,
        // TODO: WHY IS THIS OPTIONAL??
        checkPermissions: boolean = true,
    ): Promise<Dashboard & InteractivityOptions> {
        const { encodedSecret, dashboardUuids, user } =
            await this.embedModel.get(projectUuid);
        const decodedToken = this.decodeJwt(embedToken, encodedSecret);
        if (checkPermissions)
            await EmbedService._permissionsGetDashboard(
                decodedToken.content.dashboardUuid,
                dashboardUuids,
            );
        const dashboard = await this.dashboardModel.getById(
            decodedToken.content.dashboardUuid,
        );

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
        };
    }

    async getAvailableFiltersForSavedQueries(
        projectUuid: string,
        embedToken: string,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
        checkPermissions: boolean = true,
    ): Promise<DashboardAvailableFilters> {
        const { encodedSecret, dashboardUuids } = await this.embedModel.get(
            projectUuid,
        );
        const decodedToken = this.decodeJwt(embedToken, encodedSecret);

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

        const savedQueryUuids = savedChartUuidsAndTileUuids.map(
            ({ savedChartUuid }) => savedChartUuid,
        );

        if (checkPermissions)
            savedQueryUuids.map(async (chartUuid) =>
                this._permissionsGetChartAndResults(
                    projectUuid,
                    chartUuid,
                    dashboardUuids,
                    decodedToken.content.dashboardUuid,
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

    private async _permissionsGetChartAndResults(
        projectUuid: string,
        chartUuid: string,
        dashboardUuids: string[],
        dashboardUuid: string,
    ) {
        if (!dashboardUuids.includes(dashboardUuid)) {
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

    private async _getEmbedResults({
        organizationUuid,
        projectUuid,
        metricQuery,
        explore,
        queryTags,
        embedJwt,
    }: {
        organizationUuid: string;
        projectUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        queryTags: Record<string, string>;
        embedJwt: EmbedJwt;
    }) {
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );

        const { warehouseClient, sshTunnel } =
            await this.projectService._getWarehouseClient(
                projectUuid,
                credentials,
            );
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

        // Filter the explore access and fields based on the user attributes
        const filteredExplore = getFilteredExplore(explore, userAttributes);

        const compiledQuery = await ProjectService._compileQuery(
            metricQuery,
            filteredExplore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
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

    async getChartAndResults(
        projectUuid: string,
        embedToken: string,
        tileUuid: string,
        dashboardFilters?: DashboardFilters,
        checkPermissions: boolean = true,
    ) {
        const { encodedSecret, dashboardUuids, user } =
            await this.embedModel.get(projectUuid);

        const decodedToken = this.decodeJwt(embedToken, encodedSecret);

        const dashboard = await this.dashboardModel.getById(
            decodedToken.content.dashboardUuid,
        );

        const tile = dashboard.tiles
            .filter(isChartTile)
            .find(({ uuid }) => uuid === tileUuid);

        if (!tile) {
            throw new ParameterError(
                `Tile ${tileUuid} not found in dashboard ${decodedToken.content.dashboardUuid}`,
            );
        }
        const chartUuid = tile.properties.savedChartUuid;
        if (chartUuid === null) {
            throw new ParameterError(
                `Tile ${tileUuid} does not have a saved chart uuid`,
            );
        }

        const chart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid } = chart;
        await this.isFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid,
        });

        if (checkPermissions)
            await this._permissionsGetChartAndResults(
                projectUuid,
                chartUuid,
                dashboardUuids,
                decodedToken.content.dashboardUuid,
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
        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...addDashboardFiltersToMetricQuery(
                chart.metricQuery,
                appliedDashboardFilters,
            ),
        };

        const externalId = EmbedService.getExternalId(decodedToken, embedToken);
        this.analytics.track<EmbedQueryViewed>({
            anonymousId: 'embed',
            event: 'embed_query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                dashboardId: decodedToken.content.dashboardUuid,
                chartId: chartUuid,
                externalId,
            },
        });
        // Bigquery keys and values can contain only lowercase letters, numeric characters, underscores, and dashes
        const queryTags: Record<string, string> = {
            embed: 'true',
            external_id: externalId,
        };

        const { rows, cacheMetadata, fields } = await this._getEmbedResults({
            organizationUuid,
            projectUuid,
            metricQuery: metricQueryWithDashboardOverrides,
            explore,
            queryTags,
            embedJwt: decodedToken,
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

    // method to be moved to project service and reused on `projectService.searchFieldUniqueValues` and `embedService.searchFilterValues`
    async _getFieldValuesMetricQuery({
        projectUuid,
        table,
        initialFieldId,
        search,
        limit,
        filters,
    }: {
        projectUuid: string;
        table: string;
        initialFieldId: string;
        search: string;
        limit: number;
        filters: AndFilterGroup | undefined;
    }) {
        if (limit > this.lightdashConfig.query.maxLimit) {
            throw new ParameterError(
                `Query limit can not exceed ${this.lightdashConfig.query.maxLimit}`,
            );
        }

        let explore = await this.projectModel.findExploreByTableName(
            projectUuid,
            table,
        );
        let fieldId = initialFieldId;
        if (!explore) {
            // fallback: find explore by join alias and replace fieldId
            explore = await this.projectModel.findJoinAliasExplore(
                projectUuid,
                table,
            );
            if (explore && !isExploreError(explore)) {
                fieldId = initialFieldId.replace(table, explore.baseTable);
            }
        }

        if (!explore) {
            throw new NotExistsError(`Explore ${table} does not exist`);
        } else if (isExploreError(explore)) {
            throw new NotExistsError(`Explore ${table} has errors`);
        }

        const field = findFieldByIdInExplore(explore, fieldId);

        if (!field) {
            throw new NotExistsError(`Can't dimension with id: ${fieldId}`);
        }

        if (!isDimension(field)) {
            throw new ParameterError(
                `Searching by field is only available for dimensions, but ${fieldId} is a ${field.type}`,
            );
        }
        const autocompleteDimensionFilters: FilterGroupItem[] = [
            {
                id: uuidv4(),
                target: {
                    fieldId,
                },
                operator: FilterOperator.INCLUDE,
                values: [search],
            },
        ];
        if (filters) {
            const filtersCompatibleWithExplore = filters.and.filter(
                (filter) =>
                    isFilterRule(filter) &&
                    findFieldByIdInExplore(
                        explore as Explore,
                        filter.target.fieldId,
                    ),
            );
            autocompleteDimensionFilters.push(...filtersCompatibleWithExplore);
        }
        const metricQuery: MetricQuery = {
            exploreName: explore.name,
            dimensions: [getItemId(field)],
            metrics: [],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: autocompleteDimensionFilters,
                },
            },
            tableCalculations: [],
            sorts: [
                {
                    fieldId: getItemId(field),
                    descending: false,
                },
            ],
            limit,
        };
        return { metricQuery, explore, field };
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
        const { encodedSecret, dashboardUuids, user } =
            await this.embedModel.get(projectUuid);
        const embedJwt = this.decodeJwt(embedToken, encodedSecret);
        await EmbedService._permissionsGetDashboard(
            embedJwt.content.dashboardUuid,
            dashboardUuids,
        );
        const dashboard = await this.dashboardModel.getById(
            embedJwt.content.dashboardUuid,
        );
        const dashboardFilters = dashboard.filters.dimensions;
        const filter = dashboardFilters.find((f) => f.id === filterUuid);
        if (!filter) {
            throw new ParameterError(`Filter ${filterUuid} not found`);
        }

        const initialFieldId = filter.target.fieldId;
        const { metricQuery, explore, field } =
            await this._getFieldValuesMetricQuery({
                projectUuid,
                table: filter.target.tableName,
                initialFieldId,
                search,
                limit,
                filters,
            });

        const { rows, cacheMetadata } = await this._getEmbedResults({
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            metricQuery,
            explore,
            queryTags: {
                embed: 'true',
                external_id: EmbedService.getExternalId(embedJwt, embedToken),
            },
            embedJwt,
        });

        return {
            search,
            results: rows.map((row) => row[getItemId(field)]),
            refreshedAt: cacheMetadata.cacheUpdatedTime || new Date(),
            cached: cacheMetadata.cacheHit,
        };
    }
}
