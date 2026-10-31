import path from 'path';
import { isAgentRequestAllowed, REQUEST_POLICY } from './requestPolicy';

const inventoryPath = path.join(
    __dirname,
    '../../../backend/src/auth/agentConnectionGrants/cliOperationInventory.ts',
);
it('pins every admitted and refused inventory operation to the method and route catalogue', async () => {
    const {
        CLI_GRANT_OPERATION_INVENTORY,
        CLI_CONNECTION_LIFECYCLE_OPERATIONS,
    } = (await import(inventoryPath)) as {
        CLI_GRANT_OPERATION_INVENTORY: {
            callSite: string;
            method: string;
            endpoint: string;
            operations: string[];
            disposition: 'allowed' | 'refused' | 'external';
        }[];
        CLI_CONNECTION_LIFECYCLE_OPERATIONS: string[];
    };

    const expected = new Set([
        ...CLI_GRANT_OPERATION_INVENTORY.filter(
            (entry) => entry.disposition === 'allowed',
        ).flatMap((entry) => entry.operations),
        ...CLI_CONNECTION_LIFECYCLE_OPERATIONS,
    ]);
    expect(new Set(REQUEST_POLICY.map((entry) => entry.operation))).toEqual(
        expected,
    );
    for (const entry of CLI_GRANT_OPERATION_INVENTORY.filter(
        (item) => item.disposition !== 'external',
    )) {
        for (const operation of entry.operations) {
            const routes = REQUEST_POLICY.filter(
                (route) => route.operation === operation,
            );
            if (entry.disposition === 'refused') {
                expect(routes).toEqual([]);
            } else {
                expect(routes.length).toBeGreaterThan(0);
                expect(
                    routes.every((route) => route.method === entry.method),
                ).toBe(true);
                for (const route of routes) {
                    expect(
                        isAgentRequestAllowed(
                            entry.method,
                            route.path.replace(/:[a-zA-Z]+/g, 'fixture'),
                        ),
                    ).toBe(true);
                }
            }
        }
        const literal = entry.endpoint.match(/^[`'](\/api\/[^`']*)[`']$/);
        if (
            literal &&
            !literal[1].includes('${config.') &&
            !literal[1].includes('${\n') &&
            !literal[1].includes('${new ')
        ) {
            const sample = literal[1]
                .replace(/\$\{pageSizeParam\}/g, '')
                .replace(/\$\{[^}]+\}/g, 'fixture')
                .split('?')[0];
            expect(isAgentRequestAllowed(entry.method, sample)).toBe(
                entry.disposition === 'allowed',
            );
        }
    }
});

it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses unknown %s routes',
    (method) => {
        expect(isAgentRequestAllowed(method, '/api/v1/future')).toBe(false);
        expect(isAgentRequestAllowed(method, '/api/v1/org/projects')).toBe(
            false,
        );
    },
);
it('never marks a write as a safe read', () => {
    for (const entry of REQUEST_POLICY)
        expect(entry.safeRead).toBe(entry.method === 'GET');
});
it('requires an exact route, with only query text ignored', () => {
    expect(isAgentRequestAllowed('GET', '/api/v1/user?test=1')).toBe(true);
    expect(isAgentRequestAllowed('POST', '/api/v1/user')).toBe(false);
    expect(isAgentRequestAllowed('GET', '/api/v1/user/extra')).toBe(false);
    expect(isAgentRequestAllowed('GET', '/api/v1/projects//explores')).toBe(
        false,
    );
});

