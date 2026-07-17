import { readFileSync } from 'fs';
import nodePath from 'path';
import { describe, expect, it } from 'vitest';
import swagger from '../generated/swagger.json';

const LEGACY_CONTENT_AS_CODE_ENDPOINTS = [
    ['get', '/api/v1/projects/{projectUuid}/charts/code', 'getChartsAsCode'],
    [
        'post',
        '/api/v1/projects/{projectUuid}/charts/{slug}/code',
        'upsertChartAsCode',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/dashboards/code',
        'getDashboardsAsCode',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/dashboards/{slug}/code',
        'upsertDashboardAsCode',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/sqlCharts/code',
        'getSqlChartsAsCode',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/sqlCharts/{slug}/code',
        'upsertSqlChartAsCode',
    ],
    ['get', '/api/v1/projects/{projectUuid}/spaces/code', 'getSpacesAsCode'],
    ['post', '/api/v1/projects/{projectUuid}/spaces/code', 'upsertSpaceAsCode'],
    [
        'get',
        '/api/v1/projects/{projectUuid}/virtualViews/code',
        'getVirtualViewsAsCode',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/virtualViews/{slug}/code',
        'upsertVirtualViewAsCode',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/scheduledDeliveries/code',
        'getScheduledDeliveriesAsCode',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/scheduledDeliveries/{slug}/code',
        'upsertScheduledDeliveryAsCode',
    ],
    ['get', '/api/v1/projects/{projectUuid}/alerts/code', 'getAlertsAsCode'],
    [
        'post',
        '/api/v1/projects/{projectUuid}/alerts/{slug}/code',
        'upsertAlertAsCode',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/googleSheets/code',
        'getGoogleSheetsSyncsAsCode',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/googleSheets/{slug}/code',
        'upsertGoogleSheetsSyncAsCode',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/aiAgents/code',
        'getAiAgentsAsCode',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/aiAgents/code',
        'upsertAiAgentsAsCode',
    ],
    ['get', '/api/v2/orgs/{orgUuid}/roles/code', 'GetCustomRolesAsCode'],
    ['post', '/api/v2/orgs/{orgUuid}/roles/code', 'UpsertCustomRoleAsCode'],
    ['get', '/api/v2/orgs/{orgUuid}/users/code', 'GetOrganizationUsersAsCode'],
    [
        'post',
        '/api/v2/orgs/{orgUuid}/users/code',
        'UpsertOrganizationUserAsCode',
    ],
    [
        'get',
        '/api/v2/orgs/{orgUuid}/groups/code',
        'GetOrganizationGroupsAsCode',
    ],
    [
        'post',
        '/api/v2/orgs/{orgUuid}/groups/code',
        'UpsertOrganizationGroupAsCode',
    ],
] as const;

const CANONICAL_CONTENT_AS_CODE_ENDPOINTS = [
    ['get', '/api/v1/projects/{projectUuid}/code/charts', 'getCodeCharts'],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/charts/{slug}',
        'upsertCodeChart',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/code/dashboards',
        'getCodeDashboards',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/dashboards/{slug}',
        'upsertCodeDashboard',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/code/sqlCharts',
        'getCodeSqlCharts',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/sqlCharts/{slug}',
        'upsertCodeSqlChart',
    ],
    ['get', '/api/v1/projects/{projectUuid}/code/spaces', 'getCodeSpaces'],
    ['post', '/api/v1/projects/{projectUuid}/code/spaces', 'upsertCodeSpace'],
    [
        'get',
        '/api/v1/projects/{projectUuid}/code/virtualViews',
        'getCodeVirtualViews',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/virtualViews/{slug}',
        'upsertCodeVirtualView',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/code/scheduledDeliveries',
        'getCodeScheduledDeliveries',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/scheduledDeliveries/{slug}',
        'upsertCodeScheduledDelivery',
    ],
    ['get', '/api/v1/projects/{projectUuid}/code/alerts', 'getCodeAlerts'],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/alerts/{slug}',
        'upsertCodeAlert',
    ],
    [
        'get',
        '/api/v1/projects/{projectUuid}/code/googleSheets',
        'getCodeGoogleSheetsSyncs',
    ],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/googleSheets/{slug}',
        'upsertCodeGoogleSheetsSync',
    ],
    ['get', '/api/v1/projects/{projectUuid}/code/aiAgents', 'getCodeAiAgents'],
    [
        'post',
        '/api/v1/projects/{projectUuid}/code/aiAgents',
        'upsertCodeAiAgents',
    ],
    ['get', '/api/v2/orgs/{orgUuid}/code/roles', 'GetCodeCustomRoles'],
    ['post', '/api/v2/orgs/{orgUuid}/code/roles', 'UpsertCodeCustomRole'],
    ['get', '/api/v2/orgs/{orgUuid}/code/users', 'GetCodeOrganizationUsers'],
    ['post', '/api/v2/orgs/{orgUuid}/code/users', 'UpsertCodeOrganizationUser'],
    ['get', '/api/v2/orgs/{orgUuid}/code/groups', 'GetCodeOrganizationGroups'],
    [
        'post',
        '/api/v2/orgs/{orgUuid}/code/groups',
        'UpsertCodeOrganizationGroup',
    ],
] as const;

describe('content-as-code OpenAPI compatibility', () => {
    it.each(LEGACY_CONTENT_AS_CODE_ENDPOINTS)(
        'keeps %s %s with operation ID %s',
        (method, path, operationId) => {
            const pathDefinition = swagger.paths[
                path as keyof typeof swagger.paths
            ] as Record<string, { operationId?: string }> | undefined;

            expect(pathDefinition?.[method]?.operationId).toBe(operationId);
        },
    );

    it.each(CANONICAL_CONTENT_AS_CODE_ENDPOINTS)(
        'registers canonical %s %s with operation ID %s',
        (method, path, operationId) => {
            const pathDefinition = swagger.paths[
                path as keyof typeof swagger.paths
            ] as Record<string, { operationId?: string }> | undefined;

            expect(pathDefinition?.[method]?.operationId).toBe(operationId);
        },
    );

    it.each(LEGACY_CONTENT_AS_CODE_ENDPOINTS)(
        'marks legacy %s %s as deprecated',
        (method, path) => {
            const pathDefinition = swagger.paths[
                path as keyof typeof swagger.paths
            ] as Record<string, { deprecated?: boolean }> | undefined;

            expect(pathDefinition?.[method]?.deprecated).toBe(true);
        },
    );

    it('registers the literal spaces code route before the space UUID route', () => {
        const routes = readFileSync(
            nodePath.join(__dirname, '../generated/routes.ts'),
            'utf8',
        );
        const codeRoute = routes.indexOf(
            "'/api/v1/projects/:projectUuid/spaces/code'",
        );
        const spaceUuidRoute = routes.indexOf(
            "'/api/v1/projects/:projectUuid/spaces/:spaceUuid'",
        );

        expect(codeRoute).toBeGreaterThan(-1);
        expect(spaceUuidRoute).toBeGreaterThan(-1);
        expect(codeRoute).toBeLessThan(spaceUuidRoute);
    });

    it('prioritizes the project coder controller during route generation', () => {
        const config = readFileSync(
            nodePath.join(__dirname, '../../tsoa.yml'),
            'utf8',
        );
        const coderController = config.indexOf(
            '- src/controllers/ProjectCoderController.ts',
        );
        const otherControllers = config.indexOf('- src/**/*Controller.ts');

        expect(coderController).toBeGreaterThan(-1);
        expect(coderController).toBeLessThan(otherControllers);
    });
});
