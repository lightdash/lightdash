import { AgentCapability, QuerySourceType } from '@lightdash/common';
import { z } from 'zod';

export type GrantResourceType =
    | 'sql_chart'
    | 'saved_chart'
    | 'dashboard'
    | 'scheduler'
    | 'query';
export type GrantResourceScope =
    | { kind: 'none' }
    | { kind: 'path'; param: 'projectUuid' }
    | { kind: 'query'; param: 'projectUuid' };
export type GrantOperationContract =
    | { kind: 'path_project'; param: 'projectUuid' }
    | {
          kind: 'resource';
          resourceType: GrantResourceType;
          param: string;
          scope: GrantResourceScope;
      }
    | { kind: 'org_discovery' }
    | { kind: 'project_filter'; query: 'projectUuids' }
    | {
          kind: 'deployment';
          param: 'projectUuid';
          bodySchema: z.ZodType;
          overrides: 'body' | 'legacy_query';
      }
    | {
          kind: 'deployment_session';
          param: 'projectUuid';
          sessionParam: 'sessionUuid';
          bodySchema: z.ZodType;
      }
    | { kind: 'refresh'; param: 'projectUuid'; bodySchema: z.ZodType }
    | { kind: 'content_upload'; param: 'projectUuid'; bodySchema: z.ZodType }
    | {
          kind: 'source_queries';
          param: 'projectUuid';
          bodySchema: typeof sourceQueriesSchema;
      }
    | {
          kind: 'source_schema';
          param: 'projectUuid';
          sourceTypeParam: 'sourceType';
      };

const pathProject = { kind: 'path_project', param: 'projectUuid' } as const;
export const grantUploadBodySchema = z
    .object({
        access: z.never().optional(),
        spaceSlug: z.string().min(1).optional(),
    })
    .passthrough();
const upload = {
    kind: 'content_upload',
    param: 'projectUuid',
    bodySchema: grantUploadBodySchema.extend({ spaceSlug: z.string().min(1) }),
} as const;
const deployBodySchema = z
    .object({
        sourceUuid: z.string().nullish(),
        target: z
            .object({ database: z.string(), region: z.string().optional() })
            .nullish(),
    })
    .passthrough();
const deployBody = {
    kind: 'deployment',
    param: 'projectUuid',
    bodySchema: deployBodySchema,
    overrides: 'body',
} as const;
const sourceQueriesSchema = z
    .object({
        queries: z
            .array(
                z.object({ sourceType: z.enum(QuerySourceType) }).passthrough(),
            )
            .min(1),
    })
    .passthrough();

