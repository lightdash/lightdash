import { AgentCapability } from '@lightdash/common';
import path from 'node:path';
import ts from 'typescript-compiler-api';
import { fromOauth } from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import { REST_OPERATION_CAPABILITIES } from '../agentPermissions/capabilityMap';
import {
    collectOAuthRoutesFromSources,
    descendants,
    parseSource,
    sourceFiles,
} from '../oauthScopes/testing/routeInventory';
import { AgentConnectionGrantService } from './AgentConnectionGrantService';
import { CLI_GRANT_OPERATION_INVENTORY } from './cliOperationInventory';
import { grantFixture } from './grant.mock';
import {
    GRANT_MCP_TOOL_CONTRACTS,
    GRANT_OPERATION_CONTRACTS,
} from './operationContracts';

it('contains only live REST operations with a capability mapping', () => {
    const root = path.resolve(__dirname, '../..');
    const sources = [
        'controllers',
        'ee/controllers',
        'routers',
        'ee/routers',
    ].flatMap((directory) =>
        sourceFiles(path.join(root, directory)).map((file) =>
            parseSource(file),
        ),
    );
    const ids = new Set(
        collectOAuthRoutesFromSources([
            ...sources,
            ...['App.ts', 'index.ts', 'ee/index.ts'].map((file) =>
                parseSource(path.join(root, file)),
            ),
        ]).flatMap(({ id, guards }) => [id, ...guards]),
    );
    for (const key of Object.keys(GRANT_OPERATION_CONTRACTS)) {
        expect({ key, live: ids.has(key) }).toMatchObject({ live: true });
        expect({
            key,
            mapped: key in REST_OPERATION_CAPABILITIES,
        }).toMatchObject({ mapped: true });
    }
});
it('accounts for every CLI API and fetch call', () => {
    const root = path.resolve(__dirname, '../../../../cli/src');
    const calls = sourceFiles(root).flatMap((file) => {
        const source = parseSource(file);
        return descendants(source)
            .filter(
                (node) =>
                    ts.isCallExpression(node) &&
                    ((ts.isIdentifier(node.expression) &&
                        ['lightdashApi', 'lightdashRawApi', 'fetch'].includes(
                            node.expression.text,
                        )) ||
                        (ts.isPropertyAccessExpression(node.expression) &&
                            node.expression.name.text === 'fetch')),
            )
            .map((node) => {
                if (!ts.isCallExpression(node))
                    throw new Error('Expected a call');
                const argument = node.arguments[0];
                let method = 'GET';
                let endpoint = argument.getText(source);
                const options = ts.isObjectLiteralExpression(argument)
                    ? argument
                    : node.arguments[1];
                if (options && ts.isObjectLiteralExpression(options)) {
                    for (const property of options.properties.filter(
                        ts.isPropertyAssignment,
                    )) {
                        if (property.name.getText(source) === 'method')
                            method = property.initializer
                                .getText(source)
                                .replace(/['"]/g, '');
                        if (
                            options === argument &&
                            property.name.getText(source) === 'url'
                        )
                            endpoint = property.initializer.getText(source);
                    }
                }
                return {
                    callSite: `${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
                    method,
                    endpoint,
                };
            });
    });
    expect(
        CLI_GRANT_OPERATION_INVENTORY.map(({ callSite, method, endpoint }) => ({
            callSite,
            method,
            endpoint,
        })).sort((a, b) => a.callSite.localeCompare(b.callSite)),
    ).toEqual(calls.sort((a, b) => a.callSite.localeCompare(b.callSite)));
    for (const entry of CLI_GRANT_OPERATION_INVENTORY) {
        if (entry.disposition === 'allowed') {
            for (const operation of entry.operations)
                expect({
                    callSite: entry.callSite,
                    operation,
                    registered: operation in GRANT_OPERATION_CONTRACTS,
                }).toMatchObject({ registered: true });
        } else {
            expect(entry.reason.length).toBeGreaterThan(20);
        }
    }
});
it('starts with no consented MCP tools', () => {
    expect(Object.keys(GRANT_MCP_TOOL_CONTRACTS)).toEqual([]);
});

it('maps every API inventory operation to a reviewed capability key or a bootstrap endpoint', () => {
    const bootstrap = new Set([
        'authRouter POST /login',
        'oauthRouter POST /token',
        'WarehouseConnectController.deposit',
    ]);
    for (const entry of CLI_GRANT_OPERATION_INVENTORY) {
        for (const operation of entry.operations)
            expect({
                callSite: entry.callSite,
                operation,
                mapped:
                    operation in REST_OPERATION_CAPABILITIES ||
                    bootstrap.has(operation),
            }).toMatchObject({ mapped: true });
        if (entry.disposition === 'refused')
            expect(entry.operations.length).toBeGreaterThan(0);
    }
});

it.each(
    [
        'ProjectCoderController.upsertChartAsCode',
        'ProjectCoderController.upsertDashboardAsCode',
    ].flatMap((operation) =>
        [true, false].flatMap((verified) =>
            [true, false].map((publish) => ({ operation, verified, publish })),
        ),
    ),
)(
    'requires Publish for $operation with verified=$verified and publish=$publish',
    async ({ operation, verified, publish }) => {
        const grant = grantFixture();
        grant.approvedCapabilities = [
            AgentCapability.ContentWrite,
            AgentCapability.DeployUpload,
            ...(publish ? [AgentCapability.Publish] : []),
        ];
        const user = {
            ...defaultSessionUser,
            userUuid: grant.subjectUserUuid,
            organizationUuid: grant.organizationUuid,
        };
        const service = new AgentConnectionGrantService({
            model: {
                findActive: async () => grant,
                touchLastUsed: async () => {},
            },
            featureFlags: { get: vi.fn().mockResolvedValue({ enabled: true }) },
            resourceResolver: {
                resolveProjectUuid: async (_org, id) => id,
                resolveResourceProjectUuid: async () => null,
                resolveDeploySession: async () => ({
                    projectUuid: grant.approvedProjectUuids[0],
                    userUuid: user.userUuid,
                }),
            },
        });
        const token = {
            accessToken: 'token',
            agentConnectionGrantUuid: grant.grantUuid,
            familyUuid: grant.refreshFamilyUuid,
            resource: grant.resource,
            client: {
                id: grant.clientId,
                grants: ['authorization_code', 'refresh_token'],
            },
            user,
        };
        const account = fromOauth(
            user,
            token,
            null,
            await service.authenticate(token, user),
        );
        const request = {
            account,
            method: 'POST',
            params: { projectUuid: grant.approvedProjectUuids[0] },
            query: {},
            body: { spaceSlug: 'space', verified },
        };
        if (publish)
            await expect(
                service.assertRestOperation(request, operation),
            ).resolves.toEqual(grant.approvedProjectUuids);
        else
            await expect(
                service.assertRestOperation(request, operation),
            ).rejects.toThrow('Publish');
        request.body = { spaceSlug: 'space' } as typeof request.body;
        await expect(
            service.assertRestOperation(request, operation),
        ).resolves.toEqual(grant.approvedProjectUuids);
        request.account = fromOauth(user, token);
        request.body = { spaceSlug: 'space', verified };
        await expect(
            service.assertRestOperation(request, operation),
        ).resolves.toEqual([]);
    },
);
