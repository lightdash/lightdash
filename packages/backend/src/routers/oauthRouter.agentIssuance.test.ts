import { FeatureFlags } from '@lightdash/common';
import express, { type Request, type Response } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    collectOAuthRoutesFromSources,
    parseSource,
    sourceFiles,
} from '../auth/oauthScopes/testing/routeInventory';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { RegisterRoutes } from '../generated/routes';
import { AgentConnectionGrantModel } from '../models/AgentConnectionGrantModel';
import { OAuth2Model } from '../models/OAuth2Model';
import { type UserModel } from '../models/UserModel';
import { OAuthService } from '../services/OAuthService/OAuthService';
import oauthRouter from './oauthRouter';

it('registered authorize and token handlers cannot issue an agent connection with agent identity on', async () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const flags = {
        get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
            enabled: featureFlagId === FeatureFlags.AgentIdentity,
        })),
    };
    const config = {
        ...lightdashConfigMock,
        auth: {
            ...lightdashConfigMock.auth,
            oauthServer: {
                accessTokenLifetime: 3600,
                refreshTokenLifetime: 86400,
                mobileRefreshTokenLifetime: 86400,
                refreshTokenRotationGrace: 0,
            },
        },
    };
    const model = new OAuth2Model(database, config, flags);
    const service = new OAuthService({
        oauthModel: model,
        userModel: {} as UserModel,
        lightdashConfig: config,
    });
    const create = vi.spyOn(AgentConnectionGrantModel.prototype, 'create');
    const replace = vi.spyOn(AgentConnectionGrantModel.prototype, 'replace');
    const client = {
        client_id: 'lightdash-cli',
        grants: ['authorization_code', 'refresh_token'],
        scopes: ['read'],
        redirect_uris: ['http://localhost/callback'],
    };
    const verifier = 'a'.repeat(64);
    const projectUuid = '11111111-1111-4111-8111-111111111111';
    const attemptedBinding = {
        agentConnectionGrantUuid: 'attacker-grant',
        agent_connection_grant_uuid: 'attacker-grant',
        agentConnection: { grantUuid: 'attacker-grant' },
        connection: { name: 'attempt' },
        resourceConstraints: {
            version: 2,
            projectCapabilities: { [projectUuid]: ['query'] },
        },
        approvedProjectUuids: [projectUuid],
        approvedCapabilities: ['query'],
    };
    const inserted: Record<string, unknown>[] = [];
    tracker.on.select(/from "oauth2_clients"/).response(client);
    tracker.on.select('users').response({ user_uuid: 'user' });
    tracker.on.insert(/oauth2_/).response((query) => {
        const columns = query.sql
            .match(/\(([^)]+)\) values/)![1]
            .split(',')
            .map((column) => column.trim().replaceAll('"', ''));
        inserted.push(
            Object.fromEntries(
                columns.map((column, index) => [column, query.bindings[index]]),
            ),
        );
        return [];
    });
    tracker.on.delete(/oauth2_/).response(1);
    tracker.on
        .select('oauth2_authorization_codes')
        .response(() => ({ ...client, ...inserted[0], user_uuid: 'user' }));
    const invoke = async (routePath: string, body: Record<string, unknown>) => {
        const { route } = oauthRouter.stack.find(
            (layer) =>
                layer.route?.path === routePath && layer.route.methods.post,
        )!;
        const req = {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'transfer-encoding': 'chunked',
            },
            query: attemptedBinding,
            body,
            user: { userId: 42, userUuid: 'user', organizationUuid: 'org' },
            services: { getOauthService: () => service },
        } as unknown as Request;
        const res = {
            status: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            send: vi.fn(),
            json: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();
        await route.stack[0].handle(req, res, next);
        expect(next).not.toHaveBeenCalled();
        return res;
    };
    try {
        const authorization = await invoke('/authorize', {
            ...attemptedBinding,
            approve: 'true',
            response_type: 'code',
            client_id: client.client_id,
            redirect_uri: client.redirect_uris[0],
            scope: 'read',
            state: 'state',
            code_challenge: createHash('sha256')
                .update(verifier)
                .digest('base64url'),
            code_challenge_method: 'S256',
        });
        expect(authorization.send).toHaveBeenCalledWith(
            expect.stringContaining('code&#x3D;'),
        );
        expect(inserted).toHaveLength(1);
        const token = await invoke('/token', {
            ...attemptedBinding,
            grant_type: 'authorization_code',
            client_id: client.client_id,
            client_secret: 'secret',
            redirect_uri: client.redirect_uris[0],
            code: inserted[0].authorization_code,
            code_verifier: verifier,
        });
        expect(token.json).toHaveBeenCalledWith(
            expect.objectContaining({
                access_token: expect.any(String),
                refresh_token: expect.any(String),
            }),
        );
        expect(inserted).toHaveLength(3);
        for (const record of inserted)
            expect(record.agent_connection_grant_uuid).toBeNull();
        expect(create).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        const app = express();
        RegisterRoutes(app);
        const routes = app._router.stack
            .filter((layer: { route?: unknown }) => layer.route)
            .map((layer: { route: { path: string } }) => layer.route.path);
        expect(routes.length).toBeGreaterThan(100);
        const expected = [
            'AgentConnectionController.getConnectionStatus',
            'AgentConnectionController.list',
            'AgentConnectionController.revoke',
        ];
        const root = path.resolve(__dirname, '..');
        const inventory = collectOAuthRoutesFromSources(
            ['controllers', 'ee/controllers', 'routers', 'ee/routers'].flatMap(
                (directory) =>
                    sourceFiles(path.join(root, directory)).map((file) =>
                        parseSource(file),
                    ),
            ),
        );
        expect(
            inventory
                .filter(({ id }) => /agent.?connection|agent.?grant/i.test(id))
                .map(({ id }) => id)
                .sort(),
        ).toEqual(expected);
        const expectedMethods: Record<string, string> = {
            'AgentConnectionController.list': '@Get()',
            'AgentConnectionController.getConnectionStatus':
                "@Get('{grantUuid}/status')",
            'AgentConnectionController.revoke': "@Delete('{grantUuid}')",
        };
        for (const route of inventory.filter(({ id }) =>
            expected.includes(id),
        )) {
            expect(
                route.handler.parent
                    .getText()
                    .match(/@(Get|Post|Put|Patch|Delete)\([^)]*\)/g),
            ).toEqual([expectedMethods[route.id]]);
            expect(route.handler.parent.parent.getText()).toContain(
                "@Route('/api/v2/user/agent-connections')",
            );
        }
        const connectionRoutes = app._router.stack.filter(
            (layer: { route?: { path: string } }) =>
                layer.route &&
                /agent.?connection|agent.?grant/i.test(layer.route.path),
        );
        for (const layer of connectionRoutes) {
            expect(
                Object.keys(layer.route.methods).every((method) =>
                    ['get', 'delete'].includes(method),
                ),
            ).toBe(true);
            expect(layer.route.path).toMatch(
                /^\/api\/v2\/user\/agent-connections(?:\/:grantUuid(?:\/status)?)?$/,
            );
        }
    } finally {
        vi.restoreAllMocks();
        tracker.reset();
        await database.destroy();
    }
});

it('has no production caller of grant creation or replacement', () => {
    const root = path.resolve(__dirname, '..');
    const files = (directory: string): string[] =>
        readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) return files(file);
            return file.endsWith('.ts') &&
                !/\.(test|mock|integration)\.ts$/.test(file)
                ? [file]
                : [];
        });
    const callers = files(root)
        .filter(
            (file) => !file.endsWith('/models/AgentConnectionGrantModel.ts'),
        )
        .filter((file) =>
            /AgentConnectionGrantModel|getAgentConnectionGrantModel/.test(
                readFileSync(file, 'utf8'),
            ),
        );
    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers)
        expect(readFileSync(file, 'utf8')).not.toMatch(
            /\.\s*(create|replace)\s*\(/,
        );
});
