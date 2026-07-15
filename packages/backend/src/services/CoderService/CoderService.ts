import { subject } from '@casl/ability';
import {
    Account,
    AlertAsCode,
    AlreadyExistsError,
    ApiAlertAsCodeListResponse,
    ApiAlertAsCodeUpsertResponse,
    ApiChartAsCodeListResponse,
    ApiDashboardAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeUpsertResponse,
    ApiScheduledDeliveryAsCodeListResponse,
    ApiScheduledDeliveryAsCodeUpsertResponse,
    ApiVirtualViewAsCodeListResponse,
    ApiVirtualViewAsCodeUpsertResponse,
    assertUnreachable,
    ChartAsCode,
    ChartAsCodeInternalization,
    ChartGoogleSheetsSyncAsCode,
    ChartScheduledDeliveryAsCode,
    ChartSummary,
    ContentAsCodeType,
    ContentType,
    CreateSavedChart,
    CreateSchedulerTarget,
    currentVersion,
    DashboardAsCode,
    DashboardAsCodeInternalization,
    DashboardChartTileAsCode,
    DashboardDAO,
    DashboardFilterRule,
    DashboardGoogleSheetsSyncAsCode,
    DashboardMarkdownTileAsCode,
    DashboardScheduledDeliveryAsCode,
    DashboardSqlChartTileAsCode,
    DashboardTile,
    DashboardTileAsCode,
    DashboardTileTarget,
    DashboardTileTypes,
    DimensionType,
    Explore,
    ExploreType,
    ForbiddenError,
    friendlyName,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    getParameterReferences,
    isChartScheduler,
    isCustomSqlDimension,
    isDashboardScheduler,
    isEmailTarget,
    isExploreError,
    isGoogleChatTarget,
    isMsTeamsTarget,
    isSchedulerCsvOptions,
    isSchedulerGsheetsOptions,
    isSchedulerImageOptions,
    isSlackTarget,
    isSqlTableCalculation,
    NotFoundError,
    NotificationFrequency,
    ParameterError,
    Project,
    ProjectType,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    ScheduledDeliveryAsCode,
    ScheduledDeliveryFormatAsCode,
    ScheduledDeliveryTargetAsCode,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    snakeCaseName,
    Space,
    SpaceAsCode,
    SpaceMemberRole,
    SqlChartAsCode,
    UpdatedByUser,
    VirtualViewAsCode,
    type ContentVerificationInfo,
    type CustomDimension,
    type DashboardConfig,
    type DashboardTileWithSlug,
    type DateZoomConfig,
    type DateZoomTileTarget,
    type FilterGroup,
    type FilterGroupInput,
    type FilterGroupItem,
    type FilterGroupItemInput,
    type FilterRule,
    type Filters,
    type FiltersInput,
    type GoogleSheetsSyncAsCode,
    type SpaceSummaryBase,
    type TableCalculation,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { ProjectService } from '../ProjectService/ProjectService';
import { PromoteService } from '../PromoteService/PromoteService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { paginateAsCode } from './pagination';

type ContentAsCodeSpaceContentMetadata = {
    savedChartUuid?: string;
    dashboardUuid?: string;
    savedSqlUuid?: string | null;
};

type ContentAsCodeSqlPermissionCheckResult = {
    check: 'customSqlDimension' | 'sqlTableCalculation';
    message: string;
};

type CurrentChartSqlItems = {
    metricQuery: {
        customDimensions?: CustomDimension[];
        tableCalculations?: TableCalculation[];
    };
};

type CoderServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerModel: SchedulerModel;
    schedulerService: SchedulerService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
    schedulerClient: SchedulerClient;
    promoteService: PromoteService;
    spacePermissionService: SpacePermissionService;
    contentVerificationModel: ContentVerificationModel;
    projectService?: ProjectService;
};

type UpsertContentAsCodeOptions = {
    skipSpaceCreate?: boolean;
    publicSpaceCreate?: boolean;
    force?: boolean;
    spaceNames?: Record<string, string>;
    mode?: 'upsert' | 'create';
};

const normalizeFilterGroupItem = (
    item: FilterGroupItemInput,
): FilterGroupItem => {
    if ('or' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            or: item.or.map(normalizeFilterGroupItem),
        };
    }
    if ('and' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            and: item.and.map(normalizeFilterGroupItem),
        };
    }
    return { ...(item as FilterRule), id: item.id ?? uuidv4() };
};

const normalizeFilterGroup = (
    group: FilterGroupInput | undefined,
): FilterGroup | undefined => {
    if (!group) return undefined;
    return normalizeFilterGroupItem(group) as FilterGroup;
};

const normalizeFilterIds = (filters: FiltersInput): Filters => ({
    dimensions: normalizeFilterGroup(filters.dimensions),
    metrics: normalizeFilterGroup(filters.metrics),
    tableCalculations: normalizeFilterGroup(filters.tableCalculations),
});

const stripFilterGroupItemIds = (
    item: FilterGroupItemInput,
): FilterGroupItemInput => {
    if ('or' in item) {
        return { or: item.or.map(stripFilterGroupItemIds) };
    }
    if ('and' in item) {
        return { and: item.and.map(stripFilterGroupItemIds) };
    }
    const { id, ...filterRule } = item;
    return filterRule;
};

const stripFilterIds = (
    filters: FiltersInput | undefined,
): FiltersInput | null => {
    if (!filters) return null;
    const result: FiltersInput = {};
    if (filters.dimensions) {
        result.dimensions = stripFilterGroupItemIds(
            filters.dimensions,
        ) as FilterGroupInput;
    }
    if (filters.metrics) {
        result.metrics = stripFilterGroupItemIds(
            filters.metrics,
        ) as FilterGroupInput;
    }
    if (filters.tableCalculations) {
        result.tableCalculations = stripFilterGroupItemIds(
            filters.tableCalculations,
        ) as FilterGroupInput;
    }
    return result;
};

type AnyChartTile = Extract<
    DashboardTileAsCode | DashboardTile,
    {
        type: DashboardTileTypes.SAVED_CHART | DashboardTileTypes.SQL_CHART;
    }
>;

const isAnyChartTile = (
    tile: DashboardTileAsCode | DashboardTile,
): tile is AnyChartTile =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART;