const operationContracts = {
    'UserController.getAuthenticatedUser': { kind: 'org_discovery' },
    'OrganizationController.getOrganization': { kind: 'org_discovery' },
    'apiV1Router GET /health': { kind: 'org_discovery' },
    'ProjectController.getMergedManifest': pathProject,
    'AppGenerateController.listProjectApps': pathProject,
    'AppGenerateController.listProjectChartTypes': pathProject,
    'AppGenerateController.getAppCode': pathProject,
    'ValidationController.get': pathProject,
    'SavedChartController.exportSavedChartImage': {
        kind: 'resource',
        resourceType: 'saved_chart',
        param: 'chartUuid',
        scope: { kind: 'query', param: 'projectUuid' },
    },
    'ProjectController.getProject': pathProject,
    'ProjectController.GetDbtExposures': pathProject,
    'ProjectController.refresh': {
        kind: 'refresh',
        param: 'projectUuid',
        bodySchema: z
            .object({ syncContent: z.literal(false).optional() })
            .passthrough(),
    },
    'ProjectController.getSpacesInProject': pathProject,
    'ProjectController.getDashboards': pathProject,
    'ProjectController.replaceYamlTags': pathProject,
    'ProjectController.replaceProjectTableGroups': pathProject,
    'ProjectDbtSourcesController.listProjectDbtSources': pathProject,
    'ProjectDefaultsController.replaceProjectDefaults': pathProject,
    'ParametersController.replaceParameters': pathProject,
    'AiAccessController.getMyAccess': pathProject,
    'ExploreController.GetExplores': pathProject,
    'ExploreController.GetExplore': pathProject,
    'ExploreController.CompileQuery': pathProject,
    'ExploreController.CheckPreAggregate': pathProject,
    'ExploreController.ValidateFormula': pathProject,
    'ExploreController.SetExplores': {
        kind: 'deployment',
        param: 'projectUuid',
        bodySchema: z.array(z.unknown()),
        overrides: 'legacy_query',
    },
    'DeployController.deployExplores': deployBody,
    'DeployController.startDeploySession': deployBody,
    'DeployController.addDeployBatch': {
        kind: 'deployment_session',
        param: 'projectUuid',
        sessionParam: 'sessionUuid',
        bodySchema: deployBodySchema,
    },
    'DeployController.finalizeDeploySession': {
        kind: 'deployment_session',
        param: 'projectUuid',
        sessionParam: 'sessionUuid',
        bodySchema: deployBodySchema,
    },
    'QueryController.executeAsyncMetricQuery': pathProject,
    'QueryController.executeAsyncSqlQuery': pathProject,
    'QueryController.executeAsyncComposeSqlQuery': pathProject,
    'QueryController.getAsyncQueryResults': {
        kind: 'resource',
        resourceType: 'query',
        param: 'queryUuid',
        scope: { kind: 'path', param: 'projectUuid' },
    },
    'QueryController.getQueryHistory': pathProject,
    'SqlRunnerController.getTables': pathProject,
    'SqlRunnerController.getTableFields': pathProject,
    'SqlRunnerController.refreshSqlRunnerCatalog': pathProject,
    'SqlRunnerController.deleteSqlChart': {
        kind: 'resource',
        resourceType: 'sql_chart',
        param: 'uuid',
        scope: { kind: 'path', param: 'projectUuid' },
    },
    'SqlRunnerController.getSavedSqlChart': {
        kind: 'resource',
        resourceType: 'sql_chart',
        param: 'uuid',
        scope: { kind: 'path', param: 'projectUuid' },
    },
    'SqlRunnerController.getSavedSqlChartBySlug': {
        kind: 'resource',
        resourceType: 'sql_chart',
        param: 'slug',
        scope: { kind: 'path', param: 'projectUuid' },
    },
    'SchedulerController.get': {
        kind: 'resource',
        resourceType: 'scheduler',
        param: 'schedulerUuid',
        scope: { kind: 'none' },
    },
    'QuerySourceController.listQuerySources': pathProject,
    'QuerySourceController.getSourceQueryStatus': pathProject,
    'QuerySourceController.executeSourceQueries': {
        kind: 'source_queries',
        param: 'projectUuid',
        bodySchema: sourceQueriesSchema,
    },
    'QuerySourceController.scanQuerySourceSchema': {
        kind: 'source_schema',
        param: 'projectUuid',
        sourceTypeParam: 'sourceType',
    },
    'ContentController.listContent': {
        kind: 'project_filter',
        query: 'projectUuids',
    },
    'ContentController.listDeletedContent': {
        kind: 'project_filter',
        query: 'projectUuids',
    },
    'dashboardRouter GET /:dashboardUuidOrSlug': {
        kind: 'resource',
        resourceType: 'dashboard',
        param: 'dashboardUuidOrSlug',
        scope: { kind: 'query', param: 'projectUuid' },
    },
    'ProjectCoderController.getChartsAsCode': pathProject,
    'ProjectCoderController.getDashboardsAsCode': pathProject,
    'ProjectCoderController.getSqlChartsAsCode': pathProject,
    'ProjectCoderController.getVirtualViewsAsCode': pathProject,
    'ProjectCoderController.getScheduledDeliveriesAsCode': pathProject,
    'ProjectCoderController.getAlertsAsCode': pathProject,
    'ProjectCoderController.getGoogleSheetsSyncsAsCode': pathProject,
    'ProjectCoderController.getCodeSpaces': pathProject,
    'ProjectCoderController.getAiAgentsAsCode': pathProject,
    'ProjectCoderController.getExternalConnectionsAsCode': pathProject,
    'ProjectCoderController.getDocumentsAsCode': pathProject,
    'ProjectCoderController.getHomepagesAsCode': pathProject,
    'ProjectCoderController.getContentAsCodeUploadAdvisory': pathProject,
    'ProjectCoderController.upsertChartAsCode': upload,
    'ProjectCoderController.upsertDashboardAsCode': upload,
    'ProjectCoderController.upsertSqlChartAsCode': upload,
    'ProjectCoderController.upsertVirtualViewAsCode': {
        ...upload,
        bodySchema: grantUploadBodySchema,
    },
} satisfies Record<string, GrantOperationContract>;

export type OperationKey = keyof typeof operationContracts;
export const GRANT_OPERATION_CONTRACTS: Readonly<
    Record<OperationKey, GrantOperationContract>
> = operationContracts;
export const getGrantOperationContract = (
    key: string,
): GrantOperationContract | null =>
    Object.prototype.hasOwnProperty.call(GRANT_OPERATION_CONTRACTS, key)
        ? GRANT_OPERATION_CONTRACTS[key as OperationKey]
        : null;

export const GRANT_MCP_TOOL_CONTRACTS: Readonly<Record<string, never>> = {};
export const sourceRequiresRawSql = (sourceType: QuerySourceType): boolean =>
    sourceType === QuerySourceType.SQL ||
    sourceType === QuerySourceType.DUCKDB ||
    sourceType === QuerySourceType.EXTERNAL;
export const sourceEffectCapabilities = (
    sources: QuerySourceType[],
): AgentCapability[] =>
    sources.some(sourceRequiresRawSql) ? [AgentCapability.RawSql] : [];
