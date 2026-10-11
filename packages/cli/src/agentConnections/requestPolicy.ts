type RequestPolicy = {
    method: string;
    path: string;
    operation: string;
    safeRead: boolean;
};
const route = (
    method: string,
    path: string,
    operation: string,
): RequestPolicy => ({ method, path, operation, safeRead: method === 'GET' });

export const REQUEST_POLICY: readonly RequestPolicy[] = [
    route('GET', '/api/v1/user', 'UserController.getAuthenticatedUser'),
    route('GET', '/api/v1/health', 'apiV1Router GET /health'),
    route(
        'GET',
        '/api/v2/user/agent-connections/:grant/status',
        'AgentConnectionController.getConnectionStatus',
    ),
    route(
        'DELETE',
        '/api/v2/user/agent-connections/:grant',
        'AgentConnectionController.revoke',
    ),
    route(
        'GET',
        '/api/v2/projects/:project/ai-access/me',
        'AiAccessController.getMyAccess',
    ),
    route('GET', '/api/v1/projects/:project', 'ProjectController.getProject'),
    route(
        'GET',
        '/api/v1/projects/:project/dbt/manifest',
        'ProjectController.getMergedManifest',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/dbt-exposures',
        'ProjectController.GetDbtExposures',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/explores',
        'ExploreController.GetExplores',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/explores/:explore',
        'ExploreController.GetExplore',
    ),
    route(
        'GET',
        '/api/v2/projects/:project/query/:query',
        'QueryController.getAsyncQueryResults',
    ),
    route(
        'POST',
        '/api/v2/projects/:project/query/sql',
        'QueryController.executeAsyncSqlQuery',
    ),
    route(
        'POST',
        '/api/v2/projects/:project/query/metric-query',
        'QueryController.executeAsyncMetricQuery',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/sqlRunner/fields',
        'SqlRunnerController.getTableFields',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/sqlRunner/tables',
        'SqlRunnerController.getTables',
    ),
    route(
        'POST',
        '/api/v1/projects/:project/sqlRunner/refresh-catalog',
        'SqlRunnerController.refreshSqlRunnerCatalog',
    ),
    route(
        'POST',
        '/api/v1/projects/:project/refresh',
        'ProjectController.refresh',
    ),
    route(
        'PUT',
        '/api/v1/projects/:project/tags/yaml',
        'ProjectController.replaceYamlTags',
    ),
    route(
        'PUT',
        '/api/v2/projects/:project/parameters',
        'ParametersController.replaceParameters',
    ),
    route(
        'PUT',
        '/api/v2/projects/:project/defaults',
        'ProjectDefaultsController.replaceProjectDefaults',
    ),
    route(
        'PUT',
        '/api/v1/projects/:project/table-groups',
        'ProjectController.replaceProjectTableGroups',
    ),
    route(
        'POST',
        '/api/v2/projects/:project/deploy',
        'DeployController.startDeploySession',
    ),
    route(
        'POST',
        '/api/v2/projects/:project/deploy/:session/batch',
        'DeployController.addDeployBatch',
    ),
    route(
        'POST',
        '/api/v2/projects/:project/deploy/:session/finalize',
        'DeployController.finalizeDeploySession',
    ),
    route(
        'PUT',
        '/api/v2/projects/:project/deploy',
        'DeployController.deployExplores',
    ),
    route(
        'PUT',
        '/api/v1/projects/:project/explores',
        'ExploreController.SetExplores',
    ),
    route('GET', '/api/v2/content', 'ContentController.listContent'),
    route(
        'GET',
        '/api/v1/ee/projects/:project/apps',
        'AppGenerateController.listProjectApps',
    ),
    route(
        'GET',
        '/api/v1/ee/projects/:project/apps/chart-types',
        'AppGenerateController.listProjectChartTypes',
    ),
    route(
        'GET',
        '/api/v1/ee/projects/:project/apps/:app/download',
        'AppGenerateController.getAppCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/spaces',
        'ProjectController.getSpacesInProject',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/dashboards',
        'ProjectController.getDashboards',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/dbt-sources',
        'ProjectDbtSourcesController.listProjectDbtSources',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/validate',
        'ValidationController.get',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/charts',
        'ProjectCoderController.getChartsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/dashboards',
        'ProjectCoderController.getDashboardsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/sqlCharts',
        'ProjectCoderController.getSqlChartsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/virtualViews',
        'ProjectCoderController.getVirtualViewsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/externalConnections',
        'ProjectCoderController.getExternalConnectionsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/documents',
        'ProjectCoderController.getDocumentsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/aiAgents',
        'ProjectCoderController.getAiAgentsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/alerts',
        'ProjectCoderController.getAlertsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/googleSheets',
        'ProjectCoderController.getGoogleSheetsSyncsAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/scheduledDeliveries',
        'ProjectCoderController.getScheduledDeliveriesAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/homepages',
        'ProjectCoderController.getHomepagesAsCode',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/spaces',
        'ProjectCoderController.getCodeSpaces',
    ),
    route(
        'GET',
        '/api/v1/projects/:project/code/upload-advisory',
        'ProjectCoderController.getContentAsCodeUploadAdvisory',
    ),
    route(
        'POST',
        '/api/v1/projects/:project/code/charts/:slug',
        'ProjectCoderController.upsertChartAsCode',
    ),
    route(
        'POST',
        '/api/v1/projects/:project/code/dashboards/:slug',
        'ProjectCoderController.upsertDashboardAsCode',
    ),
    route(
        'POST',
        '/api/v1/projects/:project/code/sqlCharts/:slug',
        'ProjectCoderController.upsertSqlChartAsCode',
    ),
    route(
        'POST',
        '/api/v1/projects/:project/code/virtualViews/:slug',
        'ProjectCoderController.upsertVirtualViewAsCode',
    ),
];

export const isAgentRequestAllowed = (method: string, url: string): boolean => {
    const path = url.split(/[?#]/, 1)[0];
    const parts = path.split('/');
    return REQUEST_POLICY.some((entry) => {
        if (entry.method !== method) return false;
        const pattern = entry.path.split('/');
        return (
            parts.length === pattern.length &&
            pattern.every((part, index) =>
                part.startsWith(':')
                    ? parts[index].length > 0
                    : part === parts[index],
            )
        );
    });
};

export const assertAgentRequestAllowed = (
    method: string,
    url: string,
): void => {
    if (!isAgentRequestAllowed(method, url))
        throw new Error(
            'This request is not available with an agent connection. No request was sent.',
        );
};
