import express from 'express';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type AddressInfo } from 'node:net';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    AGENT_CONNECTION_REQUEST_PATH,
    parseAgentConnectionApprovalBody,
} from '../../../controllers/authentication/agentConnectionApproval';
import { RegisterRoutes } from '../../../generated/routes';
import { ModelRepository } from '../../../models/ModelRepository';
import { AGENT_CONNECTION_APPROVAL_ROUTE } from '../../../routers/agentConnectionApprovalAuthorize';
import oauthRouter from '../../../routers/oauthRouter';
import { ServiceRepository } from '../../../services/ServiceRepository';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

it('prepares through the registered HTTP route and writes exactly one pending row without issuing', async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Approval HTTP test' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'Approval', last_name: 'Subject' } as never)
        .returning('*');
    const person = {
        ...defaultSessionUser,
        userUuid: user.user_uuid,
        userId: user.user_id,
        organizationUuid: org.organization_uuid,
    };
    const config = { ...lightdashConfigMock, siteUrl: lightdashConfig.siteUrl };
    const models = new ModelRepository({
        database,
        lightdashConfig: config,
        utils: { getEncryptionUtil: () => ({}) } as never,
    });
    const otherPerson = { ...person, userUuid: randomUUID() };
    vi.spyOn(
        models.getUserModel(),
        'findSessionUserAndOrgByUuid',
    ).mockImplementation(async (uuid) =>
        uuid === person.userUuid ? person : otherPerson,
    );
    vi.spyOn(models.getFeatureFlagModel(), 'get').mockResolvedValue({
        enabled: true,
    } as never);
    const services = new ServiceRepository({
        context: { lightdashConfig: config } as never,
        models,
        clients: {} as never,
        utils: {} as never,
    });
    const app = express();
    app.post(AGENT_CONNECTION_REQUEST_PATH, parseAgentConnectionApprovalBody);
    app.use(express.json());
    app.use((req, _res, next) => {
        req.services = services;
        req.user = req.get('x-test-other') ? otherPerson : person;
        req.account = fromSession(req.user, 'real-schema-session');
        req.sessionID = 'real-schema-session';
        req.session = { passport: { user: person.userUuid } } as never;
        req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
        next();
    });
    app.use('/api/v1/oauth', oauthRouter);
    RegisterRoutes(app);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const tables = [
        'agent_connection_grants',
        'oauth2_authorization_codes',
        'oauth2_access_tokens',
        'oauth2_refresh_tokens',
    ] as const;
    const counts = async () =>
        Promise.all(
            tables.map(
                async (table) =>
                    (await database(table).count('* as count').first())!.count,
            ),
        );
    const before = await counts();
    try {
        const response = await fetch(
            `${base}${AGENT_CONNECTION_REQUEST_PATH}`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    origin: new URL(config.siteUrl).origin,
                },
                body: JSON.stringify({
                    clientId: 'lightdash-cli',
                    name: 'review',
                    projects: null,
                    capabilities: [],
                    expiresInSeconds: 1,
                    redirectUri: 'http://localhost:32123/callback',
                    state: 's'.repeat(43),
                    codeChallenge: 'c'.repeat(43),
                    codeChallengeMethod: 'S256',
                    resource: config.siteUrl.replace(/\/+$/, ''),
                }),
            },
        );
        expect(response.status).toBe(200);
        const payload = await response.json();
        const rows = await database('agent_connection_approval_requests').where(
            { subject_user_uuid: user.user_uuid },
        );
        expect(rows).toHaveLength(1);
        expect(
            new URL(payload.results.authorizationUrl).searchParams.get(
                'agent_request',
            ),
        ).toBe(rows[0].agent_connection_approval_request_uuid);
        expect(rows[0]).toMatchObject({
            organization_uuid: org.organization_uuid,
            decision_consumed_at: null,
            approved_at: null,
            approved_selection: null,
            review_session_hash: null,
        });
        const authorization = await fetch(
            `${base}/api/v1/oauth/authorize?agent_request=${rows[0].agent_connection_approval_request_uuid}`,
            { redirect: 'manual' },
        );
        expect(authorization.status).toBe(302);
        const location = new URL(authorization.headers.get('location')!);
        expect(location.pathname).toBe(AGENT_CONNECTION_APPROVAL_ROUTE);
        expect(location.searchParams.get('request')).toBe(
            rows[0].agent_connection_approval_request_uuid,
        );
        expect(
            await database('agent_connection_approval_requests').where({
                subject_user_uuid: user.user_uuid,
            }),
        ).toEqual(rows);
        const opaqueUrl = `${base}/api/v1/oauth/authorize?agent_request=${rows[0].agent_connection_approval_request_uuid}`;
        const wrongPerson = await fetch(opaqueUrl, {
            headers: { 'x-test-other': 'true' },
            redirect: 'manual',
        });
        expect(wrongPerson.status).toBe(403);
        expect(await wrongPerson.json()).toMatchObject({
            error: { code: 'approval_forbidden' },
        });
        expect(
            await database('agent_connection_approval_requests').where({
                subject_user_uuid: user.user_uuid,
            }),
        ).toEqual(rows);
        const unknown = await fetch(
            `${base}/api/v1/oauth/authorize?agent_request=${randomUUID()}`,
            { redirect: 'manual' },
        );
        expect(unknown.status).toBe(404);
        await database('agent_connection_approval_requests')
            .where({ subject_user_uuid: user.user_uuid })
            .update({
                created_at: database.raw(
                    "clock_timestamp() - interval '16 minutes'",
                ),
                request_expires_at: database.raw(
                    "clock_timestamp() - interval '1 minute'",
                ),
            });
        const expired = await fetch(opaqueUrl, { redirect: 'manual' });
        expect(expired.status).toBe(410);
        expect(await expired.json()).toMatchObject({
            error: { code: 'approval_request_expired' },
        });
        expect(await counts()).toEqual(before);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        vi.restoreAllMocks();
    }
});
