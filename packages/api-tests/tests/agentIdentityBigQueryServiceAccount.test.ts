import {
    AiAccessRefusalReason,
    BigqueryAuthenticationType,
    FeatureFlags,
    getAiAccessRefusalMessage,
    SEED_PROJECT,
    WarehouseTypes,
    type AiAccessForUser,
    type AiServiceAccountCredentialInput,
    type ApiAiServiceAccountSlotResponse,
    type ApiAiServiceAccountTestResponse,
    type ApiOrganizationAgentIdentityOverviewResponse,
    type ApiOrganizationAgentIdentityRuleResponse,
    type ApiProjectResponse,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import { pollUntil } from '../helpers/polling';
import {
    bigqueryWarehouseConfig,
    createProject,
    deleteProjectsByName,
    hasBigqueryCredentials,
} from '../helpers/projects';

const flagUrl = `/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`;
const rulesUrl = '/api/v2/org/agent-identity';
const bigqueryRuleUrl = `${rulesUrl}/${WarehouseTypes.BIGQUERY}`;
const sql = 'SELECT SESSION_USER() AS principal';

describe.skipIf(!hasBigqueryCredentials())(
    'BigQuery AI service account rules and MCP execution',
    () => {
        const projectName = `agent-identity-bigquery-${randomUUID()}`;
        let admin: ApiClient;
        let previousRule: OrganizationAgentIdentityRule | undefined;
        let clearFlag = false;
        let projectUuid: string;
        let warehouseConfig: Record<string, unknown>;
        let keyfileContents: Record<string, string>;
        let credentials: AiServiceAccountCredentialInput;
        let callTool: Awaited<ReturnType<typeof openMcpSession>>;
        const privateKeys: string[] = [];

        const accessUrl = () => `/api/v2/projects/${projectUuid}/ai-access`;
        const slotUrl = () => `${accessUrl()}/service-account`;

        const expectNoSecrets = (body: unknown) => {
            const serialized = JSON.stringify(body);
            expect(serialized.includes('"keyfileContents":')).toBe(false);
            expect(serialized.includes('"private_key":')).toBe(false);
            expect(serialized.includes('PRIVATE KEY')).toBe(false);
            for (const key of privateKeys) {
                for (const line of key.split('\n').filter(Boolean)) {
                    expect(serialized.includes(line)).toBe(false);
                }
            }
        };

        const getSlot = async () => {
            const response = await admin.get<ApiAiServiceAccountSlotResponse>(
                slotUrl(),
                { failOnStatusCode: false },
            );
            expectNoSecrets(response.body);
            expect(response.status).toBe(200);
            return response.body.results;
        };

        const putRule = async (
            source: 'marked_person' | 'ai_service_account',
        ) => {
            const response =
                await admin.put<ApiOrganizationAgentIdentityRuleResponse>(
                    bigqueryRuleUrl,
                    { source },
                );
            expect(response.status).toBe(200);
            expect(response.body.results).toMatchObject({
                warehouseType: WarehouseTypes.BIGQUERY,
                source,
            });
        };

        const runAgentSql = () =>
            callTool('run_sql', { projectUuid, sql, limit: 1 });

        beforeAll(async () => {
            admin = await login();
            const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
            if (!flag.body.results.enabled) {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
                clearFlag = true;
            }
            const overview =
                await admin.get<ApiOrganizationAgentIdentityOverviewResponse>(
                    rulesUrl,
                );
            previousRule = overview.body.results.rules.find(
                ({ warehouseType }) =>
                    warehouseType === WarehouseTypes.BIGQUERY,
            );
            expect(previousRule).toBeDefined();
            warehouseConfig = bigqueryWarehouseConfig();
            keyfileContents = warehouseConfig.keyfileContents as Record<
                string,
                string
            >;
            expect(typeof keyfileContents.client_email).toBe('string');
            expect(Boolean(keyfileContents.client_email)).toBe(true);
            privateKeys.push(keyfileContents.private_key);
            credentials = {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                keyfileContents,
            };
        });

        afterAll(async () => {
            if (!admin) return;
            const cleanup: (() => Promise<void>)[] = [];
            if (previousRule) {
                const { source } = previousRule;
                cleanup.push(async () => {
                    expect(
                        (await admin.put(bigqueryRuleUrl, { source })).status,
                    ).toBe(200);
                });
            }
            cleanup.push(() => deleteProjectsByName(admin, [projectName]));
            for (const { client, uuid } of personalAccessTokens.filter(
                ({ client: owner }) => owner === admin,
            )) {
                cleanup.push(async () => {
                    expect(
                        (
                            await client.delete(
                                `/api/v1/user/me/personal-access-tokens/${uuid}`,
                            )
                        ).status,
                    ).toBe(200);
                });
            }
            if (clearFlag) {
                cleanup.push(async () => {
                    expect((await admin.delete(flagUrl)).status).toBe(200);
                });
            }
            const failures: unknown[] = [];
            for (const action of cleanup) {
                try {
                    await action();
                } catch (error) {
                    failures.push(error);
                }
            }
            if (failures.length) {
                throw new AggregateError(
                    failures,
                    'BigQuery AI service account test cleanup failed',
                );
            }
        }, 180_000);

        it('lists only the enforceable warehouses and rejects agent sign-in for BigQuery without changing the rule or project', async () => {
            const overview =
                await admin.get<ApiOrganizationAgentIdentityOverviewResponse>(
                    rulesUrl,
                );
            expect(
                overview.body.results.rules
                    .map(({ warehouseType }) => warehouseType)
                    .sort(),
            ).toEqual(
                [
                    WarehouseTypes.ATHENA,
                    WarehouseTypes.BIGQUERY,
                    WarehouseTypes.DATABRICKS,
                    WarehouseTypes.POSTGRES,
                    WarehouseTypes.REDSHIFT,
                    WarehouseTypes.TRINO,
                    WarehouseTypes.SNOWFLAKE,
                ].sort(),
            );
            const projectUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}`;
            const before = await admin.get<ApiProjectResponse>(projectUrl);
            const rejected = await admin.put(
                bigqueryRuleUrl,
                { source: 'agent_sign_in' },
                { failOnStatusCode: false },
            );
            expect(rejected.status).toBeGreaterThanOrEqual(400);
            expect(rejected.status).toBeLessThan(500);
            const unchanged =
                await admin.get<ApiOrganizationAgentIdentityOverviewResponse>(
                    rulesUrl,
                );
            expect(
                unchanged.body.results.rules.find(
                    ({ warehouseType }) =>
                        warehouseType === WarehouseTypes.BIGQUERY,
                ),
            ).toEqual(previousRule);
            const after = await admin.get<ApiProjectResponse>(projectUrl);
            expect(
                JSON.stringify(after.body.results.warehouseConnection) ===
                    JSON.stringify(before.body.results.warehouseConnection),
            ).toBe(true);
            await putRule('marked_person');
        });

        it('rejects BigQuery keys for the AI service account slot on the Postgres seed project', async () => {
            const seedSlotUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/ai-access/service-account`;
            const getSeedSlot = async () => {
                const response =
                    await admin.get<ApiAiServiceAccountSlotResponse>(
                        seedSlotUrl,
                        { failOnStatusCode: false },
                    );
                expectNoSecrets(response.body);
                expect(response.status).toBe(200);
                return response.body.results;
            };
            expect(await getSeedSlot()).toBeNull();
            const rejected = await admin.put(seedSlotUrl, credentials, {
                failOnStatusCode: false,
            });
            expectNoSecrets(rejected.body);
            expect(rejected.status).toBeGreaterThanOrEqual(400);
            expect(rejected.status).toBeLessThan(500);
            expect(await getSeedSlot()).toBeNull();
        });

        it('creates a dedicated BigQuery project with an empty slot', async () => {
            projectUuid = await createProject(
                admin,
                projectName,
                warehouseConfig,
            );
            const project = await pollUntil<ApiProjectResponse>(
                admin,
                `/api/v1/projects/${projectUuid}`,
                {
                    timeout: 180_000,
                    condition: ({ results }) =>
                        results.projectUuid === projectUuid &&
                        results.warehouseConnection?.type ===
                            WarehouseTypes.BIGQUERY,
                },
            );
            expect(project.results.projectUuid).toBe(projectUuid);
            expect(await getSlot()).toBeNull();
        }, 240_000);

        it('uses the connection account for MCP SQL under the marked person rule', async () => {
            const me = await admin.get<Body<AiAccessForUser>>(
                `${accessUrl()}/me`,
            );
            expect(me.body.results).toMatchObject({
                source: 'marked_person',
                identity: 'marked_person',
                refusal: null,
            });
            callTool = await openMcpSession(admin, projectUuid);
            const result = await runAgentSql();
            expect(result.isError).toBeFalsy();
            expect(result).toMatchObject({
                structuredContent: {
                    result: {
                        rows: [{ principal: keyfileContents.client_email }],
                    },
                },
            });
        });

        it('refuses MCP SQL for a missing AI service account slot while normal SQL still works', async () => {
            await putRule('ai_service_account');
            const me = await admin.get<Body<AiAccessForUser>>(
                `${accessUrl()}/me`,
            );
            expect(me.body.results.refusal?.reason).toBe(
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
            );
            const refused = await runAgentSql();
            expect(refused.isError).toBe(true);
            expect(mcpText(refused)).toContain(
                getAiAccessRefusalMessage(
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                    { projectName },
                ),
            );
            const started = await admin.post<Body<{ queryUuid: string }>>(
                `/api/v2/projects/${projectUuid}/query/sql`,
                { sql, limit: 1 },
            );
            expect(started.status).toBe(200);
            const queryUrl = `/api/v2/projects/${projectUuid}/query/${started.body.results.queryUuid}`;
            const completed = await pollUntil<Body<{ status: string }>>(
                admin,
                queryUrl,
                {
                    timeout: 120_000,
                    condition: ({ results }) =>
                        results.status === 'ready' ||
                        results.status === 'error',
                },
            );
            expect(completed.results.status).toBe('ready');
            const response = await admin.get<string>(`${queryUrl}/results`);
            let row: { principal: string };
            try {
                row = JSON.parse(response.body.trim());
            } catch {
                throw new Error('SQL runner returned invalid result JSON');
            }
            expect(row.principal).toBe(keyfileContents.client_email);
        }, 180_000);

        it('tests the real key without saving it or exposing secrets', async () => {
            const response = await admin.post<ApiAiServiceAccountTestResponse>(
                `${slotUrl()}/test`,
                { credentials },
                { failOnStatusCode: false },
            );
            expectNoSecrets(response.body);
            expect(response.status).toBe(200);
            expect(response.body.results).toMatchObject({
                ok: true,
                principal: keyfileContents.client_email,
            });
            expect(await getSlot()).toBeNull();
        });

        it('runs MCP SQL through the saved slot using the same CI key, without proving a distinct principal', async () => {
            const saved = await admin.put<ApiAiServiceAccountSlotResponse>(
                slotUrl(),
                credentials,
                { failOnStatusCode: false },
            );
            expectNoSecrets(saved.body);
            expect(saved.status).toBe(200);
            const slot = await getSlot();
            expect(slot).toMatchObject({
                projectUuid,
                kind: 'ai_service_account',
                scope: 'connection',
                warehouseType: WarehouseTypes.BIGQUERY,
                method: 'private_key',
            });
            const me = await admin.get<Body<AiAccessForUser>>(
                `${accessUrl()}/me`,
            );
            expect(me.body.results).toMatchObject({
                identity: 'ai_service_account',
                principalKind: 'service_account',
                refusal: null,
            });
            const result = await runAgentSql();
            expect(result.isError).toBeFalsy();
            expect(result).toMatchObject({
                structuredContent: {
                    result: {
                        rows: [{ principal: keyfileContents.client_email }],
                    },
                },
            });
        });

        it('refuses MCP SQL with an unrelated RSA key and sanitizes the saved-slot test failure', async () => {
            const { privateKey } = generateKeyPairSync('rsa', {
                modulusLength: 2048,
            });
            const unrelatedPrivateKey = privateKey
                .export({ type: 'pkcs8', format: 'pem' })
                .toString();
            privateKeys.push(unrelatedPrivateKey);
            const saved = await admin.put<ApiAiServiceAccountSlotResponse>(
                slotUrl(),
                {
                    ...credentials,
                    keyfileContents: {
                        ...keyfileContents,
                        private_key: unrelatedPrivateKey,
                    },
                },
                { failOnStatusCode: false },
            );
            expectNoSecrets(saved.body);
            expect(saved.status).toBe(200);
            const refused = await runAgentSql();
            expectNoSecrets(refused);
            expect(refused.isError).toBe(true);
            expect(mcpText(refused)).toContain(
                getAiAccessRefusalMessage(
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    { projectName },
                ),
            );
            const tested = await admin.post<ApiAiServiceAccountTestResponse>(
                `${slotUrl()}/test`,
                { credentials: null },
                { failOnStatusCode: false },
            );
            expectNoSecrets(tested.body);
            expect(tested.status).toBe(200);
            expect(tested.body.results).toMatchObject({
                ok: false,
                principal: null,
            });
        });

        it('returns to the required missing-slot refusal after deleting the slot', async () => {
            const deleted =
                await admin.delete<ApiAiServiceAccountSlotResponse>(slotUrl());
            expect(deleted.status).toBe(200);
            expect(deleted.body.results).toBeNull();
            expect(await getSlot()).toBeNull();
            const me = await admin.get<Body<AiAccessForUser>>(
                `${accessUrl()}/me`,
            );
            expect(me.body.results.refusal?.reason).toBe(
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
            );
        });
    },
);
