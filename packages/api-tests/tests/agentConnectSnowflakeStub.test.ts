import {
    AgentIdentityConnectEntryPoint,
    AiAccessRefusalReason,
    FeatureFlags,
    getAiAccessRefusalMessage,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiAccessForUser,
    type OrganizationAgentIdentitySettings,
    type OrganizationAgentIdentitySnowflakeSetup,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, SITE_URL, type Body } from '../helpers/api-client';
import { login, loginWithPermissions } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import { createProject } from '../helpers/projects';

const siteUrl = new URL(SITE_URL);
const stubUrl = process.env.SNOWFLAKE_AI_STUB_URL;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`;
const settingsUrl = '/api/v2/org/agent-identity';
const sql = "SELECT 'hello' AS greeting";

describe.skipIf(!stubUrl)(
    'Snowflake agent connection through OAuth and MCP',
    () => {
        let admin: ApiClient;
        let person: ApiClient | undefined;
        const people: ApiClient[] = [];
        let projectUuid: string | undefined;
        let previousSettings: OrganizationAgentIdentitySettings | undefined;
        let previousClientExisted: boolean | undefined;
        let clearFlag = false;

        const completeSignIn = async (
            client: ApiClient,
            redirect: string,
            code = 'api-test-code',
        ) => {
            const start = await client.get(
                `/api/v1/login/snowflake-ai?redirect=${encodeURIComponent(redirect)}`,
                { failOnStatusCode: false },
            );
            expect(start.status).toBe(302);
            const authorizeUrl = new URL(start.headers.get('location')!);
            expect(authorizeUrl.origin).toBe(new URL(stubUrl!).origin);
            const state = authorizeUrl.searchParams.get('state');
            expect(state).toBeTruthy();
            const callbackUrl = new URL(
                authorizeUrl.searchParams.get('redirect_uri')!,
            );
            expect(callbackUrl.origin).toBe(siteUrl.origin);
            expect(callbackUrl.pathname).toBe(
                '/api/v1/oauth/redirect/snowflake-ai',
            );
            callbackUrl.searchParams.set('code', code);
            callbackUrl.searchParams.set('state', state!);
            return client.get(callbackUrl.href, { failOnStatusCode: false });
        };

        beforeAll(async () => {
            const health = await new ApiClient().get<
                Body<{ auth: { snowflakeAi: { enabled: boolean } } }>
            >('/api/v1/health');
            expect(
                health.body.results.auth.snowflakeAi.enabled,
                'Snowflake agent sign-in requires an enterprise license on the server to run this loop.',
            ).toBe(true);
            admin = await login();
            const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
            if (!flag.body.results.enabled) {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
                clearFlag = true;
            }
            const setup = await admin.get<
                Body<OrganizationAgentIdentitySnowflakeSetup>
            >(`${settingsUrl}/snowflake/setup`);
            previousClientExisted =
                setup.body.results.client.source === 'organization';
            expect(
                (
                    await admin.put(`${settingsUrl}/snowflake/client`, {
                        accountUrl: stubUrl,
                        clientId: 'stub-client',
                        clientSecret: 'stub-secret',
                    })
                ).status,
                `Could not ${previousClientExisted ? 'replace' : 'create'} the org client. Set SNOWFLAKE_AI_TEST_ACCOUNT_URL_ORIGIN to the stub origin on the server.`,
            ).toBe(200);
            const start = await admin.get('/api/v1/login/snowflake-ai', {
                failOnStatusCode: false,
            });
            expect(start.status).toBe(302);
            const authorizeUrl = new URL(start.headers.get('location')!);
            expect(
                authorizeUrl.origin,
                `The saved Snowflake org client does not point at SNOWFLAKE_AI_STUB_URL (${stubUrl}). Save the stub client and set SNOWFLAKE_AI_TEST_ACCOUNT_URL_ORIGIN to the same origin on the server.`,
            ).toBe(new URL(stubUrl!).origin);
            expect(authorizeUrl.pathname).toBe('/oauth/authorize');
            expect(authorizeUrl.searchParams.get('client_id')).toBe(
                'stub-client',
            );
            const settings =
                await admin.get<Body<OrganizationAgentIdentitySettings>>(
                    settingsUrl,
                );
            previousSettings = settings.body.results;
            expect(
                (
                    await admin.put(settingsUrl, {
                        requireVerifiedAgentSessions: true,
                    })
                ).status,
            ).toBe(200);
            projectUuid = await createProject(
                admin,
                `agent-connect-stub-${Date.now()}`,
                {
                    type: WarehouseTypes.SNOWFLAKE,
                    account: new URL(stubUrl!).hostname,
                    accessUrl: stubUrl,
                    user: 'stub',
                    password: 'stub',
                    role: 'AGENT_ROLE',
                    warehouse: 'STUB',
                    database: 'STUB',
                    schema: 'PUBLIC',
                },
            );
            person = (
                await loginWithPermissions('member', [
                    { role: 'admin', projectUuid },
                ])
            ).client;
            people.push(person);
        });

        afterAll(async () => {
            const cleanup: (() => Promise<void>)[] = [];
            for (const client of people) {
                cleanup.push(async () => {
                    const credentials = await client.get<
                        Body<UserWarehouseCredentials[]>
                    >('/api/v1/user/warehouseCredentials');
                    for (const credential of credentials.body.results.filter(
                        ({ purpose }) =>
                            purpose === UserWarehouseCredentialPurpose.AI,
                    )) {
                        expect(
                            (
                                await client.delete(
                                    `/api/v1/user/warehouseCredentials/${credential.uuid}`,
                                )
                            ).status,
                        ).toBe(200);
                    }
                });
                for (const {
                    client: tokenClient,
                    uuid,
                } of personalAccessTokens.filter(
                    ({ client: owner }) => owner === client,
                )) {
                    cleanup.push(async () => {
                        expect(
                            (
                                await tokenClient.delete(
                                    `/api/v1/user/me/personal-access-tokens/${uuid}`,
                                )
                            ).status,
                        ).toBe(200);
                    });
                }
            }
            if (projectUuid) {
                const uuid = projectUuid;
                cleanup.push(async () => {
                    expect(
                        (await admin.delete(`/api/v1/org/projects/${uuid}`))
                            .status,
                    ).toBe(200);
                });
            }
            if (previousSettings) {
                const settings = previousSettings;
                cleanup.push(async () => {
                    expect(
                        (await admin.put(settingsUrl, settings)).status,
                    ).toBe(200);
                });
            }
            if (clearFlag)
                cleanup.push(async () => {
                    expect((await admin.delete(flagUrl)).status).toBe(200);
                });
            const failures: unknown[] = [];
            for (const action of cleanup) {
                try {
                    await action();
                } catch (error) {
                    failures.push(error);
                }
            }
            if (failures.length)
                throw new AggregateError(
                    failures,
                    'Snowflake stub test cleanup failed',
                );
        });

        it('requires sign-in, saves an AI credential, and runs SQL as the connected person', async () => {
            const client = person!;
            const meUrl = `/api/v2/projects/${projectUuid}/ai-access/me`;
            const before = await client.get<Body<AiAccessForUser>>(meUrl);
            expect(before.status).toBe(200);
            expect(before.body.results.refusal?.reason).toBe(
                AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            const connectUrl = before.body.results.refusal?.connectUrl;
            expect(connectUrl).toBeTruthy();
            const parsedConnectUrl = new URL(connectUrl!);
            expect(parsedConnectUrl.origin).toBe(siteUrl.origin);
            expect(parsedConnectUrl.pathname).toBe('/agent/connect');
            expect([...parsedConnectUrl.searchParams.entries()]).toEqual([
                ['project', projectUuid],
                ['redirect', '/agent-connected'],
                ['entryPoint', AgentIdentityConnectEntryPoint.UNKNOWN],
            ]);
            const mcpConnectUrl = new URL(connectUrl!);
            mcpConnectUrl.searchParams.set(
                'entryPoint',
                AgentIdentityConnectEntryPoint.MCP_CONNECT_LINK,
            );
            const callTool = await openMcpSession(client, projectUuid!);
            const refused = await callTool('run_sql', {
                projectUuid,
                sql,
                limit: 1,
            });
            expect(refused.isError).toBe(true);
            expect(mcpText(refused)).toContain(
                getAiAccessRefusalMessage(AiAccessRefusalReason.NEEDS_SIGN_IN, {
                    projectName: null,
                }),
            );

            expect(mcpText(refused)).toContain(mcpConnectUrl.href);
            const connectionStatus = await callTool('connect_agent', {
                projectUuid,
            });
            expect(connectionStatus.isError).toBeFalsy();
            const expectedStatus = {
                status: 'needs_sign_in',
                message: before.body.results.refusal!.message,
                connectUrl: mcpConnectUrl.href,
                expiresAt: null,
            };
            expect(connectionStatus).toMatchObject({
                structuredContent: expectedStatus,
            });
            const resource = await callTool.readResource(
                `lightdash://projects/${projectUuid}/agent-status`,
            );
            expect(resource.contents).toEqual([
                {
                    uri: `lightdash://projects/${projectUuid}/agent-status`,
                    mimeType: 'application/json',
                    text: JSON.stringify(expectedStatus),
                },
            ]);

            const start = await client.get(
                '/api/v1/login/snowflake-ai?redirect=/agent-connected',
                { failOnStatusCode: false },
            );
            expect(start.status).toBe(302);
            const authorizeUrl = new URL(start.headers.get('location')!);
            expect(authorizeUrl.origin).toBe(new URL(stubUrl!).origin);
            expect(authorizeUrl.pathname).toBe('/oauth/authorize');
            const state = authorizeUrl.searchParams.get('state');
            expect(state).toBeTruthy();
            const callbackUrl = new URL(
                authorizeUrl.searchParams.get('redirect_uri')!,
            );
            expect(callbackUrl.origin).toBe(siteUrl.origin);
            expect(callbackUrl.pathname).toBe(
                '/api/v1/oauth/redirect/snowflake-ai',
            );
            callbackUrl.searchParams.set('code', 'api-test-code');
            callbackUrl.searchParams.set('state', state!);
            const callback = await client.get(callbackUrl.href, {
                failOnStatusCode: false,
            });
            expect(callback.status).toBe(302);
            expect(callback.headers.get('location')).toBe(
                new URL('/agent-connected', SITE_URL).href,
            );

            const after = await client.get<Body<AiAccessForUser>>(meUrl);
            expect(after.status).toBe(200);
            const { expiresAt } = after.body.results;
            expect(expiresAt).not.toBeNull();
            expect(new Date(expiresAt!).getTime()).toBeGreaterThan(
                Date.now() + 80 * 86400000,
            );
            expect(after.body.results).toMatchObject({
                refusal: null,
                identity: 'connected_person',
            });
            expect(
                await callTool('connect_agent', { projectUuid }),
            ).toMatchObject({
                structuredContent: { status: 'connected', connectUrl: null },
            });
            const credentials = await client.get<
                Body<UserWarehouseCredentials[]>
            >('/api/v1/user/warehouseCredentials');
            expect(credentials.body.results).toHaveLength(1);
            expect(credentials.body.results[0]).toMatchObject({
                purpose: UserWarehouseCredentialPurpose.AI,
                expiresAt,
                credentials: { type: WarehouseTypes.SNOWFLAKE },
            });
            const result = await callTool('run_sql', {
                projectUuid,
                sql,
                limit: 1,
            });
            if (result.isError) throw new Error(mcpText(result));
            expect(result.isError).toBeFalsy();
            expect(result).toMatchObject({
                structuredContent: {
                    result: { rows: [{ GREETING: 'hello' }] },
                },
            });
        });

        it('offers an agent connection on consent only to an unconnected person', async () => {
            const { client } = await loginWithPermissions('member', [
                { role: 'admin', projectUuid: projectUuid! },
            ]);
            people.push(client);
            const access = await client.get<Body<AiAccessForUser>>(
                `/api/v2/projects/${projectUuid}/ai-access/me`,
            );
            expect(access.body.results.refusal?.reason).toBe(
                AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            const authorizePath =
                '/api/v1/oauth/authorize?client_id=lightdash-cli&redirect_uri=http%3A%2F%2Flocalhost%3A4321%2Fcallback&response_type=code&state=s&scope=read&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256';
            const refusedPage = await client.get<string>(authorizePath);
            expect(refusedPage.status).toBe(200);
            expect(refusedPage.body).toContain('Connect your warehouse agent');
            expect(refusedPage.body).toContain(
                '/api/v1/login/snowflake-ai?redirect&#x3D;',
            );
            const connectedPage = await person!.get<string>(authorizePath);
            expect(connectedPage.status).toBe(200);
            expect(connectedPage.body).not.toContain('warehouse agent');
        });

        it('refreshes successfully after the stored grant deadline', async () => {
            const { client } = await loginWithPermissions('member', [
                { role: 'admin', projectUuid: projectUuid! },
            ]);
            people.push(client);
            const callback = await completeSignIn(
                client,
                '/agent-connected',
                'expiring-code',
            );
            expect(callback.status).toBe(302);
            await setTimeout(1500);
            const callTool = await openMcpSession(client, projectUuid!);
            const result = await callTool('run_sql', {
                projectUuid,
                sql,
                limit: 1,
            });
            expect(result.isError).toBeFalsy();
            const access = await client.get<Body<AiAccessForUser>>(
                `/api/v2/projects/${projectUuid}/ai-access/me`,
            );
            expect(access.body.results.refusal).toBeNull();
            expect(
                new Date(access.body.results.expiresAt!).getTime(),
            ).toBeGreaterThan(Date.now() + 80 * 86400000);
        });

        it('refuses SQL when the endpoint reports a revoked grant', async () => {
            const { client } = await loginWithPermissions('member', [
                { role: 'admin', projectUuid: projectUuid! },
            ]);
            people.push(client);
            expect(
                (
                    await completeSignIn(
                        client,
                        '/agent-connected',
                        'revoking-code',
                    )
                ).status,
            ).toBe(302);
            const callTool = await openMcpSession(client, projectUuid!);
            const result = await callTool('run_sql', {
                projectUuid,
                sql,
                limit: 1,
            });
            expect(result.isError).toBe(true);
            expect(mcpText(result)).toContain(
                getAiAccessRefusalMessage(
                    AiAccessRefusalReason.SIGN_IN_EXPIRED,
                    { projectName: null },
                ),
            );
            expect(mcpText(result)).toContain('/agent/connect');
        });

        it.each(['unavailable-code', 'network-drop-code'])(
            'keeps the credential and permits retry after %s',
            async (code) => {
                const { client } = await loginWithPermissions('member', [
                    { role: 'admin', projectUuid: projectUuid! },
                ]);
                people.push(client);
                expect(
                    (await completeSignIn(client, '/agent-connected', code))
                        .status,
                ).toBe(302);
                const credentialsUrl = '/api/v1/user/warehouseCredentials';
                const before =
                    await client.get<Body<UserWarehouseCredentials[]>>(
                        credentialsUrl,
                    );
                const callTool = await openMcpSession(client, projectUuid!);
                const failed = await callTool('run_sql', {
                    projectUuid,
                    sql,
                    limit: 1,
                });
                expect(failed.isError).toBe(true);
                expect(mcpText(failed)).toContain('Try again in a moment.');
                expect(mcpText(failed)).not.toContain('/agent/connect');
                const after =
                    await client.get<Body<UserWarehouseCredentials[]>>(
                        credentialsUrl,
                    );
                expect(after.body.results).toEqual(before.body.results);
                expect(
                    (await callTool('run_sql', { projectUuid, sql, limit: 1 }))
                        .isError,
                ).toBeFalsy();
            },
        );

        it('rotates single-use refresh tokens across successive queries', async () => {
            const { client } = await loginWithPermissions('member', [
                { role: 'admin', projectUuid: projectUuid! },
            ]);
            people.push(client);
            expect(
                (
                    await completeSignIn(
                        client,
                        '/agent-connected',
                        'single-use-code',
                    )
                ).status,
            ).toBe(302);
            const callTool = await openMcpSession(client, projectUuid!);
            for (let index = 0; index < 3; index += 1) {
                expect(
                    (await callTool('run_sql', { projectUuid, sql, limit: 1 }))
                        .isError,
                ).toBeFalsy();
            }
        });

        it('returns to the local client after sign-in', async () => {
            const callback = await completeSignIn(
                person!,
                'http://localhost:4321/done',
            );
            expect(callback.status).toBe(302);
            expect(callback.headers.get('location')).toBe(
                'http://localhost:4321/done',
            );
        });

        it('returns a non-agent session failure to the local client', async () => {
            const { client } = await loginWithPermissions('member', [
                { role: 'admin', projectUuid: projectUuid! },
            ]);
            const callback = await completeSignIn(
                client,
                'http://localhost:4321/done',
                'plain-code',
            );
            expect(callback.status).toBe(302);
            expect(callback.headers.get('location')).toBe(
                'http://localhost:4321/done?error=not_agent_session',
            );
        });

        it('ignores an external redirect and returns to the site root', async () => {
            const callback = await completeSignIn(
                person!,
                'https://evil.example/x',
            );
            expect(callback.status).toBe(302);
            expect(callback.headers.get('location')).toBe(
                new URL('/', SITE_URL).href,
            );
        });

        it('reports a non-agent session without storing an AI credential', async () => {
            const { client } = await loginWithPermissions('member', [
                { role: 'admin', projectUuid: projectUuid! },
            ]);
            const callback = await completeSignIn(
                client,
                '/agent-connected',
                'plain-code',
            );
            expect(callback.status).toBe(302);
            expect(callback.headers.get('location')).toBe(
                new URL('/agent-connected?error=not_agent_session', SITE_URL)
                    .href,
            );
            const credentials = await client.get<
                Body<UserWarehouseCredentials[]>
            >('/api/v1/user/warehouseCredentials');
            expect(credentials.status).toBe(200);
            expect(
                credentials.body.results.filter(
                    ({ purpose }) =>
                        purpose === UserWarehouseCredentialPurpose.AI,
                ),
            ).toEqual([]);
        });

        it('serves the connect page to an unauthenticated browser but protects OAuth', async () => {
            const browser = new ApiClient();
            const page = await browser.get(
                `/agent/connect?project=${projectUuid}&redirect=/agent-connected`,
            );
            expect(page.status).toBe(200);
            expect(page.headers.get('content-type')).toContain('text/html');
            const start = await browser.get('/api/v1/login/snowflake-ai', {
                failOnStatusCode: false,
            });
            expect(start.status).toBe(401);
        });
    },
);
