import {
    AI_IDENTITY_GOVERNANCE_DATABASE,
    AI_IDENTITY_GOVERNANCE_SCHEMA,
    AiIdentitySyncStatus,
    renderProvisioningOperation,
    SnowflakeAuthenticationType,
    type AiIdentityExposureCheck,
    type AiIdentityManagedScope,
    type AiIdentityProvisioningOperation,
    type AiIdentitySyncIssue,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { SnowflakeWarehouseClient } from '@lightdash/warehouses';
import { z } from 'zod';

export type SnowflakeProvisionerRow = Record<string, unknown>;

const exposureCache = new Map<
    string,
    { value: AiIdentityExposureCheck; expiresAt: number }
>();

export class ProvisionerConnection {
    private readonly client: SnowflakeWarehouseClient;
    private readonly account: string;
    private readonly roleName: string | null;

    constructor(
        projectCredentials: CreateSnowflakeCredentials,
        userName: string,
        roleName: string | null,
        privateKey: string,
        private readonly context: {
            mappedRoles: ReadonlySet<string>;
            lightdashCreatedUsers: Set<string>;
            syncTimeoutSeconds?: number;
        },
    ) {
        this.account = projectCredentials.account;
        this.roleName = roleName;
        this.client = new SnowflakeWarehouseClient({
            ...projectCredentials,
            database: '',
            schema: '',
            warehouse: roleName === null ? '' : projectCredentials.warehouse,
            user: userName,
            role: roleName ?? undefined,
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            privateKey,
            privateKeyPass: undefined,
            password: undefined,
            token: undefined,
            refreshToken: undefined,
            requireUserCredentials: false,
            requireAgentSession: false,
            expectedCurrentUser: userName,
            timeoutSeconds:
                context.syncTimeoutSeconds ?? projectCredentials.timeoutSeconds,
        });
    }

    async currentIdentity(): Promise<{ user: string; role: string }> {
        const result = await this.client.runQuery(
            'SELECT CURRENT_USER() AS CURRENT_USER, CURRENT_ROLE() AS CURRENT_ROLE',
        );
        return {
            user: String(result.rows[0]?.CURRENT_USER ?? ''),
            role: String(result.rows[0]?.CURRENT_ROLE ?? ''),
        };
    }

    async grantsToRole(roleName: string): Promise<SnowflakeProvisionerRow[]> {
        if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(roleName))
            throw new Error('Invalid provisioner role name');
        const result = await this.client.runQuery(
            `SHOW GRANTS TO ROLE ${roleName}`,
        );
        return result.rows;
    }

    async users(): Promise<SnowflakeProvisionerRow[]> {
        const result = await this.client.runQuery('SHOW USERS');
        return result.rows;
    }

    async execute(operation: AiIdentityProvisioningOperation): Promise<string> {
        const sql = renderProvisioningOperation(operation, this.context);
        await this.client.runQuery(sql);
        if (operation.kind === 'create_user')
            this.context.lightdashCreatedUsers.add(operation.userName);
        if (operation.kind === 'drop_user')
            this.context.lightdashCreatedUsers.delete(operation.userName);
        return sql;
    }

    async readAiExposure(): Promise<AiIdentityExposureCheck> {
        const key = `${this.account}:${this.roleName}`;
        const cached = exposureCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        try {
            const namespace = `${AI_IDENTITY_GOVERNANCE_DATABASE}.${AI_IDENTITY_GOVERNANCE_SCHEMA}`;
            const result = await this.client.runQuery(
                `CALL ${namespace}.AI_EXPOSURE_CHECK()`,
            );
            const raw = result.rows[0]?.AI_EXPOSURE_CHECK;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const value = z
                .object({
                    status: z.enum(['OK', 'UNSAFE']),
                    exposed: z.array(z.string()).default([]),
                    error: z.string().nullable().default(null),
                })
                .parse(parsed);
            const exposure = {
                status: value.status,
                exposed: value.exposed,
                error: value.error,
            };
            exposureCache.set(key, {
                value: exposure,
                expiresAt: Date.now() + (exposure.error ? 10_000 : 60_000),
            });
            return exposure;
        } catch (cause) {
            const value: AiIdentityExposureCheck = {
                status: 'UNSAFE',
                exposed: [],
                error: cause instanceof Error ? cause.message : String(cause),
            };
            exposureCache.set(key, { value, expiresAt: Date.now() + 10_000 });
            return value;
        }
    }

    async readViewDependencyWarnings(): Promise<AiIdentitySyncIssue[]> {
        const namespace = `${AI_IDENTITY_GOVERNANCE_DATABASE}.${AI_IDENTITY_GOVERNANCE_SCHEMA}`;
        try {
            const result = await this.client.runQuery(
                `CALL ${namespace}.VIEW_DEPENDENCY_WARNINGS()`,
            );
            const raw = result.rows[0]?.VIEW_DEPENDENCY_WARNINGS;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return z
                .array(
                    z.object({
                        code: z.literal('view_dependency'),
                        message: z.string(),
                        roleName: z.string().nullable(),
                        database: z.string().nullable(),
                        schema: z.string().nullable(),
                    }),
                )
                .parse(parsed);
        } catch (error) {
            return [
                {
                    code: 'view_dependency',
                    message: `View dependencies could not be checked: ${error instanceof Error ? error.message : String(error)}`,
                    roleName: null,
                    database: null,
                    schema: null,
                },
            ];
        }
    }

    async readAutomaticSync(): Promise<{
        status: AiIdentitySyncStatus;
        hasLog: boolean;
        lastRunAt: Date;
        hasOkRun: boolean;
        exposure: AiIdentityExposureCheck;
        managedScope: AiIdentityManagedScope[];
        issues: AiIdentitySyncIssue[];
        progress: number;
    }> {
        const namespace = `${AI_IDENTITY_GOVERNANCE_DATABASE}.${AI_IDENTITY_GOVERNANCE_SCHEMA}`;
        const result = await this.client.runQuery(
            `SELECT LEVEL, MESSAGE, TO_VARCHAR(RUN_AT, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AS RUN_AT FROM ${namespace}.AI_GRANT_LOG WHERE RUN_ID = (SELECT RUN_ID FROM ${namespace}.AI_GRANT_LOG WHERE INVOKED_BY = 'SYSTEM' ORDER BY RUN_AT DESC LIMIT 1) ORDER BY RUN_AT DESC`,
        );
        const latest = result.rows[0];
        const lastRunAt = latest ? new Date(String(latest.RUN_AT)) : new Date();
        if (Number.isNaN(lastRunAt.getTime()))
            throw new Error('Invalid sync time.');
        const summary = result.rows.find((row) =>
            /^status=(OK|WARN|UNSAFE)\b/.test(String(row.MESSAGE)),
        );
        let status: AiIdentitySyncStatus;
        if (summary)
            status = String(summary.MESSAGE).match(
                /^status=(OK|WARN|UNSAFE)/,
            )?.[1] as AiIdentitySyncStatus;
        else if (result.rows.some((row) => row.LEVEL === 'ERROR'))
            status = AiIdentitySyncStatus.UNSAFE;
        else status = AiIdentitySyncStatus.RUNNING;
        const ok = await this.client.runQuery(
            `SELECT 1 AS HAS_OK_RUN FROM ${namespace}.AI_GRANT_LOG WHERE INVOKED_BY = 'SYSTEM' AND MESSAGE LIKE 'status=OK %' ORDER BY RUN_AT DESC LIMIT 1`,
        );
        const hasOkRun = ok.rows.length > 0;
        const scope = await this.client.runQuery(
            `SELECT AI_ROLE, DATABASE_NAME FROM ${namespace}.AI_GRANT_SCOPE ORDER BY AI_ROLE, DATABASE_NAME`,
        );
        const scopeRows = z
            .array(z.object({ AI_ROLE: z.string(), DATABASE_NAME: z.string() }))
            .parse(scope.rows);
        const progressMessage = result.rows.find((row) =>
            /^progress=[0-9]+$/.test(String(row.MESSAGE)),
        );
        const progress = Number(
            String(progressMessage?.MESSAGE ?? 'progress=0').slice(9),
        );
        const issues: AiIdentitySyncIssue[] = result.rows
            .filter((row) => row.LEVEL === 'WARN' || row.LEVEL === 'ERROR')
            .map((row) => ({
                code: String(row.MESSAGE).startsWith('rule failed')
                    ? 'bad_pattern'
                    : 'sync_failed',
                message: String(row.MESSAGE),
                roleName: null,
                database: null,
                schema: null,
            }));
        return {
            status,
            hasLog: latest !== undefined,
            lastRunAt,
            hasOkRun,
            exposure: await this.readAiExposure(),
            managedScope: scopeRows.map((row) => ({
                roleName: row.AI_ROLE,
                database: row.DATABASE_NAME,
            })),
            issues,
            progress,
        };
    }
}
