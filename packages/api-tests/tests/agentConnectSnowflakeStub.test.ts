import {
    AiAccessRefusalReason,
    FeatureFlags,
    getAiAccessRefusalMessage,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiAccessForUser,
    type OrganizationAgentIdentitySettings,
    type UserWarehouseCredentials,
} from '@lightdash/common';
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
        let projectUuid: string | undefined;
        let previousSettings: OrganizationAgentIdentitySettings | undefined;
        let clearFlag = false;

        beforeAll(async () => {
            const health = await new ApiClient().get<
                Body<{ auth: { snowflakeAi: { enabled: boolean } } }>
            >('/api/v1/health');
            expect(
                health.body.results.auth.snowflakeAi.enabled,
                'Snowflake AI OAuth is not enabled on the server. Configure the stub and an enterprise license to run this loop.',
            ).toBe(true);
            admin = await login();
            const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
            if (!flag.body.results.enabled) {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
                clearFlag = true;
            }
            const start = await admin.get('/api/v1/login/snowflake-ai', {
                failOnStatusCode: false,
            });
            expect(start.status).toBe(302);
            const authorizeUrl = new URL(start.headers.get('location')!);
            expect(
                authorizeUrl.origin,
                `The server's Snowflake AI OAuth endpoints do not point at SNOWFLAKE_AI_STUB_URL (${stubUrl}).`,
            ).toBe(new URL(stubUrl!).origin);
            expect(authorizeUrl.pathname).toBe('/oauth/authorize');
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
                    account: 'stub',
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
        });

        afterAll(async () => {
            const cleanup: (() => Promise<void>)[] = [];
            if (person) {
                const client = person;
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
            ]);
            const callTool = await openMcpSession(client, projectUuid!);
            const refused = await callTool('run_sql', {
                projectUuid,
                sql,
                limit: 1,
            });
            expect(refused.isError).toBe(true);
            expect(mcpText(refused)).toContain(
                getAiAccessRefusalMessage(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );

            expect(mcpText(refused)).toContain(connectUrl);
            const connectionStatus = await callTool('connect_agent', {
                projectUuid,
            });
            expect(connectionStatus.isError).toBeFalsy();
            const expectedStatus = {
                status: 'needs_sign_in',
                message: before.body.results.refusal!.message,
                connectUrl,
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
    },
);