it('pins exact normalized routes for all admitted inventory entries and lifecycle operations', async () => {
    const {
        CLI_GRANT_OPERATION_INVENTORY,
        CLI_CONNECTION_LIFECYCLE_OPERATIONS,
    } = await import(inventoryPath);
    const dynamicRoutes: Record<string, string> = {
        'ProjectController.getMergedManifest':
            '/api/v1/projects/:param/dbt/manifest',
        'UserController.getAuthenticatedUser': '/api/v1/user',
        'ExploreController.SetExplores': '/api/v1/projects/:param/explores',
        'DeployController.deployExplores': '/api/v2/projects/:param/deploy',
        'DeployController.getDeployCapabilities':
            '/api/v2/projects/:param/deploy/capabilities',
        'ProjectCoderController.getChartsAsCode':
            '/api/v1/projects/:param/code/charts',
        'ProjectCoderController.getDashboardsAsCode':
            '/api/v1/projects/:param/code/dashboards',
        'ProjectCoderController.getSqlChartsAsCode':
            '/api/v1/projects/:param/code/sqlCharts',
        'ProjectCoderController.getAlertsAsCode':
            '/api/v1/projects/:param/code/alerts',
        'ProjectCoderController.getGoogleSheetsSyncsAsCode':
            '/api/v1/projects/:param/code/googleSheets',
        'ProjectCoderController.getScheduledDeliveriesAsCode':
            '/api/v1/projects/:param/code/scheduledDeliveries',
        'ProjectCoderController.upsertChartAsCode':
            '/api/v1/projects/:param/code/charts/:param',
        'ProjectCoderController.upsertDashboardAsCode':
            '/api/v1/projects/:param/code/dashboards/:param',
        'ProjectCoderController.upsertSqlChartAsCode':
            '/api/v1/projects/:param/code/sqlCharts/:param',
        'AppGenerateController.listProjectApps':
            '/api/v1/ee/projects/:param/apps',
        'AppGenerateController.listProjectChartTypes':
            '/api/v1/ee/projects/:param/apps/chart-types',
    };
    type Entry = {
        method: string;
        endpoint: string;
        operations: string[];
        disposition: string;
    };
    const expected = (CLI_GRANT_OPERATION_INVENTORY as Entry[])
        .filter((entry) => entry.disposition === 'allowed')
        .flatMap((entry) =>
            entry.operations.map((operation) => {
                let route: string;
                if (
                    entry.operations.length > 1 ||
                    !/^[`']/.test(entry.endpoint)
                ) {
                    expect(dynamicRoutes[operation]).toBeDefined();
                    route = dynamicRoutes[operation];
                } else {
                    route = entry.endpoint
                        .slice(1, -1)
                        .replace(/\$\{slot\.instanceUrl\}/, '')
                        .replace(/\$\{pageSizeParam\}/, '')
                        .replace(/\$\{\s*query \?[\s\S]*$/, '')
                        .split('?')[0]
                        .replace(/\$\{[^}]+\}/g, ':param');
                }
                return [entry.method, route, operation].join(' ');
            }),
        );
    const lifecycle = [
        [
            'GET',
            '/api/v2/user/agent-connections/:param/status',
            'AgentConnectionController.getConnectionStatus',
        ],
        [
            'DELETE',
            '/api/v2/user/agent-connections/:param',
            'AgentConnectionController.revoke',
        ],
    ];
    expect(new Set(lifecycle.map((entry) => entry[2]))).toEqual(
        new Set(CLI_CONNECTION_LIFECYCLE_OPERATIONS),
    );
    expected.push(...lifecycle.map((entry) => entry.join(' ')));
    expect(
        [
            ...new Set(
                REQUEST_POLICY.map((entry) =>
                    [
                        entry.method,
                        entry.path.replace(/:[a-zA-Z]+/g, ':param'),
                        entry.operation,
                    ].join(' '),
                ),
            ),
        ].sort(),
    ).toEqual([...new Set(expected)].sort());
});
it('rejects a near miss below every wildcard segment', () => {
    for (const entry of REQUEST_POLICY) {
        const segments = entry.path.split('/');
        for (let index = 0; index < segments.length; index += 1) {
            if (segments[index].startsWith(':')) {
                const prefix = segments
                    .slice(0, index + 1)
                    .map((segment) =>
                        segment.startsWith(':') ? 'fixture' : segment,
                    )
                    .join('/');
                expect(
                    isAgentRequestAllowed(entry.method, `${prefix}/future`),
                ).toBe(false);
            }
        }
    }
    expect(
        isAgentRequestAllowed('GET', '/api/v1/projects/fixture/code/documents'),
    ).toBe(true);
    expect(
        isAgentRequestAllowed('GET', '/api/v1/projects/fixture/code/future'),
    ).toBe(false);
});