export class CoderService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    savedSqlModel: SavedSqlModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerModel: SchedulerModel;

    schedulerService: SchedulerService;

    savedChartService: SavedChartService;

    dashboardService: DashboardService;

    schedulerClient: SchedulerClient;

    promoteService: PromoteService;

    spacePermissionService: SpacePermissionService;

    contentVerificationModel: ContentVerificationModel;

    projectService?: ProjectService;

    static getChartContentAsCodePermissionChecks(
        nextChart: ChartAsCode,
        currentChart?: CurrentChartSqlItems,
    ): ContentAsCodeSqlPermissionCheckResult[] {
        const checks: ContentAsCodeSqlPermissionCheckResult[] = [];
        const currentMetricQuery = currentChart?.metricQuery;

        const currentSqlDimensionsById = new Map(
            (currentMetricQuery?.customDimensions ?? [])
                .filter(isCustomSqlDimension)
                .map((dimension) => [dimension.id, dimension]),
        );
        const hasNewOrChangedSqlDimension = (
            nextChart.metricQuery.customDimensions ?? []
        )
            .filter(isCustomSqlDimension)
            .some((dimension) => {
                const current = currentSqlDimensionsById.get(dimension.id);
                return !current || current.sql !== dimension.sql;
            });

        if (hasNewOrChangedSqlDimension) {
            checks.push({
                check: 'customSqlDimension',
                message:
                    'User cannot upload content with new or modified custom SQL dimensions',
            });
        }

        const currentSqlTableCalculationsByName = new Map(
            (currentMetricQuery?.tableCalculations ?? [])
                .filter(isSqlTableCalculation)
                .map((calculation) => [calculation.name, calculation]),
        );
        const hasNewOrChangedSqlTableCalculation = (
            nextChart.metricQuery.tableCalculations ?? []
        )
            .filter(isSqlTableCalculation)
            .some((calculation) => {
                const current = currentSqlTableCalculationsByName.get(
                    calculation.name,
                );
                return !current || current.sql !== calculation.sql;
            });

        if (hasNewOrChangedSqlTableCalculation) {
            checks.push({
                check: 'sqlTableCalculation',
                message:
                    'User cannot upload content with new or modified SQL table calculations',
            });
        }

        return checks;
    }

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        savedChartModel,
        savedSqlModel,
        dashboardModel,
        spaceModel,
        schedulerModel,
        schedulerService,
        savedChartService,
        dashboardService,
        schedulerClient,
        promoteService,
        spacePermissionService,
        contentVerificationModel,
        projectService,
    }: CoderServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.savedSqlModel = savedSqlModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerModel = schedulerModel;
        this.schedulerService = schedulerService;
        this.savedChartService = savedChartService;
        this.dashboardService = dashboardService;
        this.schedulerClient = schedulerClient;
        this.promoteService = promoteService;
        this.spacePermissionService = spacePermissionService;
        this.contentVerificationModel = contentVerificationModel;
        this.projectService = projectService;
    }

    private static transformVirtualView(
        virtualView: Explore,
    ): VirtualViewAsCode | null {
        const table = virtualView.tables[virtualView.baseTable];
        const dimensions = table ? Object.values(table.dimensions) : [];
        const dimensionNames = dimensions.map(({ name }) => name);
        if (
            !virtualView.name?.trim() ||
            !virtualView.label?.trim() ||
            !table?.sqlTable ||
            table.name !== virtualView.name ||
            virtualView.baseTable !== virtualView.name ||
            !table.sqlTable.startsWith('(') ||
            !table.sqlTable.endsWith(')') ||
            dimensionNames.some((name) => !name?.trim()) ||
            new Set(dimensionNames).size !== dimensionNames.length ||
            dimensions.some(
                ({ type }) => !Object.values(DimensionType).includes(type),
            )
        ) {
            return null;
        }

        return {
            contentType: ContentAsCodeType.VIRTUAL_VIEW,
            version: currentVersion,
            slug: virtualView.name,
            name: virtualView.label,
            sql: table.sqlTable.slice(1, -1),
            columns: dimensions
                .map(({ name, type }) => ({ reference: name, type }))
                .sort((left, right) =>
                    left.reference.localeCompare(right.reference),
                ),
            parameters: virtualView.savedParameterValues ?? null,
        };
    }

    async getVirtualViews(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
    ): Promise<ApiVirtualViewAsCodeListResponse['results']> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download virtual views',
            );
        }

        const requested = slugs ? new Set(slugs) : null;
        const cached =
            await this.projectModel.findVirtualViewsFromCache(projectUuid);
        const virtualViews: VirtualViewAsCode[] = [];
        const skipped: ApiVirtualViewAsCodeListResponse['results']['skipped'] =
            [];
        Object.values(cached)
            .sort((left, right) => left.name.localeCompare(right.name))
            .forEach((explore) => {
                if (requested && !requested.has(explore.name)) return;
                if (
                    isExploreError(explore) ||
                    explore.type !== ExploreType.VIRTUAL
                ) {
                    skipped.push({
                        slug: explore.name,
                        reason: 'Cached virtual view is malformed',
                    });
                    return;
                }
                const transformed = CoderService.transformVirtualView(explore);
                if (transformed) virtualViews.push(transformed);
                else {
                    skipped.push({
                        slug: explore.name,
                        reason: 'Virtual view SQL is not stored as a subquery',
                    });
                }
            });

        const found = new Set([
            ...virtualViews.map(({ slug }) => slug),
            ...skipped.map(({ slug }) => slug),
        ]);
        return {
            virtualViews,
            skipped,
            missingSlugs: slugs?.filter((slug) => !found.has(slug)) ?? [],
        };
    }

    async upsertVirtualView(
        account: Account,
        projectUuid: string,
        slug: string,
        virtualView: VirtualViewAsCode,
        force = false,
    ): Promise<ApiVirtualViewAsCodeUpsertResponse['results']> {
        if (virtualView.contentType !== ContentAsCodeType.VIRTUAL_VIEW) {
            throw new ParameterError('Invalid virtual view contentType');
        }
        if (virtualView.version !== currentVersion) {
            throw new ParameterError(
                `Unsupported virtual view version ${virtualView.version}`,
            );
        }
        if (slug !== virtualView.slug) {
            throw new ParameterError(
                'Virtual view path and body slugs must match',
            );
        }
        if (
            !slug.trim() ||
            !virtualView.name.trim() ||
            !virtualView.sql.trim()
        ) {
            throw new ParameterError(
                'Virtual view slug, name, and SQL are required',
            );
        }
        if (
            snakeCaseName(slug) !== slug ||
            slug.includes('/') ||
            slug.includes('\\') ||
            Array.from(slug).some((character) => character.charCodeAt(0) < 32)
        ) {
            throw new ParameterError(
                'Virtual view slug must be a canonical snake_case identifier',
            );
        }
        if (virtualView.columns.length === 0) {
            throw new ParameterError(
                'Virtual view must define at least one column',
            );
        }
        const references = virtualView.columns.map(
            ({ reference }) => reference,
        );
        if (
            references.some((reference) => !reference.trim()) ||
            new Set(references).size !== references.length
        ) {
            throw new ParameterError(
                'Virtual view column references must be non-empty and unique',
            );
        }
        const dimensionTypes = new Set(Object.values(DimensionType));
        if (virtualView.columns.some(({ type }) => !dimensionTypes.has(type))) {
            throw new ParameterError(
                'Virtual view columns must use valid types',
            );
        }
        const parameterReferences = new Set(
            getParameterReferences(virtualView.sql),
        );
        const unusedParameters = Object.keys(
            virtualView.parameters ?? {},
        ).filter((name) => !parameterReferences.has(name));
        if (unusedParameters.length > 0) {
            throw new ParameterError(
                `Virtual view contains values for unreferenced parameters: ${unusedParameters.join(', ')}`,
            );
        }

        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                    metadata: { slug },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!this.projectService) {
            throw new Error(
                'ProjectService is required to upload virtual views',
            );
        }
        await this.projectService.validateVirtualViewParameterReferences(
            projectUuid,
            virtualView.sql,
            virtualView.parameters ?? undefined,
        );

        const existingByName = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            [slug],
        );
        const existing = existingByName[slug];
        if (
            existing &&
            (isExploreError(existing) || existing.type !== ExploreType.VIRTUAL)
        ) {
            throw new AlreadyExistsError(
                `An explore named "${slug}" already exists and cannot be adopted`,
            );
        }
        const normalized = {
            ...virtualView,
            columns: [...virtualView.columns].sort((left, right) =>
                left.reference.localeCompare(right.reference),
            ),
        };
        if (existing && existing.type === ExploreType.VIRTUAL) {
            const current = CoderService.transformVirtualView(existing);
            if (!current && !force) {
                throw new ParameterError(
                    'Malformed existing virtual view requires force to replace',
                );
            }
            if (current && isEqual(current, normalized)) {
                return { action: PromotionAction.NO_CHANGES };
            }
            if (current && !force) {
                const desiredColumns = new Map(
                    normalized.columns.map((column) => [
                        column.reference,
                        column.type,
                    ]),
                );
                const destructive = current.columns.filter(
                    (column) =>
                        desiredColumns.get(column.reference) !== column.type,
                );
                if (destructive.length > 0) {
                    throw new ParameterError(
                        `Destructive virtual view column changes require force: ${destructive.map(({ reference }) => reference).join(', ')}`,
                    );
                }
            }
            await this.projectService.updateVirtualView(
                account,
                projectUuid,
                slug,
                {
                    name: normalized.name,
                    sql: normalized.sql,
                    columns: normalized.columns,
                    parameterValues: normalized.parameters ?? undefined,
                },
                false,
                existing,
            );
            return { action: PromotionAction.UPDATE };
        }

        await this.projectService.createVirtualView(
            account,
            projectUuid,
            {
                name: slug,
                label: normalized.name,
                sql: normalized.sql,
                columns: normalized.columns,
                parameterValues: normalized.parameters ?? undefined,
            },
            false,
        );
        return { action: PromotionAction.CREATE };
    }

    private static handleContentAsCodeSqlPermissionChecks({
        checks,
        auditedAbility,
        project,
        slug,
    }: {
        checks: ContentAsCodeSqlPermissionCheckResult[];
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        project: Pick<Project, 'projectUuid' | 'organizationUuid'>;
        slug: string;
    }) {
        const missingChecks = checks.filter(({ check }) => {
            switch (check) {
                case 'customSqlDimension':
                    return auditedAbility.cannot(
                        'manage',
                        subject('CustomFields', {
                            organizationUuid: project.organizationUuid,
                            projectUuid: project.projectUuid,
                            metadata: { slug },
                        }),
                    );
                case 'sqlTableCalculation':
                    return auditedAbility.cannot(
                        'manage',
                        subject('CustomSqlTableCalculations', {
                            organizationUuid: project.organizationUuid,
                            projectUuid: project.projectUuid,
                            metadata: { slug },
                        }),
                    );
                default:
                    return assertUnreachable(
                        check,
                        `Unknown content-as-code SQL permission check: ${check}`,
                    );
            }
        });

        if (missingChecks.length === 0) return;
        throw new ForbiddenError(missingChecks[0].message);
    }

    private static transformSpaces(
        spaces: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
    ): SpaceAsCode[] {
        return spaces.map((space) => ({
            contentType: ContentAsCodeType.SPACE,
            spaceName: space.name,
            slug: getContentAsCodePathFromLtreePath(space.path),
        }));
    }

    private static transformChart(
        chart: SavedChartDAO,
        spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
        dashboardSlugs: Record<string, string>,
        verificationMap: Map<string, ContentVerificationInfo>,
    ): ChartAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === chart.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${chart.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        return {
            name: chart.name,
            description: chart.description,
            tableName: chart.tableName,
            updatedAt: chart.updatedAt,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            pivotConfig: chart.pivotConfig,
            dashboardSlug: chart.dashboardUuid
                ? dashboardSlugs[chart.dashboardUuid]
                : undefined,
            slug: chart.slug,
            tableConfig: chart.tableConfig,
            spaceSlug,
            version: currentVersion,
            contentType: ContentAsCodeType.CHART,
            downloadedAt: new Date(),
            parameters: chart.parameters,
            verified: verificationMap.has(chart.uuid) ? true : undefined,
            verification: verificationMap.get(chart.uuid) ?? null,
        };
    }

    private static transformSqlChart(
        sqlChart: {
            name: string;
            description: string | null;
            slug: string;
            sql: string;
            limit: number;
            config: SqlChartAsCode['config'];
            chartKind: SqlChartAsCode['chartKind'];
            lastUpdatedAt: Date;
        },
        spacePath: string,
    ): SqlChartAsCode {
        const spaceSlug = getContentAsCodePathFromLtreePath(spacePath);

        return {
            name: sqlChart.name,
            description: sqlChart.description,
            slug: sqlChart.slug,
            sql: sqlChart.sql,
            limit: sqlChart.limit,
            config: sqlChart.config,
            chartKind: sqlChart.chartKind,
            updatedAt: sqlChart.lastUpdatedAt,
            spaceSlug,
            version: currentVersion,
            contentType: ContentAsCodeType.SQL_CHART,
            downloadedAt: new Date(),
        };
    }

    static isUuid(id: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
        );
    }

    static getChartSlugForTileUuid = (
        dashboard: DashboardDAO,
        uuid: string,
    ) => {
        const tile = dashboard.tiles.find((t) => t.uuid === uuid);
        if (tile && isAnyChartTile(tile)) {
            if (tile.properties.chartSlug == null) {
                return undefined;
            }
            const hasMultipleTilesWithSameChartSlug =
                dashboard.tiles.filter(
                    (t) =>
                        isAnyChartTile(t) &&
                        t.properties.chartSlug === tile.properties.chartSlug,
                ).length > 1;
            if (hasMultipleTilesWithSameChartSlug) {
                const chartSlugIndex = dashboard.tiles
                    .filter(
                        (t) =>
                            isAnyChartTile(t) &&
                            t.properties.chartSlug ===
                                tile.properties.chartSlug,
                    )
                    .findIndex((t) => t.uuid === uuid);
                return `${tile.properties.chartSlug}-${chartSlugIndex + 1}`;
            }
            return tile.properties.chartSlug;
        }
        return undefined;
    };

    /* Convert dashboard filters from tile uuids to tile slugs
     * DashboardDAO to DashboardAsCode
     */
    static getFiltersWithTileSlugs(
        dashboard: DashboardDAO,
    ): Required<NonNullable<DashboardAsCode['filters']>> {
        const dimensionFiltersWithoutUuids: NonNullable<
            DashboardAsCode['filters']
        >['dimensions'] = dashboard.filters.dimensions.map((filter) => {
            const tileTargets = Object.entries(filter.tileTargets ?? {}).reduce<
                Record<string, DashboardTileTarget>
            >((acc, [tileUuid, target]) => {
                const tileSlug = CoderService.getChartSlugForTileUuid(
                    dashboard,
                    tileUuid,
                );
                if (!tileSlug) return acc;
                return {
                    ...acc,
                    [tileSlug]: target,
                };
            }, {});
            return {
                ...filter,
                id: undefined,
                tileTargets,
            };
        });

        return {
            ...dashboard.filters,
            dimensions: dimensionFiltersWithoutUuids,
        };
    }

    /* Convert dashboard filters from tile slugs to tile uuids
     * DashboardAsCode to DashboardDAO
     */
    static getFiltersWithTileUuids(
        dashboardAsCode: DashboardAsCode,
        tilesWithUuids: DashboardTileWithSlug[],
    ): DashboardDAO['filters'] {
        const dimensionFiltersWithUuids: DashboardDAO['filters']['dimensions'] =
            (dashboardAsCode.filters?.dimensions ?? []).map((filter) => {
                const tileTargets = Object.entries(
                    filter.tileTargets ?? {},
                ).reduce<Record<string, DashboardTileTarget>>(
                    (acc, [tileSlug, target]) => {
                        const tileUuid = tilesWithUuids.find(
                            (t) =>
                                isAnyChartTile(t) &&
                                // Match first by tileSlug, then by chartSlug (for the case of tile not having a slug)
                                (t.tileSlug === tileSlug ||
                                    t.properties.chartSlug === tileSlug),
                        )?.uuid;
                        if (!tileUuid) {
                            console.error(
                                `Tile with slug ${tileSlug} not found in tilesWithUuids`,
                            );
                            return acc;
                        }
                        return {
                            ...acc,
                            [tileUuid]: target,
                        };
                    },
                    {},
                );
                return {
                    ...filter,
                    id: uuidv4(),
                    tileTargets,
                };
            });
        return {
            metrics: dashboardAsCode.filters?.metrics ?? [],
            tableCalculations: dashboardAsCode.filters?.tableCalculations ?? [],
            dimensions: dimensionFiltersWithUuids,
        };
    }

    /* Convert date zoom control tileTargets from tile uuids to tile slugs
     * DashboardDAO to DashboardAsCode
     */
    static getConfigWithDateZoomTileSlugs(
        dashboard: DashboardDAO,
    ): DashboardConfig | undefined {
        const { config } = dashboard;
        if (!config?.dateZoomConfig) return config;

        const tileTargets = Object.entries(
            config.dateZoomConfig.tileTargets ?? {},
        ).reduce<Record<string, DateZoomTileTarget>>(
            (acc, [tileUuid, target]) => {
                const tileSlug = CoderService.getChartSlugForTileUuid(
                    dashboard,
                    tileUuid,
                );
                if (!tileSlug) return acc;
                return { ...acc, [tileSlug]: target };
            },
            {},
        );

        return {
            ...config,
            dateZoomConfig: { ...config.dateZoomConfig, tileTargets },
        };
    }

    /* Convert date zoom control tileTargets from tile slugs to tile uuids
     * DashboardAsCode to DashboardDAO
     */
    static getConfigWithDateZoomTileUuids(
        config: DashboardConfig,
        tilesWithUuids: DashboardTileWithSlug[],
    ): DashboardConfig {
        const { dateZoomConfig } = config;
        if (!dateZoomConfig) return config;

        const tileTargets = Object.entries(
            dateZoomConfig.tileTargets ?? {},
        ).reduce<Record<string, DateZoomTileTarget>>(
            (acc, [tileSlug, target]) => {
                const tileUuid = tilesWithUuids.find(
                    (t) =>
                        isAnyChartTile(t) &&
                        // Match first by tileSlug, then by chartSlug (for the case of tile not having a slug)
                        (t.tileSlug === tileSlug ||
                            t.properties.chartSlug === tileSlug),
                )?.uuid;
                if (!tileUuid) {
                    console.error(
                        `Tile with slug ${tileSlug} not found for date zoom target`,
                    );
                    return acc;
                }
                return { ...acc, [tileUuid]: target };
            },
            {},
        );

        return {
            ...config,
            dateZoomConfig: { ...dateZoomConfig, tileTargets },
        };
    }

    private static transformDashboard(
        dashboard: DashboardDAO,
        spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
        verificationMap: Map<string, ContentVerificationInfo>,
    ): DashboardAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === dashboard.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${dashboard.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        const tilesWithoutUuids: DashboardTileAsCode[] = dashboard.tiles.map(
            (tile): DashboardTileAsCode => {
                if (isAnyChartTile(tile)) {
                    if (tile.type === DashboardTileTypes.SAVED_CHART) {
                        const chartTile: DashboardChartTileAsCode = {
                            ...tile,
                            type: DashboardTileTypes.SAVED_CHART,
                            uuid: undefined,
                            tileSlug: CoderService.getChartSlugForTileUuid(
                                dashboard,
                                tile.uuid,
                            ),
                            properties: {
                                title: tile.properties.title,
                                hideTitle: tile.properties.hideTitle,
                                chartSlug: tile.properties.chartSlug ?? null,
                                chartName:
                                    tile.properties.chartName ?? undefined,
                            },
                        };
                        return chartTile;
                    }

                    const sqlTile: DashboardSqlChartTileAsCode = {
                        ...tile,
                        type: DashboardTileTypes.SQL_CHART,
                        uuid: undefined,
                        tileSlug: CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tile.uuid,
                        ),
                        properties: {
                            title: tile.properties.title,
                            hideTitle: tile.properties.hideTitle,
                            chartSlug: tile.properties.chartSlug ?? null,
                            chartName: tile.properties.chartName,
                        },
                    };
                    return sqlTile;
                }

                if (tile.type === DashboardTileTypes.MARKDOWN) {
                    const markdownTile: DashboardMarkdownTileAsCode = {
                        ...tile,
                        type: DashboardTileTypes.MARKDOWN,
                        uuid: undefined,
                        tileSlug: undefined,
                        properties: {
                            title: tile.properties.title,
                            content: tile.properties.content,
                            hideFrame: tile.properties.hideFrame,
                        },
                    };
                    return markdownTile;
                }

                // Other non-chart tiles already match the as-code shape
                return {
                    ...tile,
                    tileSlug: undefined,
                    uuid: undefined,
                };
            },
            [],
        );

        const dashboardAsCode: DashboardAsCode = {
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.updatedAt,
            tiles: tilesWithoutUuids,

            filters: CoderService.getFiltersWithTileSlugs(dashboard),
            tabs: dashboard.tabs,
            slug: dashboard.slug,
            ...(dashboard.config
                ? {
                      config: CoderService.getConfigWithDateZoomTileSlugs(
                          dashboard,
                      ),
                  }
                : {}),
            ...(dashboard.parameters
                ? { parameters: dashboard.parameters }
                : {}),

            spaceSlug,
            version: currentVersion,
            contentType: ContentAsCodeType.DASHBOARD,
            downloadedAt: new Date(),
            verified: verificationMap.has(dashboard.uuid) ? true : undefined,
            verification: verificationMap.get(dashboard.uuid) ?? null,
        };

        return dashboardAsCode;
    }

    async convertTileWithSlugsToUuids(
        projectUuid: string,
        tiles: DashboardTileAsCode[],
    ): Promise<DashboardTileWithSlug[]> {
        const chartSlugs: string[] = tiles.reduce<string[]>((acc, tile) => {
            if (!isAnyChartTile(tile) || tile.properties.chartSlug == null) {
                return acc;
            }

            return [...acc, tile.properties.chartSlug];
        }, []);

        const withResolvedTileUuid = (
            tile: DashboardTileAsCode,
            chartInfo?: { uuid: string; isSql: boolean },
        ): DashboardTileWithSlug => {
            if (!isAnyChartTile(tile)) {
                return {
                    ...tile,
                    uuid: tile.uuid ?? uuidv4(),
                } as DashboardTileWithSlug;
            }

            const isSqlChart =
                chartInfo?.isSql ?? tile.type === DashboardTileTypes.SQL_CHART;

            if (isSqlChart) {
                return {
                    ...tile,
                    uuid: tile.uuid ?? uuidv4(),
                    type: DashboardTileTypes.SQL_CHART,
                    properties: {
                        ...tile.properties,
                        chartSlug: tile.properties.chartSlug ?? null,
                        savedSqlUuid: chartInfo?.uuid ?? null,
                    },
                } as DashboardTileWithSlug;
            }

            return {
                ...tile,
                uuid: tile.uuid ?? uuidv4(),
                type: DashboardTileTypes.SAVED_CHART,
                properties: {
                    ...tile.properties,
                    chartSlug: tile.properties.chartSlug ?? null,
                    savedChartUuid: chartInfo?.uuid ?? null,
                },
            } as DashboardTileWithSlug;
        };

        if (chartSlugs.length === 0) {
            return tiles.map((tile) => withResolvedTileUuid(tile));
        }

        // Query both regular charts and SQL charts in parallel
        const [charts, sqlChartRows] = await Promise.all([
            this.savedChartModel.find({
                slugs: chartSlugs,
                projectUuid,
                excludeChartsSavedInDashboard: false,
                includeOrphanChartsWithinDashboard: true,
            }),
            this.savedSqlModel.find({
                slugs: chartSlugs,
                projectUuid,
            }),
        ]);

        // Create a unified map of slug -> { uuid, isSql } for both chart types
        const chartSlugToInfo = new Map<
            string,
            { uuid: string; isSql: boolean }
        >();
        charts.forEach((chart) =>
            chartSlugToInfo.set(chart.slug, { uuid: chart.uuid, isSql: false }),
        );
        sqlChartRows.forEach((row) =>
            chartSlugToInfo.set(row.slug, {
                uuid: row.saved_sql_uuid,
                isSql: true,
            }),
        );

        return tiles.map((tile) => {
            if (isAnyChartTile(tile)) {
                const { chartSlug } = tile.properties;
                if (chartSlug == null) {
                    return withResolvedTileUuid(tile);
                }
                const chartInfo = chartSlugToInfo.get(chartSlug);
                return withResolvedTileUuid(tile, chartInfo);
            }

            return withResolvedTileUuid(tile);
        });
    }

    /*
    Dashboard or chart ids can be uuids or slugs
     We need to convert uuids to slugs before making the query
    */
    async convertIdsToSlugs(
        type: 'dashboard' | 'chart',
        ids: string[] | undefined,
    ) {
        if (!ids) return ids; // return [] or undefined

        const uuids = ids?.filter((id) => CoderService.isUuid(id));
        let uuidsToSlugs: string[] = [];

        if (uuids.length > 0) {
            if (type === 'dashboard') {
                const dashboardSlugs =
                    await this.dashboardModel.getSlugsForUuids(uuids);
                uuidsToSlugs = Object.values(dashboardSlugs);
            } else if (type === 'chart') {
                uuidsToSlugs =
                    await this.savedChartModel.getSlugsForUuids(uuids);
            }
        }
        const slugs = ids?.filter((id) => !CoderService.isUuid(id)) ?? [];

        return [...uuidsToSlugs, ...slugs];
    }

    static getMissingIds(
        ids: string[] | undefined,
        items: Pick<SavedChartDAO | DashboardDAO, 'slug' | 'uuid'>[],
    ) {
        return ids
            ? ids.reduce<string[]>((acc, id) => {
                  const exists = items.some(
                      (item) => id === item.uuid || id === item.slug,
                  );
                  if (!exists) {
                      acc.push(id);
                  }
                  return acc;
              }, [])
            : [];
    }

    private async filterPrivateContent<
        T extends
            | DashboardDAO
            | SavedChartDAO
            | (ChartSummary & { updatedAt: Date })
            | Pick<
                  DashboardDAO,
                  'uuid' | 'name' | 'spaceUuid' | 'description' | 'slug'
              >,
    >(
        user: SessionUser,
        project: Project,
        content: T[],
        spaces: SpaceSummaryBase[],
    ): Promise<T[]> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.can(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            // User is an admin, return all content
            return content;
        }

        const spaceUuids = spaces.map((s) => s.uuid);

        const accessibleSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        const accessibleSet = new Set(accessibleSpaceUuids);
        return content.filter((c) => accessibleSet.has(c.spaceUuid));
    }

    /*
    @param dashboardIds: Dashboard ids can be uuids or slugs, if undefined return all dashboards, if [] we return no dashboards
    @returns: DashboardAsCode[]
    */
    async getDashboards(
        user: SessionUser,
        projectUuid: string,
        dashboardIds: string[] | undefined,
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download dashboards',
            );
        }

        const slugs = await this.convertIdsToSlugs('dashboard', dashboardIds);

        if (slugs?.length === 0) {
            this.logger.warn(
                `No dashboards to download for project ${projectUuid} with ids ${dashboardIds?.join(
                    ', ',
                )}`,
            );
            return {
                dashboards: [],
                languageMap: undefined,
                missingIds: dashboardIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const dashboardSummaries = await this.dashboardModel.find({
            projectUuid,
            slugs,
        });
        const spaceUuids = dashboardSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });

        const dashboardSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboardSummaries,
            spaces,
        );
        const {
            page: limitedDashboardSummaries,
            total: dashboardsTotal,
            offset: newOffset,
        } = paginateAsCode({
            items: dashboardSummariesWithAccess,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });

        const dashboardPromises = limitedDashboardSummaries.map((dash) =>
            this.dashboardModel.getByIdOrSlug(dash.uuid),
        );
        const dashboards = await Promise.all(dashboardPromises);

        const missingIds = CoderService.getMissingIds(dashboardIds, dashboards);
        if (missingIds.length > 0) {
            this.logger.warn(
                `Missing filtered dashboards for project ${projectUuid} with ids ${missingIds.join(
                    ', ',
                )}`,
            );
        }

        const dashboardsWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboards,
            spaces,
        );

        const dashboardUuidsForVerification = dashboardsWithAccess.map(
            (d) => d.uuid,
        );
        const dashboardVerificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.DASHBOARD,
                dashboardUuidsForVerification,
            );

        const transformedDashboards = dashboardsWithAccess.map((dashboard) =>
            CoderService.transformDashboard(
                dashboard,
                spaces,
                dashboardVerificationMap,
            ),
        );

        return {
            dashboards: transformedDashboards,
            languageMap: languageMap
                ? transformedDashboards.map((dashboard) => {
                      try {
                          return new DashboardAsCodeInternalization().getLanguageMap(
                              dashboard,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for dashboard ${dashboard.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            spaces: CoderService.transformSpaces(
                spaces.filter((s) =>
                    dashboardsWithAccess.some((d) => d.spaceUuid === s.uuid),
                ),
            ),
            total: dashboardsTotal,
            offset: newOffset,
        };
    }

    async getCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        // Filter charts based on user permissions (from private spaces)
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError('You are not allowed to download charts');
        }

        const slugs = await this.convertIdsToSlugs('chart', chartIds);
        if (slugs?.length === 0) {
            this.logger.warn(
                `No charts to download for project ${projectUuid} with ids ${chartIds?.join(
                    ', ',
                )}`,
            );
            return {
                charts: [],
                languageMap: undefined,
                missingIds: chartIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
            slugs,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });
        const spaceUuids = chartSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });
        const chartsSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            chartSummaries,
            spaces,
        );
        const {
            page: limitedChartSummaries,
            total: chartsTotal,
            offset: newOffset,
        } = paginateAsCode({
            items: chartsSummariesWithAccess,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });

        const chartPromises = limitedChartSummaries.map((chart) =>
            this.savedChartModel.get(chart.uuid),
        );
        const charts = await Promise.all(chartPromises);

        // get all spaces to map  dashboardSlug
        const dashboardUuids = charts.reduce<string[]>((acc, chart) => {
            if (chart.dashboardUuid) {
                acc.push(chart.dashboardUuid);
            }
            return acc;
        }, []);
        const dashboards =
            await this.dashboardModel.getSlugsForUuids(dashboardUuids);

        const chartUuids = charts.map((chart) => chart.uuid);
        const chartVerificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.CHART,
                chartUuids,
            );

        const transformedCharts = charts.map((chart) =>
            CoderService.transformChart(
                chart,
                spaces,
                dashboards,
                chartVerificationMap,
            ),
        );

        const missingIds = CoderService.getMissingIds(chartIds, charts);

        return {
            charts: transformedCharts,
            languageMap: languageMap
                ? transformedCharts.map((chart) => {
                      try {
                          return new ChartAsCodeInternalization().getLanguageMap(
                              chart,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for chart ${chart.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            spaces: CoderService.transformSpaces(
                spaces.filter((s) =>
                    limitedChartSummaries.some((c) => c.spaceUuid === s.uuid),
                ),
            ),
            total: chartsTotal,
            offset: newOffset,
        };
    }

    async getCurrentContentVersionBySlug(
        user: SessionUser,
        projectUuid: string,
        type: 'dashboard' | 'chart',
        slug: string,
    ): Promise<{ contentUuid: string; versionUuid: string | null }> {
        const { name: projectName, organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName, type, slug },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        switch (type) {
            case 'dashboard': {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slugs: [slug],
                });
                if (!dashboard) {
                    throw new NotFoundError(
                        `Dashboard with slug "${slug}" not found`,
                    );
                }

                const currentDashboard =
                    await this.dashboardModel.getByIdOrSlug(dashboard.uuid);
                return {
                    contentUuid: dashboard.uuid,
                    versionUuid: currentDashboard.versionUuid,
                };
            }
            case 'chart': {
                const [chart] = await this.savedChartModel.find({
                    projectUuid,
                    slugs: [slug],
                    excludeChartsSavedInDashboard: false,
                    includeOrphanChartsWithinDashboard: true,
                });
                if (!chart) {
                    throw new NotFoundError(
                        `Chart with slug "${slug}" not found`,
                    );
                }

                const version =
                    await this.savedChartModel.getLatestVersionSummary(
                        chart.uuid,
                    );
                return {
                    contentUuid: chart.uuid,
                    versionUuid: version?.versionUuid ?? null,
                };
            }
            default:
                return assertUnreachable(type, 'Invalid content type');
        }
    }

    async getSqlCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
    ): Promise<{
        sqlCharts: SqlChartAsCode[];
        missingIds: string[];
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    }> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download SQL charts',
            );
        }

        // For SQL charts, we use slugs directly (no UUID to slug conversion needed)
        // since SQL charts are only identified by slug in the as-code workflow
        const slugs = chartIds;

        if (slugs?.length === 0) {
            return {
                sqlCharts: [],
                missingIds: chartIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const sqlChartRows = await this.savedSqlModel.find({
            projectUuid,
            slugs,
        });

        // Filter SQL charts by space access
        const sqlChartSpaceUuids = sqlChartRows.map((row) => row.space_uuid);
        const sqlChartSpaces = await this.spaceModel.find({
            spaceUuids: sqlChartSpaceUuids,
        });
        const sqlChartsWithAccess = await this.filterPrivateContent(
            user,
            project,
            sqlChartRows.map((row) => ({
                uuid: row.saved_sql_uuid,
                name: row.name,
                spaceUuid: row.space_uuid,
                description: row.description ?? undefined,
                slug: row.slug,
            })),
            sqlChartSpaces,
        );

        // Filter rows by access permissions first
        const sqlChartSlugsWithAccess = new Set(
            sqlChartsWithAccess.map((c) => c.slug),
        );
        const accessibleSqlChartRows = sqlChartRows.filter((row) =>
            sqlChartSlugsWithAccess.has(row.slug),
        );

        // Apply pagination to the filtered results
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;
        const {
            page: paginatedSqlChartRows,
            total: sqlChartsTotal,
            offset: newOffset,
        } = paginateAsCode({
            items: accessibleSqlChartRows,
            offset,
            pageSize: maxResults,
        });

        const transformedSqlCharts = paginatedSqlChartRows.map((row) =>
            CoderService.transformSqlChart(
                {
                    name: row.name,
                    description: row.description,
                    slug: row.slug,
                    sql: row.sql,
                    limit: row.limit,
                    config: row.config as SqlChartAsCode['config'],
                    chartKind: row.chart_kind,
                    lastUpdatedAt: row.last_version_updated_at,
                },
                row.path,
            ),
        );

        // Calculate missing IDs
        const foundSlugs = new Set(sqlChartRows.map((c) => c.slug));
        const missingIds = chartIds
            ? chartIds.filter((id) => !foundSlugs.has(id))
            : [];

        return {
            sqlCharts: transformedSqlCharts,
            missingIds,
            spaces: CoderService.transformSpaces(
                sqlChartSpaces.filter((s) =>
                    paginatedSqlChartRows.some(
                        (row) => row.space_uuid === s.uuid,
                    ),
                ),
            ),
            total: sqlChartsTotal,
            offset: newOffset,
        };
    }

    private static getScheduledDeliveryTargetsAsCode(
        scheduler: SchedulerAndTargets,
    ): ScheduledDeliveryTargetAsCode[] | null {
        const targets: ScheduledDeliveryTargetAsCode[] = [];
        for (const target of scheduler.targets) {
            if (isEmailTarget(target)) {
                targets.push({ type: 'email', recipient: target.recipient });
            } else if (isSlackTarget(target)) {
                targets.push({ type: 'slack', channel: target.channel });
            } else if (isMsTeamsTarget(target) || isGoogleChatTarget(target)) {
                return null;
            } else {
                assertUnreachable(target, 'Unknown scheduled delivery target');
            }
        }
        return targets;
    }

    private static getScheduledDeliveryTargetKey(
        target: ScheduledDeliveryTargetAsCode,
    ): string {
        switch (target.type) {
            case 'email':
                return `${target.type}:${target.recipient}`;
            case 'slack':
                return `${target.type}:${target.channel}`;
            default:
                return assertUnreachable(
                    target,
                    'Unknown scheduled delivery target',
                );
        }
    }

    private static getDashboardScheduledDeliveryFiltersWithTileSlugs(
        dashboard: DashboardDAO,
        filters: DashboardFilterRule[] | undefined,
    ): Omit<DashboardFilterRule, 'id'>[] | null {
        if (!filters) return null;
        return filters.map((filter) => {
            const tileTargets = Object.entries(filter.tileTargets ?? {}).reduce<
                Record<string, DashboardTileTarget>
            >((acc, [tileUuid, target]) => {
                const tileSlug = CoderService.getChartSlugForTileUuid(
                    dashboard,
                    tileUuid,
                );
                return tileSlug ? { ...acc, [tileSlug]: target } : acc;
            }, {});
            return { ...filter, id: undefined, tileTargets };
        });
    }

    private static getDashboardScheduledDeliveryFiltersWithTileUuids(
        dashboard: DashboardDAO,
        filters: Omit<DashboardFilterRule, 'id'>[] | null,
    ): DashboardFilterRule[] | undefined {
        if (!filters) return undefined;
        return filters.map((filter) => {
            const tileTargets = Object.entries(filter.tileTargets ?? {}).reduce<
                Record<string, DashboardTileTarget>
            >((acc, [tileSlug, target]) => {
                const tileUuid = dashboard.tiles.find(
                    (tile) =>
                        CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tile.uuid,
                        ) === tileSlug,
                )?.uuid;
                if (!tileUuid) {
                    throw new NotFoundError(
                        `Dashboard tile '${tileSlug}' referenced by scheduled delivery was not found`,
                    );
                }
                return { ...acc, [tileUuid]: target };
            }, {});
            return { ...filter, id: uuidv4(), tileTargets };
        });
    }

    private static getDashboardTabBaseSlug(
        tab: DashboardDAO['tabs'][number],
    ): string {
        const slug = tab.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || `tab-${tab.order + 1}`;
    }

    static getDashboardTabSlug(
        dashboard: Pick<DashboardDAO, 'tabs'>,
        tabUuid: string,
    ): string {
        const tab = dashboard.tabs.find(({ uuid }) => uuid === tabUuid);
        if (!tab) {
            throw new NotFoundError(
                `Dashboard tab '${tabUuid}' referenced by scheduled delivery was not found`,
            );
        }
        const baseSlug = CoderService.getDashboardTabBaseSlug(tab);
        const matchingTabs = dashboard.tabs.filter(
            (candidate) =>
                CoderService.getDashboardTabBaseSlug(candidate) === baseSlug,
        );
        if (matchingTabs.length === 1) return baseSlug;
        const index = matchingTabs.findIndex(({ uuid }) => uuid === tabUuid);
        return `${baseSlug}-${index + 1}`;
    }

    static getDashboardTabUuid(
        dashboard: Pick<DashboardDAO, 'tabs'>,
        tabSlug: string,
    ): string {
        const tab =
            dashboard.tabs.find(
                ({ uuid }) =>
                    CoderService.getDashboardTabSlug(dashboard, uuid) ===
                    tabSlug,
            ) ?? dashboard.tabs.find(({ uuid }) => uuid === tabSlug);
        if (!tab) {
            throw new NotFoundError(
                `Dashboard tab '${tabSlug}' referenced by scheduled delivery was not found`,
            );
        }
        return tab.uuid;
    }

    private static getScheduledDeliveryFormat(
        scheduler: SchedulerAndTargets,
    ): ScheduledDeliveryFormatAsCode | null {
        switch (scheduler.format) {
            case SchedulerFormat.CSV:
            case SchedulerFormat.XLSX:
                return isSchedulerCsvOptions(scheduler.options)
                    ? { format: scheduler.format, options: scheduler.options }
                    : null;
            case SchedulerFormat.IMAGE:
                return isSchedulerImageOptions(scheduler.options)
                    ? { format: scheduler.format, options: scheduler.options }
                    : null;
            case SchedulerFormat.PDF:
                return { format: scheduler.format, options: {} };
            case SchedulerFormat.GSHEETS:
                return null;
            default:
                return assertUnreachable(
                    scheduler.format,
                    'Unknown scheduled delivery format',
                );
        }
    }

    private async transformScheduledDelivery(
        scheduler: SchedulerAndTargets,
    ): Promise<ScheduledDeliveryAsCode | null> {
        if (
            !scheduler.slug ||
            (scheduler.thresholds && scheduler.thresholds.length > 0)
        ) {
            return null;
        }
        const targets =
            CoderService.getScheduledDeliveryTargetsAsCode(scheduler);
        if (!targets) return null;
        const format = CoderService.getScheduledDeliveryFormat(scheduler);
        if (!format) return null;

        const common = {
            contentType: ContentAsCodeType.SCHEDULED_DELIVERY as const,
            version: currentVersion,
            slug: scheduler.slug,
            name: scheduler.name,
            message: scheduler.message ?? null,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? null,
            enabled: scheduler.enabled,
            includeLinks: scheduler.includeLinks,
            targets,
            downloadedAt: new Date(),
        };

        if (isChartScheduler(scheduler)) {
            const chart = await this.savedChartModel.getSummary(
                scheduler.savedChartUuid,
            );
            return {
                ...common,
                ...format,
                resource: { type: 'chart', slug: chart.slug },
                filters: stripFilterIds(scheduler.filters),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: null,
                selectedTabs: null,
            };
        }

        if (isDashboardScheduler(scheduler)) {
            const dashboard = await this.dashboardModel.getByIdOrSlug(
                scheduler.dashboardUuid,
            );
            return {
                ...common,
                ...format,
                resource: { type: 'dashboard', slug: dashboard.slug },
                filters:
                    CoderService.getDashboardScheduledDeliveryFiltersWithTileSlugs(
                        dashboard,
                        scheduler.filters,
                    ),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: scheduler.customViewportWidth ?? null,
                selectedTabs:
                    scheduler.selectedTabs?.map((tabUuid) =>
                        CoderService.getDashboardTabSlug(dashboard, tabUuid),
                    ) ?? null,
            };
        }

        return null;
    }

    private async transformGoogleSheetsSync(
        scheduler: SchedulerAndTargets,
    ): Promise<GoogleSheetsSyncAsCode | null> {
        if (
            !scheduler.slug ||
            scheduler.format !== SchedulerFormat.GSHEETS ||
            scheduler.thresholds?.length ||
            !isSchedulerGsheetsOptions(scheduler.options)
        ) {
            return null;
        }

        const common = {
            contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC as const,
            version: currentVersion,
            slug: scheduler.slug,
            name: scheduler.name,
            message: scheduler.message ?? null,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? null,
            enabled: scheduler.enabled,
            includeLinks: scheduler.includeLinks,
            destination: {
                spreadsheetId: scheduler.options.gdriveId,
                spreadsheetName: scheduler.options.gdriveName,
                organizationName: scheduler.options.gdriveOrganizationName,
                url: scheduler.options.url,
                tabName: scheduler.options.tabName ?? null,
            },
            downloadedAt: new Date(),
        };

        if (isChartScheduler(scheduler)) {
            const chart = await this.savedChartModel.getSummary(
                scheduler.savedChartUuid,
            );
            return {
                ...common,
                resource: { type: 'chart', slug: chart.slug },
                filters: stripFilterIds(scheduler.filters),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: null,
                selectedTabs: null,
            };
        }

        if (isDashboardScheduler(scheduler)) {
            const dashboard = await this.dashboardModel.getByIdOrSlug(
                scheduler.dashboardUuid,
            );
            return {
                ...common,
                resource: { type: 'dashboard', slug: dashboard.slug },
                filters:
                    CoderService.getDashboardScheduledDeliveryFiltersWithTileSlugs(
                        dashboard,
                        scheduler.filters,
                    ),
                parameters: scheduler.parameters ?? null,
                customViewportWidth: scheduler.customViewportWidth ?? null,
                selectedTabs:
                    scheduler.selectedTabs?.map((tabUuid) =>
                        CoderService.getDashboardTabSlug(dashboard, tabUuid),
                    ) ?? null,
            };
        }

        return null;
    }

    private static getScheduledContentNames(
        contentType:
            | ContentAsCodeType.SCHEDULED_DELIVERY
            | ContentAsCodeType.ALERT
            | ContentAsCodeType.GOOGLE_SHEETS_SYNC,
    ): { singular: string; plural: string } {
        switch (contentType) {
            case ContentAsCodeType.SCHEDULED_DELIVERY:
                return {
                    singular: 'Scheduled delivery',
                    plural: 'scheduled deliveries',
                };
            case ContentAsCodeType.ALERT:
                return { singular: 'Alert', plural: 'alerts' };
            case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                return {
                    singular: 'Google Sheets sync',
                    plural: 'Google Sheets syncs',
                };
            default:
                return assertUnreachable(
                    contentType,
                    'Unknown scheduled content type',
                );
        }
    }

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
        contentType?: ContentAsCodeType.SCHEDULED_DELIVERY,
    ): Promise<ApiScheduledDeliveryAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs: string[] | undefined,
        contentType: ContentAsCodeType.ALERT,
    ): Promise<ApiAlertAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs: string[] | undefined,
        contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC,
    ): Promise<ApiGoogleSheetsSyncAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
        contentType:
            | ContentAsCodeType.SCHEDULED_DELIVERY
            | ContentAsCodeType.ALERT
            | ContentAsCodeType.GOOGLE_SHEETS_SYNC = ContentAsCodeType.SCHEDULED_DELIVERY,
    ): Promise<
        | ApiScheduledDeliveryAsCodeListResponse['results']
        | ApiAlertAsCodeListResponse['results']
        | ApiGoogleSheetsSyncAsCodeListResponse['results']
    > {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            ) ||
            auditedAbility.cannot(
                'manage',
                subject('ScheduledDeliveries', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            ) ||
            (contentType === ContentAsCodeType.GOOGLE_SHEETS_SYNC &&
                auditedAbility.cannot(
                    'manage',
                    subject('GoogleSheets', {
                        projectUuid,
                        organizationUuid: project.organizationUuid,
                    }),
                ))
        ) {
            const { plural } =
                CoderService.getScheduledContentNames(contentType);
            throw new ForbiddenError(
                `You are not allowed to download ${plural}`,
            );
        }

        const schedulers =
            await this.schedulerModel.getSchedulerForProject(projectUuid);
        const filteredSchedulers = slugs?.length
            ? schedulers.filter((scheduler) => slugs.includes(scheduler.slug))
            : schedulers;
        const matchingSchedulers = filteredSchedulers.filter((scheduler) => {
            switch (contentType) {
                case ContentAsCodeType.ALERT:
                    return Boolean(scheduler.thresholds?.length);
                case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                    return (
                        !scheduler.thresholds?.length &&
                        scheduler.format === SchedulerFormat.GSHEETS
                    );
                case ContentAsCodeType.SCHEDULED_DELIVERY:
                    return (
                        !scheduler.thresholds?.length &&
                        scheduler.format !== SchedulerFormat.GSHEETS
                    );
                default:
                    return assertUnreachable(
                        contentType,
                        'Unknown scheduled content type',
                    );
            }
        });
        const transformed = await Promise.all(
            matchingSchedulers.map((scheduler) => {
                switch (contentType) {
                    case ContentAsCodeType.ALERT:
                        return this.transformAlert(scheduler);
                    case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                        return this.transformGoogleSheetsSync(scheduler);
                    case ContentAsCodeType.SCHEDULED_DELIVERY:
                        return this.transformScheduledDelivery(scheduler);
                    default:
                        return assertUnreachable(
                            contentType,
                            'Unknown scheduled content type',
                        );
                }
            }),
        );
        const content: Array<
            ScheduledDeliveryAsCode | AlertAsCode | GoogleSheetsSyncAsCode
        > = [];
        const skipped: Array<{ name: string; reason: string }> = [];
        const { singular: contentName } =
            CoderService.getScheduledContentNames(contentType);
        const unsupportedReason = `${contentName} as code supports chart and dashboard resources`;

        matchingSchedulers.forEach((scheduler, index) => {
            const item = transformed[index];
            if (item) {
                content.push(item);
            } else {
                skipped.push({
                    name: scheduler.name,
                    reason: scheduler.slug
                        ? unsupportedReason
                        : `${contentName} is missing its portable identity and must be backfilled before export`,
                });
            }
        });

        if (contentType === ContentAsCodeType.ALERT) {
            return { alerts: content as AlertAsCode[], skipped };
        }
        if (contentType === ContentAsCodeType.GOOGLE_SHEETS_SYNC) {
            return {
                googleSheetsSyncs: content as GoogleSheetsSyncAsCode[],
                skipped,
            };
        }
        return {
            scheduledDeliveries: content as ScheduledDeliveryAsCode[],
            skipped,
        };
    }

    private async transformAlert(
        scheduler: SchedulerAndTargets,
    ): Promise<AlertAsCode | null> {
        if (
            !scheduler.slug ||
            !isChartScheduler(scheduler) ||
            !scheduler.thresholds?.length ||
            scheduler.format !== SchedulerFormat.IMAGE
        ) {
            return null;
        }
        const targets =
            CoderService.getScheduledDeliveryTargetsAsCode(scheduler);
        if (!targets) return null;

        const chart = await this.savedChartModel.getSummary(
            scheduler.savedChartUuid,
        );
        return {
            contentType: ContentAsCodeType.ALERT,
            version: currentVersion,
            slug: scheduler.slug,
            name: scheduler.name,
            message: scheduler.message ?? null,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? null,
            enabled: scheduler.enabled,
            includeLinks: scheduler.includeLinks,
            targets,
            resource: { type: 'chart', slug: chart.slug },
            thresholds: scheduler.thresholds,
            notificationFrequency:
                scheduler.notificationFrequency ?? NotificationFrequency.ALWAYS,
            filters: stripFilterIds(scheduler.filters),
            parameters: scheduler.parameters ?? null,
            downloadedAt: new Date(),
        };
    }

    private async getScheduledDeliveryResource(
        projectUuid: string,
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
    ): Promise<
        | { type: 'chart'; uuid: string }
        | { type: 'dashboard'; uuid: string; dashboard: DashboardDAO }
    > {
        if (delivery.resource.type === 'chart') {
            const charts = await this.savedChartModel.find({
                projectUuid,
                slug: delivery.resource.slug,
                includeOrphanChartsWithinDashboard: true,
            });
            if (charts.length === 0) {
                throw new NotFoundError(
                    `Chart '${delivery.resource.slug}' was not found`,
                );
            }
            if (charts.length > 1) {
                throw new ParameterError(
                    `Multiple charts match slug '${delivery.resource.slug}'`,
                );
            }
            return { type: 'chart', uuid: charts[0].uuid };
        }

        const dashboards = await this.dashboardModel.find({
            projectUuid,
            slug: delivery.resource.slug,
        });
        if (dashboards.length === 0) {
            throw new NotFoundError(
                `Dashboard '${delivery.resource.slug}' was not found`,
            );
        }
        if (dashboards.length > 1) {
            throw new ParameterError(
                `Multiple dashboards match slug '${delivery.resource.slug}'`,
            );
        }
        return {
            type: 'dashboard',
            uuid: dashboards[0].uuid,
            dashboard: await this.dashboardModel.getByIdOrSlug(
                dashboards[0].uuid,
            ),
        };
    }

    private static getScheduledDeliveryTargets(delivery: {
        targets: ScheduledDeliveryTargetAsCode[];
    }): CreateSchedulerTarget[] {
        return delivery.targets.map((target) => {
            switch (target.type) {
                case 'email':
                    return { recipient: target.recipient };
                case 'slack':
                    return { channel: target.channel };
                default:
                    return assertUnreachable(
                        target,
                        'Unknown scheduled delivery target',
                    );
            }
        });
    }

    private static isChartScheduledDelivery(
        delivery: ScheduledDeliveryAsCode,
    ): delivery is ChartScheduledDeliveryAsCode {
        return delivery.resource.type === 'chart';
    }

    private static isDashboardScheduledDelivery(
        delivery: ScheduledDeliveryAsCode,
    ): delivery is DashboardScheduledDeliveryAsCode {
        return delivery.resource.type === 'dashboard';
    }

    private static isChartScheduledContent(
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
    ): delivery is
        | ChartScheduledDeliveryAsCode
        | AlertAsCode
        | ChartGoogleSheetsSyncAsCode {
        return delivery.resource.type === 'chart';
    }

    private static isDashboardScheduledContent(
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
    ): delivery is
        | DashboardScheduledDeliveryAsCode
        | DashboardGoogleSheetsSyncAsCode {
        return delivery.resource.type === 'dashboard';
    }

    private static scheduledContentIsEqual(
        current: ScheduledDeliveryAsCode | AlertAsCode | GoogleSheetsSyncAsCode,
        desired: ScheduledDeliveryAsCode | AlertAsCode | GoogleSheetsSyncAsCode,
    ): boolean {
        const normalize = (
            scheduledContent:
                | ScheduledDeliveryAsCode
                | AlertAsCode
                | GoogleSheetsSyncAsCode,
        ) => {
            const { downloadedAt, ...rest } = scheduledContent;
            if ('targets' in rest) {
                return {
                    ...rest,
                    targets: [...rest.targets].sort((left, right) =>
                        CoderService.getScheduledDeliveryTargetKey(
                            left,
                        ).localeCompare(
                            CoderService.getScheduledDeliveryTargetKey(right),
                        ),
                    ),
                };
            }
            return rest;
        };
        return isEqual(normalize(current), normalize(desired));
    }

    async upsertScheduledDelivery(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
        force = false,
    ): Promise<
        | ApiScheduledDeliveryAsCodeUpsertResponse['results']
        | ApiAlertAsCodeUpsertResponse['results']
        | ApiGoogleSheetsSyncAsCodeUpsertResponse['results']
    > {
        const isAlert = delivery.contentType === ContentAsCodeType.ALERT;
        const isGoogleSheetsSync =
            delivery.contentType === ContentAsCodeType.GOOGLE_SHEETS_SYNC;
        const { singular: contentName, plural: contentPlural } =
            CoderService.getScheduledContentNames(delivery.contentType);
        if (slug !== delivery.slug) {
            throw new ParameterError(
                `${contentName} slug '${delivery.slug}' does not match path slug '${slug}'`,
            );
        }
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                `You are not allowed to upload ${contentPlural}`,
            );
        }

        const resource = await this.getScheduledDeliveryResource(
            projectUuid,
            delivery,
        );
        const existing = await this.schedulerModel.findSchedulerByProjectSlug(
            projectUuid,
            slug,
        );

        if (
            existing &&
            (Boolean(existing.thresholds?.length) !== isAlert ||
                isGoogleSheetsSync !==
                    (!existing.thresholds?.length &&
                        existing.format === SchedulerFormat.GSHEETS) ||
                (resource.type === 'chart' &&
                    (!isChartScheduler(existing) ||
                        existing.savedChartUuid !== resource.uuid)) ||
                (resource.type === 'dashboard' &&
                    (!isDashboardScheduler(existing) ||
                        existing.dashboardUuid !== resource.uuid)))
        ) {
            throw new ParameterError(
                `${contentName} slug '${slug}' is already used by another resource in this project`,
            );
        }

        if (existing) {
            let current:
                | ScheduledDeliveryAsCode
                | AlertAsCode
                | GoogleSheetsSyncAsCode
                | null;
            switch (delivery.contentType) {
                case ContentAsCodeType.ALERT:
                    current = await this.transformAlert(existing);
                    break;
                case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                    current = await this.transformGoogleSheetsSync(existing);
                    break;
                case ContentAsCodeType.SCHEDULED_DELIVERY:
                    current = await this.transformScheduledDelivery(existing);
                    break;
                default:
                    current = assertUnreachable(
                        delivery,
                        'Unknown scheduled content type',
                    );
            }
            if (
                !force &&
                current &&
                CoderService.scheduledContentIsEqual(current, delivery)
            ) {
                return { action: PromotionAction.NO_CHANGES };
            }
        }

        const targets = isGoogleSheetsSync
            ? []
            : CoderService.getScheduledDeliveryTargets(delivery);
        let filters: Filters | DashboardFilterRule[] | undefined;
        if (CoderService.isChartScheduledContent(delivery)) {
            filters = delivery.filters
                ? normalizeFilterIds(delivery.filters)
                : undefined;
        } else if (
            CoderService.isDashboardScheduledContent(delivery) &&
            resource.type === 'dashboard'
        ) {
            filters =
                CoderService.getDashboardScheduledDeliveryFiltersWithTileUuids(
                    resource.dashboard,
                    delivery.filters,
                );
        } else {
            throw new ParameterError(
                'Scheduled delivery resource type does not match its payload',
            );
        }
        let selectedTabs: string[] | null | undefined;
        if (isAlert || delivery.resource.type === 'chart') {
            selectedTabs = null;
        } else if (resource.type === 'dashboard' && delivery.selectedTabs) {
            selectedTabs = delivery.selectedTabs.map((tabSlug) =>
                CoderService.getDashboardTabUuid(resource.dashboard, tabSlug),
            );
        } else {
            selectedTabs = delivery.selectedTabs;
        }

        const formatAndOptions = (() => {
            switch (delivery.contentType) {
                case ContentAsCodeType.ALERT:
                    return {
                        format: SchedulerFormat.IMAGE,
                        options: { withPdf: false },
                    };
                case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                    return {
                        format: SchedulerFormat.GSHEETS,
                        options: {
                            gdriveId: delivery.destination.spreadsheetId,
                            gdriveName: delivery.destination.spreadsheetName,
                            gdriveOrganizationName:
                                delivery.destination.organizationName,
                            url: delivery.destination.url,
                            tabName: delivery.destination.tabName ?? undefined,
                        },
                    };
                case ContentAsCodeType.SCHEDULED_DELIVERY:
                    return {
                        format: delivery.format,
                        options: delivery.options,
                    };
                default:
                    return assertUnreachable(
                        delivery,
                        'Unknown scheduled content type',
                    );
            }
        })();

        const schedulerInput = {
            slug: delivery.slug,
            name: delivery.name,
            message: delivery.message ?? undefined,
            cron: delivery.cron,
            timezone: delivery.timezone ?? undefined,
            ...formatAndOptions,
            filters,
            parameters: delivery.parameters ?? undefined,
            customViewportWidth: isAlert
                ? undefined
                : (delivery.customViewportWidth ?? undefined),
            selectedTabs,
            thresholds: isAlert ? delivery.thresholds : undefined,
            notificationFrequency: isAlert
                ? delivery.notificationFrequency
                : undefined,
            enabled: delivery.enabled,
            includeLinks: delivery.includeLinks,
            targets,
            appUuid: null,
            appName: null,
        };

        if (!existing) {
            const created =
                resource.type === 'chart'
                    ? await this.savedChartService.createScheduler(
                          user,
                          resource.uuid,
                          schedulerInput,
                      )
                    : await this.dashboardService.createScheduler(
                          user,
                          resource.uuid,
                          schedulerInput,
                      );
            if (!delivery.enabled) {
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    created.schedulerUuid,
                    false,
                );
            }
            return { action: PromotionAction.CREATE };
        }

        await this.schedulerService.updateScheduler(
            user,
            existing.schedulerUuid,
            schedulerInput,
        );
        if (existing.enabled !== delivery.enabled) {
            await this.schedulerService.setSchedulerEnabled(
                user,
                existing.schedulerUuid,
                delivery.enabled,
            );
        }
        return { action: PromotionAction.UPDATE };
    }

    private async syncVerification({
        user,
        projectUuid,
        organizationUuid,
        contentType,
        contentUuid,
        verified,
    }: {
        user: SessionUser;
        projectUuid: string;
        organizationUuid: string;
        contentType: ContentType;
        contentUuid: string;
        verified: boolean | undefined;
    }): Promise<void> {
        if (verified === undefined) return;

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                    metadata: { contentType, contentUuid },
                }),
            )
        ) {
            // Warn and skip so CI pipelines run by non-admin deployers don't fail.
            this.logger.warn(
                `User ${user.userUuid} cannot ${
                    verified ? 'verify' : 'unverify'
                } ${contentType} ${contentUuid}; skipping verification sync.`,
            );
            return;
        }

        const current = await this.contentVerificationModel.getByContent(
            contentType,
            contentUuid,
        );
        const isCurrentlyVerified = current !== null;

        if (verified && !isCurrentlyVerified) {
            await this.contentVerificationModel.verify(
                contentType,
                contentUuid,
                projectUuid,
                user.userUuid,
            );
            this.analytics.track({
                event: 'content_verification.created',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    contentType,
                    contentId: contentUuid,
                },
            });
        } else if (!verified && isCurrentlyVerified) {
            await this.contentVerificationModel.unverify(
                contentType,
                contentUuid,
            );
            this.analytics.track({
                event: 'content_verification.deleted',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    contentType,
                    contentId: contentUuid,
                },
            });
        }
    }

    async upsertChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        chartAsCode: ChartAsCode,
        options: UpsertContentAsCodeOptions = {},
    ) {
        const {
            skipSpaceCreate,
            publicSpaceCreate,
            force,
            spaceNames,
            mode = 'upsert',
        } = options;
        const shouldUpdateExistingContent = mode === 'upsert';
        const shouldUseExactSlug = mode === 'upsert';
        const project = await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        const { canUploadAnyContent, allowSpaceCreate } =
            CoderService.checkContentAsCodeWriteAccess({
                auditedAbility,
                project,
                slug,
            });

        // Default optional fields when missing (e.g. user-authored YAML)
        const chartWithDefaults = {
            ...chartAsCode,
            updatedAt: chartAsCode.updatedAt ?? new Date(),
            tableConfig: chartAsCode.tableConfig ?? { columnOrder: [] },
            metricQuery: {
                ...chartAsCode.metricQuery,
                filters: normalizeFilterIds(chartAsCode.metricQuery.filters),
            },
        };

        // Create mode treats the requested slug as a base for a new unique
        // slug instead of updating content that already owns it.
        const existingCharts = shouldUpdateExistingContent
            ? await this.savedChartModel.find({
                  slug,
                  projectUuid,
                  excludeChartsSavedInDashboard: false,
                  includeOrphanChartsWithinDashboard: true,
              })
            : [];
        if (existingCharts.length > 1) {
            throw new AlreadyExistsError(
                `There are multiple charts with the same identifier ${slug}`,
            );
        }
        const [chart] = existingCharts;

        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (chart === undefined) {
            if (!canUploadAnyContent) {
                CoderService.handleContentAsCodeSqlPermissionChecks({
                    checks: CoderService.getChartContentAsCodePermissionChecks(
                        chartWithDefaults,
                    ),
                    auditedAbility,
                    project,
                    slug,
                });

                await this.assertCreateAccessForSpaceSlug({
                    user,
                    auditedAbility,
                    projectUuid,
                    spaceSlug: chartWithDefaults.spaceSlug,
                    subjectType: 'SavedChart',
                    errorMessage:
                        "You don't have access to create charts in this space",
                });
            }

            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    chartWithDefaults.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                    spaceNames,
                    allowSpaceCreate,
                );
            // Fetched once, reused by the placeholder-dashboard check below
            const spaceAccessContexts = canUploadAnyContent
                ? null
                : await this.spacePermissionService.getSpacesAccessContext(
                      user.userUuid,
                      [space.uuid],
                  );
            if (spaceAccessContexts !== null) {
                await this.assertSpaceContentAccess({
                    userUuid: user.userUuid,
                    auditedAbility,
                    action: 'create',
                    subjectType: 'SavedChart',
                    spaceUuids: [space.uuid],
                    errorMessage:
                        "You don't have access to create charts in this space",
                    accessContexts: spaceAccessContexts,
                });
            }

            console.info(
                `Creating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
            );

            let createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
                forceSlug: boolean;
            };

            if (chartWithDefaults.dashboardSlug) {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slug: chartWithDefaults.dashboardSlug,
                });

                let dashboardUuid: string = dashboard?.uuid;
                if (!dashboard) {
                    if (spaceAccessContexts !== null) {
                        await this.assertSpaceContentAccess({
                            userUuid: user.userUuid,
                            auditedAbility,
                            action: 'create',
                            subjectType: 'Dashboard',
                            spaceUuids: [space.uuid],
                            errorMessage:
                                "You don't have access to create dashboards in this space",
                            accessContexts: spaceAccessContexts,
                        });
                    }
                    // Charts within dashboards need a dashboard first,
                    // so we will create a placeholder dashboard for this
                    // which we can update later
                    console.debug(
                        'Creating placeholder dashboard for chart within dashboard',
                        chartWithDefaults.slug,
                    );
                    const newDashboard = await this.dashboardModel.create(
                        space.uuid,
                        {
                            name: friendlyName(chartWithDefaults.dashboardSlug),
                            tiles: [],
                            slug: chartWithDefaults.dashboardSlug,
                            forceSlug: shouldUseExactSlug,
                            tabs: [],
                        },
                        user,
                        projectUuid,
                    );

                    dashboardUuid = newDashboard.uuid;
                } else if (!canUploadAnyContent) {
                    // Chart lives in the dashboard, not the YAML space.
                    // Mirrors SavedChartService: only SavedChart create in
                    // the dashboard's space is required.
                    if (!dashboard.spaceUuid) {
                        throw new ForbiddenError(
                            "You don't have access to create charts in this space",
                        );
                    }
                    await this.assertSpaceContentAccess({
                        userUuid: user.userUuid,
                        auditedAbility,
                        action: 'create',
                        subjectType: 'SavedChart',
                        spaceUuids: [dashboard.spaceUuid],
                        errorMessage:
                            "You don't have access to create charts in this space",
                    });
                }
                createChart = {
                    ...chartWithDefaults,
                    spaceUuid: null,
                    dashboardUuid,
                    updatedByUser: user,
                    forceSlug: shouldUseExactSlug,
                };
            } else {
                createChart = {
                    ...chartWithDefaults,
                    spaceUuid: space.uuid,
                    dashboardUuid: null,
                    updatedByUser: user,
                    forceSlug: shouldUseExactSlug,
                };
            }

            const newChart = await this.savedChartModel.create(
                projectUuid,
                user.userUuid,
                createChart,
            );

            await this.syncVerification({
                user,
                projectUuid,
                organizationUuid: project.organizationUuid,
                contentType: ContentType.CHART,
                contentUuid: newChart.uuid,
                verified: chartAsCode.verified,
            });

            console.info(
                `Finished creating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
            );
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newChart,
                            spaceSlug: chartWithDefaults.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                chartWithDefaults.spaceSlug,
                            ),
                            oldUuid: newChart.uuid,
                        },
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }
        console.info(
            `Updating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
        );
        const targetSpace = !canUploadAnyContent
            ? await this.findAccessibleSpace(
                  projectUuid,
                  chartWithDefaults.spaceSlug,
                  user,
              )
            : undefined;
        if (!canUploadAnyContent) {
            if (
                targetSpace === undefined &&
                !skipSpaceCreate &&
                !allowSpaceCreate
            ) {
                throw new ForbiddenError(
                    "You don't have access to create spaces",
                );
            }

            // find() coalesces spaceUuid to the dashboard's space for
            // dashboard-contained charts, so this covers both kinds
            if (!chart.spaceUuid) {
                throw new ForbiddenError(
                    "You don't have access to update this chart",
                );
            }

            await this.assertSpaceContentAccess({
                userUuid: user.userUuid,
                auditedAbility,
                action: 'update',
                subjectType: 'SavedChart',
                spaceUuids: [
                    ...(targetSpace ? [targetSpace.uuid] : []),
                    ...(chart.spaceUuid ? [chart.spaceUuid] : []),
                ],
                metadata: { savedChartUuid: chart.uuid },
                errorMessage: "You don't have access to update this chart",
            });

            const currentChart = await this.savedChartModel.get(chart.uuid);
            CoderService.handleContentAsCodeSqlPermissionChecks({
                checks: CoderService.getChartContentAsCodePermissionChecks(
                    chartWithDefaults,
                    currentChart,
                ),
                auditedAbility,
                project,
                slug,
            });
        }

        const { space } = await this.getOrCreateSpace(
            projectUuid,
            chartWithDefaults.spaceSlug,
            user,
            skipSpaceCreate,
            undefined,
            spaceNames,
            allowSpaceCreate,
        );
        if (!canUploadAnyContent && space.uuid !== targetSpace?.uuid) {
            await this.assertSpaceContentAccess({
                userUuid: user.userUuid,
                auditedAbility,
                action: 'update',
                subjectType: 'SavedChart',
                spaceUuids: [space.uuid],
                metadata: { savedChartUuid: chart.uuid },
                errorMessage: "You don't have access to update this chart",
            });
        }

        const { promotedChart, upstreamChart } =
            await this.promoteService.getPromoteCharts(
                user,
                projectUuid, // We use the same projectUuid for both promoted and upstream
                chart.uuid,
                true, // includeOrphanChartsWithinDashboard
                chart, // upstream === promoted project, reuse the chart we already loaded
            );
        const updatedChart = {
            ...promotedChart,
            chart: {
                ...promotedChart.chart,
                ...chartWithDefaults,
                projectUuid,
                organizationUuid: project.organizationUuid,
            },
        };

        //  we force the new space on the upstreamChart
        if (upstreamChart.chart) upstreamChart.chart.spaceUuid = space.uuid;
        let promotionChanges: PromotionChanges =
            await this.promoteService.getChartChanges(
                updatedChart,
                upstreamChart,
            );
        if (force) {
            promotionChanges = {
                ...promotionChanges,
                charts: promotionChanges.charts.map((c) =>
                    c.action === PromotionAction.NO_CHANGES
                        ? { ...c, action: PromotionAction.UPDATE }
                        : c,
                ),
            };
        }
        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
        );

        await this.syncVerification({
            user,
            projectUuid,
            organizationUuid: project.organizationUuid,
            contentType: ContentType.CHART,
            contentUuid: chart.uuid,
            verified: chartAsCode.verified,
        });

        console.info(
            `Finished updating chart "${chartWithDefaults.name}" on project ${projectUuid}: ${promotionChanges.charts[0].action}`,
        );

        return promotionChanges;
    }

    async upsertSqlChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        sqlChartAsCode: SqlChartAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        force?: boolean,
        spaceNames?: Record<string, string>,
    ): Promise<PromotionChanges> {
        const project = await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        const { canUploadAnyContent, allowSpaceCreate } =
            CoderService.checkContentAsCodeWriteAccess({
                auditedAbility,
                project,
                slug,
            });

        // Default updatedAt to now when missing (e.g. user-authored YAML)
        const sqlChartWithDefaults = {
            ...sqlChartAsCode,
            updatedAt: sqlChartAsCode.updatedAt ?? new Date(),
        };

        const sqlChartRows = await this.savedSqlModel.find({
            slugs: [slug],
            projectUuid,
        });
        const existingSqlChart = sqlChartRows[0];

        // SQL chart uploads mirror SavedSqlService. Check CustomSql before
        // resolving the space so a rejection cannot orphan a new space.
        const isUpdate = existingSqlChart !== undefined;
        if (
            auditedAbility.cannot(
                'manage',
                subject('CustomSql', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    metadata:
                        existingSqlChart !== undefined
                            ? { savedSqlUuid: existingSqlChart.saved_sql_uuid }
                            : {},
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!isUpdate && !canUploadAnyContent) {
            await this.assertCreateAccessForSpaceSlug({
                user,
                auditedAbility,
                projectUuid,
                spaceSlug: sqlChartWithDefaults.spaceSlug,
                subjectType: 'SavedChart',
                metadata: { savedSqlUuid: null },
                errorMessage:
                    "You don't have access to create this Saved SQL chart",
            });
        }

        const { space, created: spaceCreated } = await this.getOrCreateSpace(
            projectUuid,
            sqlChartAsCode.spaceSlug,
            user,
            skipSpaceCreate,
            publicSpaceCreate,
            spaceNames,
            allowSpaceCreate,
        );

        // Moves require SavedChart access in both current and target spaces.
        const savedChartAction = isUpdate ? 'update' : 'create';
        await this.assertSpaceContentAccess({
            userUuid: user.userUuid,
            auditedAbility,
            action: savedChartAction,
            subjectType: 'SavedChart',
            spaceUuids: [
                space.uuid,
                ...(existingSqlChart ? [existingSqlChart.space_uuid] : []),
            ],
            metadata: {
                savedSqlUuid: existingSqlChart?.saved_sql_uuid ?? null,
            },
            errorMessage: `You don't have access to ${savedChartAction} this Saved SQL chart`,
        });

        if (existingSqlChart === undefined) {
            // Create new SQL chart
            this.logger.info(
                `Creating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
            );

            const { savedSqlUuid } = await this.savedSqlModel.create(
                user.userUuid,
                projectUuid,
                {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                    spaceUuid: space.uuid,
                    slug: sqlChartAsCode.slug, // Force the slug from the YAML file
                },
            );

            this.logger.info(
                `Finished creating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
            );

            // Note: We use a minimal object for the promotion changes since SQL charts
            // don't have the same structure as regular charts. The CLI only uses the action.
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            uuid: savedSqlUuid,
                            name: sqlChartAsCode.name,
                            slug: sqlChartAsCode.slug,
                            spaceSlug: sqlChartAsCode.spaceSlug,
                        } as PromotionChanges['charts'][0]['data'],
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }

        // Update existing SQL chart
        this.logger.info(
            `Updating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
        );

        await this.savedSqlModel.update({
            userUuid: user.userUuid,
            savedSqlUuid: existingSqlChart.saved_sql_uuid,
            sqlChart: {
                unversionedData: {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    spaceUuid: space.uuid,
                },
                versionedData: {
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                },
            },
        });

        this.logger.info(
            `Finished updating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
        );

        const promotionChanges: PromotionChanges = {
            charts: [
                {
                    action: PromotionAction.UPDATE,
                    data: {
                        uuid: existingSqlChart.saved_sql_uuid,
                        name: sqlChartAsCode.name,
                        slug: sqlChartAsCode.slug,
                        spaceSlug: sqlChartAsCode.spaceSlug,
                    } as PromotionChanges['charts'][0]['data'],
                },
            ],
            spaces: spaceCreated
                ? [{ action: PromotionAction.CREATE, data: space }]
                : [],
            dashboards: [],
        };
        return promotionChanges;
    }

    private async findAccessibleSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
    ): Promise<SpaceSummaryBase | undefined> {
        const [space] = await this.spaceModel.find({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });

        if (
            space !== undefined &&
            !(await this.spacePermissionService.can('view', user, space.uuid))
        ) {
            throw new ForbiddenError(
                "You don't have access to a private space",
            );
        }

        return space;
    }

    private async getClosestAncestorSpaceAccessContext(
        userUuid: string,
        projectUuid: string,
        spaceSlug: string,
    ) {
        const spaceUuid = await this.spaceModel.findClosestAncestorByPath({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });
        if (spaceUuid === null) return undefined;

        const accessContexts =
            await this.spacePermissionService.getSpacesAccessContext(userUuid, [
                spaceUuid,
            ]);
        return accessContexts[spaceUuid];
    }

    // Throws unless the caller can write content as code. `canUploadAnyContent`
    // (manage:ContentAsCode) allows uploading any content, so the granular
    // space/SQL checks below don't apply.
    private static checkContentAsCodeWriteAccess({
        auditedAbility,
        project,
        slug,
    }: {
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        project: Pick<
            Project,
            | 'projectUuid'
            | 'organizationUuid'
            | 'upstreamProjectUuid'
            | 'type'
            | 'createdByUserUuid'
        >;
        slug: string;
    }): { canUploadAnyContent: boolean; allowSpaceCreate: boolean } {
        const contentAsCodeSubject = subject('ContentAsCode', {
            projectUuid: project.projectUuid,
            organizationUuid: project.organizationUuid,
            upstreamProjectUuid: project.upstreamProjectUuid,
            type: project.type,
            createdByUserUuid: project.createdByUserUuid,
            metadata: { slug },
        });
        const canUploadAnyContent = auditedAbility.can(
            'manage',
            contentAsCodeSubject,
        );
        if (auditedAbility.cannot('create', contentAsCodeSubject)) {
            throw new ForbiddenError();
        }
        const allowSpaceCreate =
            canUploadAnyContent ||
            auditedAbility.can(
                'create',
                subject('Space', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            );
        return { canUploadAnyContent, allowSpaceCreate };
    }

    private async assertSpaceContentAccess({
        userUuid,
        auditedAbility,
        action,
        subjectType,
        spaceUuids,
        metadata,
        errorMessage,
        accessContexts,
    }: {
        userUuid: string;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        action: 'create' | 'update';
        subjectType: 'SavedChart' | 'Dashboard';
        spaceUuids: string[];
        metadata?: ContentAsCodeSpaceContentMetadata;
        errorMessage: string;
        // Pre-fetched contexts to avoid refetching for the same spaces
        accessContexts?: Awaited<
            ReturnType<SpacePermissionService['getSpacesAccessContext']>
        >;
    }): Promise<void> {
        const uniqueSpaceUuids = [...new Set(spaceUuids)];
        if (uniqueSpaceUuids.length === 0) return;
        const spaceAccessContexts =
            accessContexts ??
            (await this.spacePermissionService.getSpacesAccessContext(
                userUuid,
                uniqueSpaceUuids,
            ));
        const lacksAccess = uniqueSpaceUuids.some((spaceUuid) =>
            auditedAbility.cannot(
                action,
                subject(subjectType, {
                    ...spaceAccessContexts[spaceUuid],
                    ...(metadata !== undefined ? { metadata } : {}),
                }),
            ),
        );
        if (lacksAccess) {
            throw new ForbiddenError(errorMessage);
        }
    }

    // Target space missing: gate create on the closest existing ancestor
    // BEFORE creating the space, so a denied create can't orphan a space.
    private async assertCreateAccessForSpaceSlug({
        user,
        auditedAbility,
        projectUuid,
        spaceSlug,
        subjectType,
        metadata,
        errorMessage,
    }: {
        user: SessionUser;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        projectUuid: string;
        spaceSlug: string;
        subjectType: 'SavedChart' | 'Dashboard';
        metadata?: ContentAsCodeSpaceContentMetadata;
        errorMessage: string;
    }): Promise<void> {
        const targetSpace = await this.findAccessibleSpace(
            projectUuid,
            spaceSlug,
            user,
        );
        if (targetSpace !== undefined) return;
        const ancestorSpaceAccessContext =
            await this.getClosestAncestorSpaceAccessContext(
                user.userUuid,
                projectUuid,
                spaceSlug,
            );
        if (
            ancestorSpaceAccessContext !== undefined &&
            auditedAbility.cannot(
                'create',
                subject(subjectType, {
                    ...ancestorSpaceAccessContext,
                    ...(metadata !== undefined ? { metadata } : {}),
                }),
            )
        ) {
            throw new ForbiddenError(errorMessage);
        }
    }

    // Tiles reference charts by slug with no permission filter; ensure the
    // caller can view every referenced chart in its own space.
    private async assertTileChartsViewAccess({
        userUuid,
        auditedAbility,
        projectUuid,
        tiles,
    }: {
        userUuid: string;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        projectUuid: string;
        tiles: DashboardAsCode['tiles'];
    }): Promise<void> {
        const chartSlugs = tiles.reduce<string[]>((acc, tile) => {
            if (!isAnyChartTile(tile) || tile.properties.chartSlug == null) {
                return acc;
            }
            return [...acc, tile.properties.chartSlug];
        }, []);
        if (chartSlugs.length === 0) return;

        const [charts, sqlChartRows] = await Promise.all([
            this.savedChartModel.find({
                slugs: chartSlugs,
                projectUuid,
                excludeChartsSavedInDashboard: false,
                includeOrphanChartsWithinDashboard: true,
            }),
            this.savedSqlModel.find({
                slugs: chartSlugs,
                projectUuid,
            }),
        ]);
        const referencedCharts = [
            ...charts.map((chart) => ({
                spaceUuid: chart.spaceUuid,
                metadata: { savedChartUuid: chart.uuid },
            })),
            ...sqlChartRows.map((row) => ({
                spaceUuid: row.space_uuid,
                metadata: { savedSqlUuid: row.saved_sql_uuid },
            })),
        ];
        if (referencedCharts.length === 0) return;

        const spaceAccessContexts =
            await this.spacePermissionService.getSpacesAccessContext(userUuid, [
                ...new Set(referencedCharts.map((chart) => chart.spaceUuid)),
            ]);
        const lacksAccess = referencedCharts.some((chart) =>
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    ...spaceAccessContexts[chart.spaceUuid],
                    metadata: chart.metadata,
                }),
            ),
        );
        if (lacksAccess) {
            throw new ForbiddenError(
                "You don't have access to a chart referenced by this dashboard",
            );
        }
    }

    private async assertDashboardUpdateAccess({
        userUuid,
        auditedAbility,
        dashboard,
        additionalSpaceUuids = [],
    }: {
        userUuid: string;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        dashboard: { uuid: string; spaceUuid: string | null };
        additionalSpaceUuids?: string[];
    }): Promise<void> {
        if (!dashboard.spaceUuid) {
            throw new ForbiddenError(
                "You don't have access to update this dashboard",
            );
        }
        await this.assertSpaceContentAccess({
            userUuid,
            auditedAbility,
            action: 'update',
            subjectType: 'Dashboard',
            spaceUuids: [dashboard.spaceUuid, ...additionalSpaceUuids],
            metadata: { dashboardUuid: dashboard.uuid },
            errorMessage: "You don't have access to update this dashboard",
        });
    }

    async getOrCreateSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        spaceNames?: Record<string, string>,
        allowSpaceCreate = false,
    ): Promise<{ space: SpaceSummaryBase; created: boolean }> {
        const existingSpace = await this.findAccessibleSpace(
            projectUuid,
            spaceSlug,
            user,
        );

        if (existingSpace !== undefined) {
            return { space: existingSpace, created: false };
        }
        if (skipSpaceCreate) {
            throw new NotFoundError(
                `Space ${spaceSlug} does not exist, skipping creation`,
            );
        }
        if (!allowSpaceCreate) {
            throw new ForbiddenError("You don't have access to create spaces");
        }
        const path = getLtreePathFromContentAsCodePath(spaceSlug);

        const closestAncestorSpaceUuid =
            await this.spaceModel.findClosestAncestorByPath({
                path,
                projectUuid,
            });

        const closestAncestorSpace = closestAncestorSpaceUuid
            ? await this.spaceModel.getSpaceSummary(closestAncestorSpaceUuid)
            : null;

        const remainingPath = path
            .replace(closestAncestorSpace?.path ?? '', '') // remove the closest ancestor path
            .replace(/^\./, '') // remove the leading dot
            .split('.');

        let parentSpaceUuid = closestAncestorSpaceUuid;
        let parentPath = closestAncestorSpace?.path ?? '';
        const inheritParentPermissions =
            closestAncestorSpace?.inheritParentPermissions ??
            publicSpaceCreate === true;
        const newSpaces: Omit<
            Space,
            | 'queries'
            | 'dashboards'
            | 'access'
            | 'groupsAccess'
            | 'childSpaces'
            | 'inheritsFromOrgOrProject'
        >[] = [];

        for await (const currentPath of remainingPath) {
            if (!parentPath) {
                parentPath = currentPath;
            } else {
                parentPath = `${parentPath}.${currentPath}`;
            }

            // Use the original space name from space definition files if available,
            // otherwise fall back to deriving a name from the slug path segment
            const spaceName =
                spaceNames?.[getContentAsCodePathFromLtreePath(parentPath)] ??
                friendlyName(currentPath);

            const newSpace = await this.spaceModel.createSpace(
                {
                    inheritParentPermissions,
                    name: spaceName,
                    parentSpaceUuid,
                },
                {
                    projectUuid,
                    userId: user.userId,
                    path: parentPath,
                },
            );

            if (!newSpace.inheritParentPermissions) {
                if (parentSpaceUuid) {
                    const [ctx, groupsAccess] = await Promise.all([
                        this.spacePermissionService.getAllSpaceAccessContext(
                            parentSpaceUuid,
                        ),
                        this.spacePermissionService.getGroupAccess(
                            parentSpaceUuid,
                        ),
                    ]);

                    const userAccessPromises = ctx.access
                        .filter((a) => a.hasDirectAccess)
                        .map((a) =>
                            this.spaceModel.addSpaceAccess(
                                newSpace.uuid,
                                a.userUuid,
                                a.role,
                            ),
                        );

                    const groupAccessPromises = groupsAccess.map(
                        (groupAccess) =>
                            this.spaceModel.addSpaceGroupAccess(
                                newSpace.uuid,
                                groupAccess.groupUuid,
                                groupAccess.spaceRole,
                            ),
                    );

                    await Promise.all([
                        ...userAccessPromises,
                        ...groupAccessPromises,
                    ]);
                } else {
                    await this.spaceModel.addSpaceAccess(
                        newSpace.uuid,
                        user.userUuid,
                        SpaceMemberRole.ADMIN,
                    );
                }
            }

            parentSpaceUuid = newSpace.uuid;

            newSpaces.push(newSpace);
        }

        return {
            space: {
                ...newSpaces[newSpaces.length - 1],
                chartCount: 0,
                dashboardCount: 0,
                childSpaceCount: 0,
                appCount: 0,
            },
            created: true,
        };
    }

    async upsertDashboard(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        dashboardAsCode: DashboardAsCode,
        options: UpsertContentAsCodeOptions = {},
    ): Promise<PromotionChanges> {
        const {
            skipSpaceCreate,
            publicSpaceCreate,
            force,
            spaceNames,
            mode = 'upsert',
        } = options;
        const shouldUpdateExistingContent = mode === 'upsert';
        const shouldUseExactSlug = mode === 'upsert';
        const project = await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        const { canUploadAnyContent, allowSpaceCreate } =
            CoderService.checkContentAsCodeWriteAccess({
                auditedAbility,
                project,
                slug,
            });

        // Default optional fields when missing (e.g. user-authored YAML)
        const dashboardWithDefaults = {
            ...dashboardAsCode,
            updatedAt: dashboardAsCode.updatedAt ?? new Date(),
            filters: {
                dimensions: dashboardAsCode.filters?.dimensions ?? [],
                metrics: dashboardAsCode.filters?.metrics ?? [],
                tableCalculations:
                    dashboardAsCode.filters?.tableCalculations ?? [],
            },
        };

        // Create mode treats the requested slug as a base for a new unique
        // slug instead of updating content that already owns it.
        const [dashboardSummary] = shouldUpdateExistingContent
            ? await this.dashboardModel.find({
                  slug,
                  projectUuid,
              })
            : [undefined];
        const tilesWithUuids = await this.convertTileWithSlugsToUuids(
            projectUuid,
            dashboardWithDefaults.tiles,
        );
        if (!canUploadAnyContent) {
            await this.assertTileChartsViewAccess({
                userUuid: user.userUuid,
                auditedAbility,
                projectUuid,
                tiles: dashboardWithDefaults.tiles,
            });
        }

        const dashboardFilters = CoderService.getFiltersWithTileUuids(
            dashboardWithDefaults,
            tilesWithUuids,
        );
        const dashboardConfig = dashboardWithDefaults.config
            ? CoderService.getConfigWithDateZoomTileUuids(
                  dashboardWithDefaults.config,
                  tilesWithUuids,
              )
            : dashboardWithDefaults.config;
        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (dashboardSummary === undefined) {
            if (!canUploadAnyContent) {
                await this.assertCreateAccessForSpaceSlug({
                    user,
                    auditedAbility,
                    projectUuid,
                    spaceSlug: dashboardWithDefaults.spaceSlug,
                    subjectType: 'Dashboard',
                    errorMessage:
                        "You don't have access to create dashboards in this space",
                });
            }

            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    dashboardWithDefaults.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                    spaceNames,
                    allowSpaceCreate,
                );
            if (!canUploadAnyContent) {
                await this.assertSpaceContentAccess({
                    userUuid: user.userUuid,
                    auditedAbility,
                    action: 'create',
                    subjectType: 'Dashboard',
                    spaceUuids: [space.uuid],
                    errorMessage:
                        "You don't have access to create dashboards in this space",
                });
            }

            const newDashboard = await this.dashboardModel.create(
                space.uuid,
                {
                    ...dashboardWithDefaults,
                    tiles: tilesWithUuids,
                    forceSlug: shouldUseExactSlug,
                    filters: dashboardFilters,
                    config: dashboardConfig,
                },
                user,
                projectUuid,
            );

            await this.syncVerification({
                user,
                projectUuid,
                organizationUuid: project.organizationUuid,
                contentType: ContentType.DASHBOARD,
                contentUuid: newDashboard.uuid,
                verified: dashboardAsCode.verified,
            });

            return {
                dashboards: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newDashboard,
                            spaceSlug: dashboardWithDefaults.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                dashboardWithDefaults.spaceSlug,
                            ),
                        },
                    },
                ],
                charts: [],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
            };
        }
        // Use promote service to update existing dashboard

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardSummary.uuid,
        );

        console.info(
            `Updating dashboard "${dashboard.name}" on project ${projectUuid}`,
        );

        const targetSpace = !canUploadAnyContent
            ? await this.findAccessibleSpace(
                  projectUuid,
                  dashboardWithDefaults.spaceSlug,
                  user,
              )
            : undefined;
        if (!canUploadAnyContent) {
            if (
                targetSpace === undefined &&
                !skipSpaceCreate &&
                !allowSpaceCreate
            ) {
                throw new ForbiddenError(
                    "You don't have access to create spaces",
                );
            }
            await this.assertDashboardUpdateAccess({
                userUuid: user.userUuid,
                auditedAbility,
                dashboard,
                additionalSpaceUuids: targetSpace ? [targetSpace.uuid] : [],
            });
        }

        const dashboardWithUuids = {
            ...dashboardWithDefaults,
            tiles: tilesWithUuids,
            config: dashboardConfig,
        };
        const { promotedDashboard, upstreamDashboard } =
            await this.promoteService.getPromotedDashboard(
                user,
                {
                    ...dashboard,
                    ...dashboardWithUuids,
                    filters: dashboardFilters,
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                },
                projectUuid, // We use the same projectUuid for both promoted and upstream
            );

        PromoteService.checkPromoteDashboardPermissions(
            auditedAbility,
            user.organizationUuid!,
            promotedDashboard,
            upstreamDashboard,
        );

        const { space } = await this.getOrCreateSpace(
            projectUuid,
            dashboardWithDefaults.spaceSlug,
            user,
            skipSpaceCreate,
            undefined,
            spaceNames,
            allowSpaceCreate,
        );
        if (!canUploadAnyContent && space.uuid !== targetSpace?.uuid) {
            await this.assertSpaceContentAccess({
                userUuid: user.userUuid,
                auditedAbility,
                action: 'update',
                subjectType: 'Dashboard',
                spaceUuids: [space.uuid],
                metadata: { dashboardUuid: dashboard.uuid },
                errorMessage: "You don't have access to update this dashboard",
            });
        }

        //  we force the new space on the upstreamDashboard
        if (upstreamDashboard.dashboard)
            upstreamDashboard.dashboard.spaceUuid = space.uuid;

        // TODO: Check permissions for all chart tiles
        // eslint-disable-next-line prefer-const
        let [promotionChanges, promotedCharts] =
            await this.promoteService.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
                true, // includeOrphanChartsWithinDashboard
            );

        // TODO: Right now dashboards on promote service always update dashboards
        // See isDashboardUpdated for more details

        if (force) {
            promotionChanges = {
                ...promotionChanges,
                charts: promotionChanges.charts.map((c) =>
                    c.action === PromotionAction.NO_CHANGES
                        ? { ...c, action: PromotionAction.UPDATE }
                        : c,
                ),
            };
        }

        promotionChanges = await this.promoteService.getOrCreateDashboard(
            user,
            promotionChanges,
        );

        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
            promotionChanges.dashboards[0].data.uuid,
        );

        promotionChanges = await this.promoteService.updateDashboard(
            user,
            promotionChanges,
        );

        await this.syncVerification({
            user,
            projectUuid,
            organizationUuid: project.organizationUuid,
            contentType: ContentType.DASHBOARD,
            contentUuid: dashboard.uuid,
            verified: dashboardAsCode.verified,
        });

        console.info(
            `Finished updating dashboard "${dashboard.name}" on project ${projectUuid}: ${promotionChanges.dashboards[0].action}`,
        );
        return promotionChanges;
    }
}
