import { subject } from '@casl/ability';
import {
    AllChartsSearchResult,
    ComposerChartSearchResult,
    DashboardSearchResult,
    DashboardTabResult,
    DataAppSearchResult,
    FeatureFlags,
    FieldSearchResult,
    ForbiddenError,
    isDashboardSearchResult,
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
import { fromSession } from '../../auth/account';
import type { AppGenerateService } from '../../ee/services/AppGenerateService/AppGenerateService';
import {
    OmnibarSearchTiming,
    timeOmnibarSearch,
    timeOmnibarSearchSync,
} from '../../logging/omnibarSearchTiming';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { searchReservingVerified } from '../../models/SearchModel/utils/search';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import type { DocumentService } from '../DocumentService/DocumentService';
import {
    type AccessTarget,
    type SpacePermissionService,
} from '../SpaceService/SpacePermissionService';
import { checkUserAttributesAccess } from '../UserAttributesService/UserAttributeUtils';

type SearchServiceArguments = {
    analytics: LightdashAnalytics;
    documentService: DocumentService;
    searchModel: SearchModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    userAttributesModel: UserAttributesModel;
    spacePermissionService: SpacePermissionService;
    featureFlagModel: Pick<
        FeatureFlagModel,
        'get' | 'getDisabledLiveIntegrations'
    >;
    // EE-only — undefined on OSS builds where data apps don't exist.
    appGenerateService?: AppGenerateService;
};

export type FindContentSearchResult =
    | (DashboardSearchResult & { contentType: 'dashboard' })
    | (AllChartsSearchResult & { contentType: 'chart' })
    | (ComposerChartSearchResult & { contentType: 'composer_chart' })
    | (DataAppSearchResult & { contentType: 'data_app' });

export class SearchService extends BaseService {
    private static getContentAccessTarget(
        content: DashboardSearchResult | AllChartsSearchResult,
    ): AccessTarget | null {
        if ('charts' in content) {
            return {
                type: 'dashboard',
                dashboardUuid: content.uuid,
                spaceUuid: content.spaceUuid,
            };
        }
        if (content.chartSource === 'sql') {
            return content.spaceUuid
                ? {
                      type: 'sqlChart',
                      savedSqlUuid: content.uuid,
                      spaceUuid: content.spaceUuid,
                  }
                : null;
        }
        return {
            type: 'chart',
            chartUuid: content.uuid,
            dashboardUuid: content.dashboardUuid,
            spaceUuid: content.spaceUuid,
        };
    }

    private readonly searchModel: SearchModel;

    private readonly documentService: DocumentService;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly featureFlagModel: SearchServiceArguments['featureFlagModel'];

    private readonly appGenerateService?: AppGenerateService;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.searchModel = args.searchModel;
        this.documentService = args.documentService;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.userAttributesModel = args.userAttributesModel;
        this.spacePermissionService = args.spacePermissionService;
        this.featureFlagModel = args.featureFlagModel;
        this.appGenerateService = args.appGenerateService;
    }

    async findContent(
        user: SessionUser,
        projectUuid: string,
        query: string,
        verifiedOnly: boolean,
    ): Promise<{
        content: FindContentSearchResult[];
    }> {
        const { organizationUuid, name: projectName } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const [
            dashboardSearchResults,
            chartSearchResults,
            dataAppSearchResults,
            composerChartSearchResults,
        ] = await Promise.all([
            searchReservingVerified(verifiedOnly, (opts) =>
                this.searchModel.searchDashboards(
                    projectUuid,
                    query,
                    undefined,
                    { fullTextSearchOperator: 'OR', ...opts },
                ),
            ),
            searchReservingVerified(verifiedOnly, (opts) =>
                this.searchModel.searchAllCharts(projectUuid, query, {
                    fullTextSearchOperator: 'OR',
                    ...opts,
                }),
            ),
            this.appGenerateService
                ? this.appGenerateService
                      .dataAppsEnabledFor(user)
                      .then((enabled) =>
                          enabled
                              ? this.searchModel.searchDataApps(
                                    projectUuid,
                                    query,
                                    undefined,
                                    {
                                        fullTextSearchOperator: 'OR',
                                        verifiedOnly,
                                    },
                                )
                              : [],
                      )
                : Promise.resolve([]),
            this.findComposerCharts(
                user,
                organizationUuid,
                projectUuid,
                query,
                verifiedOnly,
            ),
        ]);

        const allContent = [
            ...dashboardSearchResults,
            ...chartSearchResults,
        ] satisfies (DashboardSearchResult | AllChartsSearchResult)[];
        if (
            allContent.length === 0 &&
            dataAppSearchResults.length === 0 &&
            composerChartSearchResults.length === 0
        ) {
            return { content: [] };
        }

        // Resource-aware targets: direct grants on a dashboard, chart, or SQL
        // chart count exactly like space access. Rows without a resolvable
        // location (dashboard-owned SQL definitions have no own space) drop.
        const contentWithTargets = allContent.flatMap((content) => {
            const target = SearchService.getContentAccessTarget(content);
            return target ? [{ content, target }] : [];
        });
        const [resolvedContexts, visibleDataApps] = await Promise.all([
            this.spacePermissionService.resolveAccessBatch(
                user.userUuid,
                contentWithTargets.map(({ target }) => target),
            ),
            this.appGenerateService && dataAppSearchResults.length > 0
                ? this.appGenerateService.filterAppsUserCanView(
                      user,
                      organizationUuid,
                      projectUuid,
                      dataAppSearchResults,
                  )
                : Promise.resolve([]),
        ]);

        const contentWithContext = contentWithTargets.flatMap(
            ({ content }, index) => {
                const context = resolvedContexts[index]?.context;
                return context ? [{ content, context }] : [];
            },
        );
        const accessResults = auditedAbility.canBulk(
            'view',
            contentWithContext.map(({ content, context }) =>
                'charts' in content
                    ? subject('Dashboard', {
                          ...context,
                          metadata: {
                              dashboardUuid: content.uuid,
                              dashboardName: content.name,
                          },
                      })
                    : subject('SavedChart', {
                          ...context,
                          metadata: {
                              savedChartUuid: content.uuid,
                              savedChartName: content.name,
                          },
                      }),
            ),
        );

        return {
            content: [
                ...contentWithContext
                    .filter((_, index) => accessResults[index])
                    .map(
                        ({ content }): FindContentSearchResult =>
                            isDashboardSearchResult(content)
                                ? { ...content, contentType: 'dashboard' }
                                : { ...content, contentType: 'chart' },
                    ),
                ...visibleDataApps.map(
                    (dataApp): FindContentSearchResult => ({
                        ...dataApp,
                        contentType: 'data_app',
                    }),
                ),
                ...composerChartSearchResults.map(
                    (composerChart): FindContentSearchResult => ({
                        ...composerChart,
                        contentType: 'composer_chart',
                    }),
                ),
            ],
        };
    }

    /** Space-owned composer charts the user can view as charts in their space; none with the flag off or verified only. */
    private async findComposerCharts(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
        query: string,
        verifiedOnly: boolean,
    ): Promise<ComposerChartSearchResult[]> {
        if (verifiedOnly) return [];
        const { enabled } = await this.featureFlagModel.get({
            user: { userUuid: user.userUuid, organizationUuid },
            featureFlagId: FeatureFlags.ComposerCharts,
        });
        if (!enabled) return [];
        const composerCharts = await this.searchModel.searchComposerCharts(
            projectUuid,
            query,
            undefined,
            { fullTextSearchOperator: 'OR' },
        );
        if (composerCharts.length === 0) return [];
        const resolved = await this.spacePermissionService.resolveAccessBatch(
            user.userUuid,
            composerCharts.map(({ spaceUuid }) => ({
                type: 'space' as const,
                spaceUuid,
            })),
        );
        const withContext = composerCharts.flatMap((composerChart, index) => {
            const context = resolved[index]?.context;
            return context ? [{ composerChart, context }] : [];
        });
        const allowed = this.createAuditedAbility(user).canBulk(
            'view',
            withContext.map(({ composerChart, context }) =>
                subject('SavedChart', {
                    ...context,
                    metadata: {
                        composerChartUuid: composerChart.uuid,
                        composerChartName: composerChart.name,
                    },
                }),
            ),
        );
        return withContext
            .filter((_, index) => allowed[index])
            .map(({ composerChart }) => composerChart);
    }

    async getSearchResults(
        user: SessionUser,
        projectUuid: string,
        query: string,
        source: 'omnibar' | 'ai_search_box' = 'omnibar',
        filters?: SearchFilters,
    ): Promise<SearchResults> {
        const timing =
            source === 'omnibar'
                ? new OmnibarSearchTiming({
                      verifiedOnly: filters?.verifiedOnly === true,
                  })
                : undefined;
        let outcome: 'success' | 'error' = 'error';
        try {
            const getProjectSummary = () =>
                this.projectModel.getSummary(projectUuid);
            const { organizationUuid, name: projectName } =
                await timeOmnibarSearch(
                    timing,
                    'projectSummary',
                    getProjectSummary,
                );

            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid,
                        metadata: { projectUuid, projectName },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }

            const excludedIntegrations =
                await this.featureFlagModel.getDisabledLiveIntegrations(
                    organizationUuid,
                );
            const search = () =>
                this.searchModel.search(
                    projectUuid,
                    query,
                    filters,
                    timing,
                    excludedIntegrations,
                );
            const results = await timeOmnibarSearch(
                timing,
                'searchModel',
                search,
            );

            const spaceUuids = [
                ...new Set(results.spaces.map((space) => space.uuid)),
            ];

            const getAccessibleSpaceUuids = () =>
                this.spacePermissionService.getAccessibleSpaceUuids(
                    'view',
                    user,
                    spaceUuids,
                );
            const accessibleSpaceUuids = await timeOmnibarSearch(
                timing,
                'spaceAccess',
                getAccessibleSpaceUuids,
            );

            // Content rows resolve resource-aware access in one batch so direct
            // grants count exactly like space access; spaces themselves cannot
            // carry grants and keep the plain space check above.
            type SearchAccessEntry =
                | {
                      kind: 'dashboard';
                      index: number;
                      target: AccessTarget;
                      name: string;
                      uuid: string;
                  }
                | {
                      kind: 'dashboardTab';
                      index: number;
                      target: AccessTarget;
                      name: string;
                      uuid: string;
                  }
                | {
                      kind: 'savedChart';
                      index: number;
                      target: AccessTarget;
                      name: string;
                      uuid: string;
                  }
                | {
                      kind: 'sqlChart';
                      index: number;
                      target: AccessTarget;
                      name: string;
                      uuid: string;
                  }
                | {
                      kind: 'composerChart';
                      index: number;
                      target: AccessTarget;
                      name: string;
                      uuid: string;
                  };
            const composerChartsEnabled =
                results.composerCharts.length > 0 &&
                (
                    await this.featureFlagModel.get({
                        user: {
                            userUuid: user.userUuid,
                            organizationUuid,
                        },
                        featureFlagId: FeatureFlags.ComposerCharts,
                    })
                ).enabled;
            const accessEntries: SearchAccessEntry[] = [
                ...results.dashboards.map((dashboard, index) => ({
                    kind: 'dashboard' as const,
                    index,
                    target: {
                        type: 'dashboard' as const,
                        dashboardUuid: dashboard.uuid,
                        spaceUuid: dashboard.spaceUuid,
                    },
                    name: dashboard.name,
                    uuid: dashboard.uuid,
                })),
                ...results.dashboardTabs.map((dashboardTab, index) => ({
                    kind: 'dashboardTab' as const,
                    index,
                    target: {
                        type: 'dashboard' as const,
                        dashboardUuid: dashboardTab.dashboardUuid,
                        spaceUuid: dashboardTab.spaceUuid,
                    },
                    name: dashboardTab.dashboardName,
                    uuid: dashboardTab.dashboardUuid,
                })),
                ...results.savedCharts.map((savedChart, index) => ({
                    kind: 'savedChart' as const,
                    index,
                    target: {
                        type: 'chart' as const,
                        chartUuid: savedChart.uuid,
                        dashboardUuid: savedChart.dashboardUuid,
                        spaceUuid: savedChart.spaceUuid,
                    },
                    name: savedChart.name,
                    uuid: savedChart.uuid,
                })),
                // Dashboard-owned SQL definitions have no own space and drop here,
                // matching the previous space-membership behavior.
                ...results.sqlCharts.flatMap((sqlChart, index) =>
                    sqlChart.spaceUuid
                        ? [
                              {
                                  kind: 'sqlChart' as const,
                                  index,
                                  target: {
                                      type: 'sqlChart' as const,
                                      savedSqlUuid: sqlChart.uuid,
                                      spaceUuid: sqlChart.spaceUuid,
                                  },
                                  name: sqlChart.name,
                                  uuid: sqlChart.uuid,
                              },
                          ]
                        : [],
                ),
                // A space-owned composer chart is checked as a chart in its space
                ...(composerChartsEnabled ? results.composerCharts : []).map(
                    (composerChart, index) => ({
                        kind: 'composerChart' as const,
                        index,
                        target: {
                            type: 'space' as const,
                            spaceUuid: composerChart.spaceUuid,
                        },
                        name: composerChart.name,
                        uuid: composerChart.uuid,
                    }),
                ),
            ];
            const resolveContentAccess = () =>
                this.spacePermissionService.resolveAccessBatch(
                    user.userUuid,
                    accessEntries.map(({ target }) => target),
                );
            const resolvedContexts = await timeOmnibarSearch(
                timing,
                'contentAccess',
                resolveContentAccess,
            );
            const entriesWithContext = accessEntries.flatMap((entry, index) => {
                const context = resolvedContexts[index]?.context;
                return context ? [{ entry, context }] : [];
            });
            const entryAccessResults = auditedAbility.canBulk(
                'view',
                entriesWithContext.map(({ entry, context }) =>
                    entry.kind === 'dashboard' || entry.kind === 'dashboardTab'
                        ? subject('Dashboard', {
                              ...context,
                              metadata: {
                                  dashboardUuid: entry.uuid,
                                  dashboardName: entry.name,
                              },
                          })
                        : subject('SavedChart', {
                              ...context,
                              metadata:
                                  entry.kind === 'composerChart'
                                      ? {
                                            composerChartUuid: entry.uuid,
                                            composerChartName: entry.name,
                                        }
                                      : {
                                            savedChartUuid: entry.uuid,
                                            savedChartName: entry.name,
                                        },
                          }),
                ),
            );
            const allowedIndexes: Record<
                SearchAccessEntry['kind'],
                Set<number>
            > = {
                dashboard: new Set(),
                dashboardTab: new Set(),
                savedChart: new Set(),
                sqlChart: new Set(),
                composerChart: new Set(),
            };
            entriesWithContext.forEach(({ entry }, index) => {
                if (entryAccessResults[index]) {
                    allowedIndexes[entry.kind].add(entry.index);
                }
            });

            const hasExploreAccess = auditedAbility.can(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            );

            const dimensionsHaveUserAttributes = results.fields.some(
                (field) =>
                    field.requiredAttributes !== undefined ||
                    field.anyAttributes !== undefined ||
                    Object.values(field.tablesRequiredAttributes || {}).some(
                        (tableHaveUserAttributes) =>
                            tableHaveUserAttributes !== undefined,
                    ) ||
                    Object.values(field.tablesAnyAttributes || {}).some(
                        (tableHaveUserAttributes) =>
                            tableHaveUserAttributes !== undefined,
                    ),
            );
            const tablesHaveUserAttributes = results.tables.some(
                (table) =>
                    !isTableErrorSearchResult(table) &&
                    (table.requiredAttributes !== undefined ||
                        table.anyAttributes !== undefined),
            );
            let filteredFields: FieldSearchResult[] = [];
            let filteredTables: (TableSearchResult | TableErrorSearchResult)[] =
                [];
            if (hasExploreAccess) {
                if (dimensionsHaveUserAttributes || tablesHaveUserAttributes) {
                    const getUserAttributes = () =>
                        this.userAttributesModel.getAttributeValuesForOrgMember(
                            {
                                organizationUuid,
                                userUuid: user.userUuid,
                            },
                        );
                    const userAttributes = await timeOmnibarSearch(
                        timing,
                        'userAttributes',
                        getUserAttributes,
                    );
                    filteredFields = results.fields.filter((field) => {
                        // Check field-level attributes
                        if (
                            !checkUserAttributesAccess(
                                field.requiredAttributes,
                                field.anyAttributes,
                                userAttributes,
                            )
                        )
                            return false;

                        // Check table-level attributes for all referenced tables
                        const tableRefs = new Set([
                            ...Object.keys(
                                field.tablesRequiredAttributes || {},
                            ),
                            ...Object.keys(field.tablesAnyAttributes || {}),
                        ]);
                        return [...tableRefs].every((tableRef) =>
                            checkUserAttributesAccess(
                                field.tablesRequiredAttributes?.[tableRef],
                                field.tablesAnyAttributes?.[tableRef],
                                userAttributes,
                            ),
                        );
                    });
                    filteredTables = results.tables.filter(
                        (table) =>
                            isTableErrorSearchResult(table) ||
                            checkUserAttributesAccess(
                                table.requiredAttributes,
                                table.anyAttributes,
                                userAttributes,
                            ),
                    );
                } else {
                    filteredFields = results.fields;
                    filteredTables = results.tables;
                }
            }

            const accessibleSpaceUuidSet = new Set(accessibleSpaceUuids);

            // Data apps are EE-only and have a per-app permission shape (space
            // access OR creator self-access). Skip entirely on OSS builds and
            // when the feature flag is off; otherwise filter via the bulk helper.
            let filteredDataApps: SearchResults['dataApps'] = [];
            if (this.appGenerateService && results.dataApps.length > 0) {
                const { appGenerateService } = this;
                const filterDataApps = async () => {
                    const dataAppsEnabled =
                        await appGenerateService.dataAppsEnabledFor(user);
                    if (dataAppsEnabled) {
                        return appGenerateService.filterAppsUserCanView(
                            user,
                            organizationUuid,
                            projectUuid,
                            results.dataApps,
                        );
                    }
                    return [];
                };
                filteredDataApps = await timeOmnibarSearch(
                    timing,
                    'dataAppAccess',
                    filterDataApps,
                );
            }

            const visibleDocumentUuids = new Set(
                results.documents.length > 0
                    ? await this.documentService.filterViewableUuids(
                          fromSession(user),
                          [projectUuid],
                          results.documents.map(({ uuid }) => uuid),
                      )
                    : [],
            );

            const assembleResults = () => {
                const filteredResults = {
                    ...results,
                    tables: filteredTables,
                    fields: filteredFields,
                    dashboards: results.dashboards.filter((_, index) =>
                        allowedIndexes.dashboard.has(index),
                    ),
                    dashboardTabs: results.dashboardTabs.filter((_, index) =>
                        allowedIndexes.dashboardTab.has(index),
                    ),
                    savedCharts: results.savedCharts.filter((_, index) =>
                        allowedIndexes.savedChart.has(index),
                    ),
                    sqlCharts: results.sqlCharts.filter((_, index) =>
                        allowedIndexes.sqlChart.has(index),
                    ),
                    spaces: results.spaces.filter((space) =>
                        accessibleSpaceUuidSet.has(space.uuid),
                    ),
                    pages: auditedAbility.can(
                        'view',
                        subject('Analytics', {
                            organizationUuid,
                            metadata: { projectUuid, projectName },
                        }),
                    )
                        ? results.pages
                        : [],
                    dataApps: filteredDataApps,
                    documents: results.documents.filter(({ uuid }) =>
                        visibleDocumentUuids.has(uuid),
                    ),
                    composerCharts: results.composerCharts.filter((_, index) =>
                        allowedIndexes.composerChart.has(index),
                    ),
                };

                this.analytics.track({
                    event: 'project.search',
                    userId: user.userUuid,
                    properties: {
                        projectId: projectUuid,
                        spacesResultsCount: filteredResults.spaces.length,
                        dashboardsResultsCount:
                            filteredResults.dashboards.length,
                        savedChartsResultsCount:
                            filteredResults.savedCharts.length,
                        sqlChartsResultsCount: filteredResults.sqlCharts.length,
                        tablesResultsCount: filteredResults.tables.length,
                        fieldsResultsCount: filteredResults.fields.length,
                        dashboardTabsResultsCount:
                            filteredResults.dashboardTabs.length,
                        dataAppsResultsCount: filteredResults.dataApps.length,
                        source,
                        verifiedOnly: filters?.verifiedOnly === true,
                        typeFilter: filters?.type ?? null,
                    },
                });

                return filteredResults;
            };
            const filteredResults = timeOmnibarSearchSync(
                timing,
                'resultAssembly',
                assembleResults,
            );
            outcome = 'success';
            return filteredResults;
        } finally {
            if (timing) {
                try {
                    this.logger.info(
                        'Omnibar search timing completed',
                        timing.snapshot(outcome),
                    );
                } catch (loggingError) {
                    void loggingError;
                }
            }
        }
    }
}
