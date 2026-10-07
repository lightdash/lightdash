import {
    FeatureFlags,
    type AiAccessForUser,
    type AiAccessPolicy,
    type AiPrincipal,
    type AiSetupScript,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login, loginAsEditor } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import {
    createAndRefreshProject,
    deleteProjectsByName,
    postgresWarehouseConfig,
} from '../helpers/projects';

/**
 * Exercises Postgres AI principals from group policy and warehouse setup through
 * real MCP queries, warehouse permission enforcement and
 * secret rotation. No model is called, and all temporary access is removed.
 */

let projectUuid: string;
let baseUrl: string;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.AiPrincipals}`;
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

const queryArgs = (
    exploreName: string,
    dimensions: string[],
    metrics: string[],
) => ({
    title: 'e2e',
    description: 'e2e',
    projectUuid,
    queryConfig: {
        exploreName,
        dimensions,
        metrics,
        sorts: [],
        limit: 5,
        filters: null,
        customMetrics: null,
        tableCalculations: null,
        parameters: null,
    },
});

describe.sequential('Postgres AI principals', () => {
    const suffix = randomBytes(8).toString('hex');
    const roleName = `ai_e2e_${suffix}`;
    const projectName = `AI principals e2e ${suffix}`;
    let projectCreated = false;
    let admin: ApiClient;
    let adminUuid: string;
    let groupUuid: string | null = null;
    let principalUuid: string | null = null;
    let warehouse: Client | null = null;
    let schema: string;
    let clearFlag = false;
    let policyCreated = false;
    let roleCreated = false;
    let callAdminTool: Awaited<ReturnType<typeof openMcpSession>>;

    beforeAll(async () => {
        admin = await login();
        projectUuid = await createAndRefreshProject(
            admin,
            projectName,
            postgresWarehouseConfig(),
        );
        projectCreated = true;
        baseUrl = `/api/v2/projects/${projectUuid}/ai-access`;
        const user =
            await admin.get<Body<{ userUuid: string }>>('/api/v1/user');
        adminUuid = user.body.results.userUuid;
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            await admin.post(flagUrl, { enabled: true });
            clearFlag = true;
        }
        const group = await admin.post<Body<{ uuid: string }>>(
            '/api/v1/org/groups',
            {
                name: `ai-principals-e2e-${suffix}`,
                members: [{ userUuid: adminUuid }],
            },
        );
        groupUuid = group.body.results.uuid;
        const project = await admin.get<
            Body<{
                warehouseConnection: {
                    host: string;
                    port: number;
                    dbname: string;
                    schema: string;
                };
            }>
        >(`/api/v1/projects/${projectUuid}`);
        const connection = project.body.results.warehouseConnection;
        schema = connection.schema;
        warehouse = new Client({
            host: connection.host,
            port: connection.port,
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || 'password',
            database: connection.dbname,
        });
        await warehouse.connect();
    }, 360_000);

    afterAll(async () => {
        for (const { client, uuid } of personalAccessTokens) {
            await client
                .delete(`/api/v1/user/me/personal-access-tokens/${uuid}`)
                .catch(() => undefined);
        }
        const errors: unknown[] = [];
        const cleanup = async (action: () => Promise<unknown>) => {
            try {
                await action();
            } catch (error) {
                errors.push(error);
            }
        };
        if (principalUuid) {
            await cleanup(() =>
                admin.delete(`${baseUrl}/principals/${principalUuid}`),
            );
        }
        if (policyCreated) {
            await cleanup(() =>
                admin.put(`${baseUrl}/policy`, {
                    enabled: false,
                    principalKind: 'shared',
                    transport: { kind: 'direct' },
                    sharedRef: 'ai_e2e_disabled',
                    twinNameTemplate: null,
                    policySource: { label: 'e2e', url: null },
                    groupMappings: [],
                }),
            );
        }
        if (policyCreated) {
            await cleanup(async () => {
                const principals = await admin.get<Body<AiPrincipal[]>>(
                    `${baseUrl}/principals`,
                );
                for (const principal of principals.body.results) {
                    if (
                        principal.ref === 'ai_e2e_disabled' &&
                        principal.kind === 'shared'
                    ) {
                        await admin.delete(
                            `${baseUrl}/principals/${principal.aiPrincipalUuid}`,
                        );
                    }
                }
            });
        }
        if (warehouse && roleCreated) {
            await cleanup(() =>
                warehouse!.query(
                    `GRANT ${quoteIdentifier(roleName)} TO CURRENT_USER`,
                ),
            );
            await cleanup(() =>
                warehouse!.query(`DROP OWNED BY ${quoteIdentifier(roleName)}`),
            );
            await cleanup(() =>
                warehouse!.query(`DROP ROLE ${quoteIdentifier(roleName)}`),
            );
        }
        if (projectCreated) {
            await cleanup(() => deleteProjectsByName(admin, [projectName]));
        }
        if (groupUuid) {
            await cleanup(() => admin.delete(`/api/v1/groups/${groupUuid}`));
        }
        if (clearFlag) await cleanup(() => admin.delete(flagUrl));
        if (warehouse) await cleanup(() => warehouse!.end());
        if (errors.length)
            throw new AggregateError(errors, 'AI principal cleanup failed');
    });

    it('reports Postgres group keys and marked person capabilities', async () => {
        const response = await admin.get<Body<AiWarehouseCapabilities>>(
            `${baseUrl}/capabilities`,
        );
        expect(response.body.results).toMatchObject({
            principals: {
                person: { available: true, method: 'marker' },
                group: { available: true, method: 'key' },
            },
            setupFormat: 'sql',
        });
    });

    it('creates a group policy with exactly one pending principal', async () => {
        const policy = {
            enabled: true,
            principalKind: 'group',
            transport: { kind: 'direct' },
            sharedRef: null,
            twinNameTemplate: null,
            policySource: { label: 'e2e', url: null },
            groupMappings: [{ groupUuid, ref: roleName, priority: 1 }],
        };
        const response = await admin.put<Body<AiAccessPolicy>>(
            `${baseUrl}/policy`,
            policy,
        );
        policyCreated = true;
        expect(response.body.results).toMatchObject(policy);
        const principals = await admin.get<Body<AiPrincipal[]>>(
            `${baseUrl}/principals`,
        );
        principalUuid =
            principals.body.results.find(
                (principal) => principal.ref === roleName,
            )?.aiPrincipalUuid ?? null;
        expect(
            principals.body.results.find(
                (principal) => principal.ref === roleName,
            ),
        ).toMatchObject({ ref: roleName, status: 'pending', kind: 'group' });
    });

    it('applies both setup script parts and withholds the customers table', async () => {
        const response = await admin.get<Body<AiSetupScript>>(
            `${baseUrl}/setup-script?principal=${principalUuid}`,
        );
        expect(response.body.results.parts).toHaveLength(2);
        for (const part of response.body.results.parts) {
            await warehouse!.query(
                part.body
                    .split('\n')
                    .filter((line) => !line.trimStart().startsWith('--'))
                    .join('\n'),
            );
            roleCreated = true;
        }
        await warehouse!.query(
            `REVOKE SELECT ON ${quoteIdentifier(schema)}."customers" FROM ${quoteIdentifier(roleName)}`,
        );
    });

    it('probes the warehouse role and marks the principal ready', async () => {
        const response = await admin.post<Body<AiPrincipal>>(
            `${baseUrl}/principals/${principalUuid}/test`,
        );
        expect(response.body.results).toMatchObject({
            status: 'ready',
            lastProbe: { ok: true, observed: { session_user: roleName } },
        });
    });

    it('resolves the admin to the ready group principal', async () => {
        const response = await admin.get<Body<AiAccessForUser>>(
            `${baseUrl}/me`,
        );
        expect(response.body.results).toMatchObject({
            enabled: true,
            principal: { status: 'ready', ref: roleName },
            refusal: null,
        });
    });

    it('runs an orders metric query through MCP as the AI principal', async () => {
        callAdminTool = await openMcpSession(admin, projectUuid);
        const result = await callAdminTool(
            'run_metric_query',
            queryArgs('orders', [], ['orders_total_order_amount']),
        );
        expect(result.isError).toBeFalsy();
        expect(mcpText(result)).toContain('Total order amount');
    });

    it('refuses an MCP query for the withheld customers table', async () => {
        const result = await callAdminTool(
            'run_metric_query',
            queryArgs('customers', ['customers_first_name'], []),
        );
        expect(result.isError).toBe(true);
        expect(mcpText(result)).toContain(
            'permission denied for table customers',
        );
    });

    it('refuses a person without a group mapping, in the API and over MCP', async () => {
        const editor = await loginAsEditor();
        const response = await editor.get<Body<AiAccessForUser>>(
            `${baseUrl}/me`,
        );
        expect(response.body.results.refusal).toMatchObject({
            reason: 'no_group_mapping',
            action: 'ask_admin',
        });
        const callEditorTool = await openMcpSession(editor, projectUuid);
        const result = await callEditorTool(
            'run_metric_query',
            queryArgs('orders', [], ['orders_total_order_amount']),
        );
        expect(result.isError).toBe(true);
        expect(mcpText(result)).toContain(
            'None of your groups has an AI principal',
        );
    });

    it('rejects the old secret after rotation and recovers with the new password', async () => {
        const regenerated = await admin.post<Body<AiPrincipal>>(
            `${baseUrl}/principals/${principalUuid}/regenerate-secret`,
        );
        expect(regenerated.body.results.status).toBe('pending');
        const script = await admin.get<Body<AiSetupScript>>(
            `${baseUrl}/setup-script?principal=${principalUuid}`,
        );
        const passwordLiteral = script.body.results.parts[0].body.match(
            /PASSWORD\s+('(?:[^']|'')*')\s*;/,
        )?.[1];
        if (!passwordLiteral)
            throw new Error('Setup script has no password literal');
        const failed = await admin.post<Body<AiPrincipal>>(
            `${baseUrl}/principals/${principalUuid}/test`,
        );
        expect(failed.body.results).toMatchObject({
            status: 'failed',
            failureReason: 'credential_rejected',
        });
        await warehouse!.query(
            `ALTER ROLE ${quoteIdentifier(roleName)} PASSWORD ${passwordLiteral}`,
        );
        const recovered = await admin.post<Body<AiPrincipal>>(
            `${baseUrl}/principals/${principalUuid}/test`,
        );
        expect(recovered.body.results).toMatchObject({
            status: 'ready',
            lastProbe: { ok: true, observed: { session_user: roleName } },
        });
    });
});
