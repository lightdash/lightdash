import {
    AI_IDENTITY_STALE_PENDING_DAYS,
    AiIdentity,
    AiIdentityAccount,
    AiIdentityCreationMode,
    AiIdentityEvent,
    AiIdentityEventActorType,
    AiIdentityFailureReason,
    AiIdentityFilter,
    AiIdentityJob,
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityListResult,
    AiIdentityProvisionerStatus,
    AiIdentitySort,
    AiIdentityState,
    AiIdentityStateCounts,
    AiIdentityStatus,
    assertUnreachable,
    DEFAULT_AI_TWIN_NAME_TEMPLATE,
    getAiIdentityFailureGroupCopy,
    resolveAiTwinName,
    type AiIdentityAiRoleDefinition,
    type AiIdentityProvisionerFinding,
    type AiIdentityUngrantedSchemas,
    type UpdateAiIdentityRoleMapping,
} from '@lightdash/common';
import { Knex } from 'knex';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
    AiIdentitiesTableName,
    DbAiIdentity,
} from '../database/entities/aiIdentities';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { usersInProjectSql } from './AnalyticsModelSql';

const currentSchemaRule = z
    .object({
        database: z.string(),
        excludePatterns: z.array(z.string()),
    })
    .strict();

const legacySchemaRule = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('all_except'),
        database: z.string(),
        patterns: z.array(z.string()),
    }),
    z.object({
        mode: z.literal('only_matching'),
        database: z.string(),
        patterns: z.array(z.string()),
    }),
    z.object({ mode: z.literal('list'), schemas: z.array(z.string()) }),
    z.object({ mode: z.literal('existing_role') }),
]);

const normalizeStoredSchemaRule = (
    rule: unknown,
    schemas: string[],
): { database: string; excludePatterns: string[] } => {
    if (rule === null)
        return {
            database: schemas[0]?.split('.')[0] ?? '',
            excludePatterns: ['*'],
        };
    const current = currentSchemaRule.safeParse(rule);
    if (current.success) return current.data;
    const legacy = legacySchemaRule.parse(rule);
    switch (legacy.mode) {
        case 'all_except':
            return {
                database: legacy.database,
                excludePatterns: legacy.patterns,
            };
        case 'list':
            return {
                database: legacy.schemas[0]?.split('.')[0] ?? '',
                excludePatterns: ['*'],
            };
        case 'only_matching':
        case 'existing_role':
            return {
                database: schemas[0]?.split('.')[0] ?? '',
                excludePatterns: ['*'],
            };
        default:
            return assertUnreachable(legacy, 'Unknown stored schema rule');
    }
};

type IdentityRow = DbAiIdentity & {
    email: string;
    first_name: string;
    last_name: string;
    snowflake_account: string;
    twin_name_template: string | null;
};
type AccountRow = {
    ai_identity_account_uuid: string;
    organization_uuid: string;
    snowflake_account: string;
    twin_name_template: string | null;
    role_template: string | null;
    last_full_check_at: Date | null;
    creation_mode: AiIdentityCreationMode;
};
const emptyCounts = (): AiIdentityStateCounts => ({
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0,
    needs_sign_in: 0,
});
const nameSql = `COALESCE(ai_identities.twin_name_override, CASE WHEN ai_identities.snowflake_login IS NOT NULL THEN REPLACE(COALESCE(ai_identity_accounts.twin_name_template, '${DEFAULT_AI_TWIN_NAME_TEMPLATE}'), '{snowflake_login}', ai_identities.snowflake_login) END)`;
const stateSql = `CASE WHEN ${nameSql} IS NULL THEN 'needs_sign_in' ELSE ai_identities.status END`;

const SAFE_SNOWFLAKE_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export class AiIdentityModel {
    constructor(
        private readonly args: {
            database: Knex;
            encryptionUtil: EncryptionUtil;
        },
    ) {}
    private get database(): Knex {
        return this.args.database;
    }

    private async toAccount(
        row: AccountRow,
        counts: AiIdentityStateCounts,
    ): Promise<AiIdentityAccount> {
        const provisioner = await this.database('ai_identity_provisioners')
            .where('ai_identity_account_uuid', row.ai_identity_account_uuid)
            .first('status', 'status_message');
        const effectiveMode =
            row.creation_mode === AiIdentityCreationMode.AUTOMATIC &&
            provisioner?.status === AiIdentityProvisionerStatus.READY
                ? AiIdentityCreationMode.AUTOMATIC
                : AiIdentityCreationMode.GUIDED;
        return {
            aiIdentityAccountUuid: row.ai_identity_account_uuid,
            snowflakeAccount: row.snowflake_account,
            twinNameTemplate: row.twin_name_template,
            roleTemplate: row.role_template,
            lastFullCheckAt: row.last_full_check_at,
            effectiveMode,
            fallbackReason:
                row.creation_mode === AiIdentityCreationMode.AUTOMATIC &&
                effectiveMode === AiIdentityCreationMode.GUIDED
                    ? `The provisioner cannot sign in to Snowflake: ${provisioner?.status_message ?? 'it is not ready'}. AI identities are created through the guided steps until it works again.`
                    : null,
            counts,
        };
    }
    async getOrCreateAccount(
        organizationUuid: string,
        snowflakeAccount: string,
    ): Promise<AiIdentityAccount> {
        await this.database('ai_identity_accounts')
            .insert({
                organization_uuid: organizationUuid,
                snowflake_account: snowflakeAccount,
            })
            .onConflict(['organization_uuid', 'snowflake_account'])
            .ignore();
        const row = await this.database<AccountRow>('ai_identity_accounts')
            .where({
                organization_uuid: organizationUuid,
                snowflake_account: snowflakeAccount,
            })
            .first();
        if (!row) throw new Error('AI identity account was not created');
        return this.toAccount(
            row,
            await this.counts(row.ai_identity_account_uuid),
        );
    }
    async getAccount(
        aiIdentityAccountUuid: string,
    ): Promise<(AiIdentityAccount & { organizationUuid: string }) | null> {
        const row = await this.database<AccountRow>('ai_identity_accounts')
            .where('ai_identity_account_uuid', aiIdentityAccountUuid)
            .first();
        return row
            ? {
                  ...(await this.toAccount(
                      row,
                      await this.counts(aiIdentityAccountUuid),
                  )),
                  organizationUuid: row.organization_uuid,
              }
            : null;
    }
    async listAccounts(organizationUuid: string): Promise<AiIdentityAccount[]> {
        const rows = await this.database<AccountRow>('ai_identity_accounts')
            .where('organization_uuid', organizationUuid)
            .orderBy('snowflake_account');
        return Promise.all(
            rows.map(async (row) =>
                this.toAccount(
                    row,
                    await this.counts(row.ai_identity_account_uuid),
                ),
            ),
        );
    }
    async listAllAccounts(): Promise<
        (AiIdentityAccount & { organizationUuid: string })[]
    > {
        const rows = await this.database<AccountRow>('ai_identity_accounts');
        return Promise.all(
            rows.map(async (row) => ({
                ...(await this.toAccount(
                    row,
                    await this.counts(row.ai_identity_account_uuid),
                )),
                organizationUuid: row.organization_uuid,
            })),
        );
    }
    async updateAccountTemplate(
        aiIdentityAccountUuid: string,
        twinNameTemplate: string | null,
        roleTemplate: string | null = null,
    ): Promise<AiIdentityAccount> {
        await this.database.transaction(async (trx) => {
            await trx('ai_identity_accounts')
                .where('ai_identity_account_uuid', aiIdentityAccountUuid)
                .update({
                    twin_name_template: twinNameTemplate,
                    role_template: roleTemplate,
                    updated_at: new Date(),
                });
            await trx(AiIdentitiesTableName)
                .where('ai_identity_account_uuid', aiIdentityAccountUuid)
                .whereNull('twin_name_override')
                .update({
                    status: AiIdentityStatus.PENDING,
                    failure_reason: null,
                    status_message: null,
                    checked_at: null,
                    updated_at: new Date(),
                });
        });
        const result = await this.getAccount(aiIdentityAccountUuid);
        if (!result) throw new Error('AI identity account not found');
        return result;
    }
    async setLastFullCheck(aiIdentityAccountUuid: string): Promise<void> {
        await this.database('ai_identity_accounts')
            .where('ai_identity_account_uuid', aiIdentityAccountUuid)
            .update({ last_full_check_at: new Date(), updated_at: new Date() });
    }

    private queryRows(includePrivateKey = false) {
        const query = this.database(AiIdentitiesTableName)
            .join(
                'ai_identity_accounts',
                'ai_identity_accounts.ai_identity_account_uuid',
                'ai_identities.ai_identity_account_uuid',
            )
            .join('users', 'users.user_uuid', 'ai_identities.user_uuid')
            .join('emails', 'emails.user_id', 'users.user_id')
            .where('emails.is_primary', true)
            .select(
                'ai_identities.ai_identity_uuid',
                'ai_identities.ai_identity_account_uuid',
                'ai_identities.user_uuid',
                'ai_identities.snowflake_login',
                'ai_identities.twin_name_override',
                'ai_identities.public_key',
                'ai_identities.public_key_fingerprint',
                'ai_identities.status',
                'ai_identities.failure_reason',
                'ai_identities.status_message',
                'ai_identities.checked_at',
                'ai_identities.created_at',
                'users.first_name',
                'users.last_name',
                'emails.email',
                'ai_identity_accounts.snowflake_account',
                'ai_identity_accounts.twin_name_template',
            );
        if (includePrivateKey)
            query.select('ai_identities.encrypted_private_key');
        return query;
    }
    private toIdentity(row: IdentityRow): AiIdentity {
        const twinName = resolveAiTwinName({
            twinNameOverride: row.twin_name_override,
            twinNameTemplate:
                row.twin_name_template ?? DEFAULT_AI_TWIN_NAME_TEMPLATE,
            snowflakeLogin: row.snowflake_login,
        });
        return {
            aiIdentityUuid: row.ai_identity_uuid,
            aiIdentityAccountUuid: row.ai_identity_account_uuid,
            snowflakeAccount: row.snowflake_account,
            userUuid: row.user_uuid,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            snowflakeLogin: row.snowflake_login,
            twinNameOverride: row.twin_name_override,
            twinName,
            publicKey: row.public_key,
            publicKeyFingerprint: row.public_key_fingerprint,
            state:
                twinName === null
                    ? AiIdentityState.NEEDS_SIGN_IN
                    : (row.status as unknown as AiIdentityState),
            stale:
                twinName !== null &&
                row.status === AiIdentityStatus.PENDING &&
                row.created_at.getTime() <
                    Date.now() - AI_IDENTITY_STALE_PENDING_DAYS * 86_400_000,
            failureReason:
                (row.failure_reason as string | null) === 'public_key_not_set'
                    ? AiIdentityFailureReason.KEY_OR_USER_REJECTED
                    : row.failure_reason,
            statusMessage: row.status_message,
            checkedAt: row.checked_at,
            createdAt: row.created_at,
        };
    }
    private filteredQuery(filter: AiIdentityFilter) {
        const query = this.queryRows().where(
            'ai_identities.ai_identity_account_uuid',
            filter.aiIdentityAccountUuid,
        );
        if (filter.aiIdentityUuids?.length)
            query.whereIn(
                'ai_identities.ai_identity_uuid',
                filter.aiIdentityUuids,
            );
        if (filter.states.length)
            query.whereRaw(
                `${stateSql} IN (${filter.states.map(() => '?').join(', ')})`,
                filter.states,
            );
        if (filter.reasons.length)
            query.whereIn(
                'ai_identities.failure_reason',
                filter.reasons.flatMap((reason) =>
                    reason === AiIdentityFailureReason.KEY_OR_USER_REJECTED
                        ? [reason, 'public_key_not_set']
                        : [reason],
                ),
            );
        if (filter.search !== null) {
            const search = `%${filter.search}%`;
            query.where((builder) =>
                builder
                    .whereILike('users.first_name', search)
                    .orWhereILike('users.last_name', search)
                    .orWhereILike('emails.email', search)
                    .orWhereILike('ai_identities.snowflake_login', search)
                    .orWhereRaw(`${nameSql} ILIKE ?`, [search]),
            );
        }
        if (filter.staleOnly)
            query
                .whereRaw(`${nameSql} IS NOT NULL`)
                .where('ai_identities.status', AiIdentityStatus.PENDING)
                .where(
                    'ai_identities.created_at',
                    '<',
                    this.database.raw(
                        `NOW() - INTERVAL '${AI_IDENTITY_STALE_PENDING_DAYS} days'`,
                    ),
                );
        if (filter.projectUuid !== null)
            query.whereRaw(
                `ai_identities.user_uuid IN (` +
                    `SELECT user_uuid FROM (${usersInProjectSql()}) project_users)`,
                {
                    projectUuid: filter.projectUuid,
                    organizationUuid: this.database.raw(
                        '(SELECT organization_uuid FROM ai_identity_accounts WHERE ai_identity_account_uuid = ?)',
                        [filter.aiIdentityAccountUuid],
                    ),
                },
            );
        return query;
    }
    private async counts(
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityStateCounts> {
        const rows = (await this.database(AiIdentitiesTableName)
            .join(
                'ai_identity_accounts',
                'ai_identity_accounts.ai_identity_account_uuid',
                'ai_identities.ai_identity_account_uuid',
            )
            .where(
                'ai_identities.ai_identity_account_uuid',
                aiIdentityAccountUuid,
            )
            .select(this.database.raw(`${stateSql} AS state`))
            .count('* as count')
            .groupByRaw(stateSql)) as {
            state: AiIdentityState;
            count: string;
        }[];
        const counts = emptyCounts();
        rows.forEach((row) => {
            counts[row.state] = Number(row.count);
            counts.total += Number(row.count);
        });
        return counts;
    }
    async list(
        filter: AiIdentityFilter,
        sort: AiIdentitySort = AiIdentitySort.SEVERITY,
        order: 'asc' | 'desc' = 'asc',
        page = 1,
        pageSize = 50,
    ): Promise<AiIdentityListResult> {
        const groups = (await this.filteredQuery(filter)
            .clone()
            .clearSelect()
            .select(
                this.database.raw(`${stateSql} AS state`),
                'ai_identities.failure_reason',
            )
            .count('* as count')
            .groupByRaw(`${stateSql}, ai_identities.failure_reason`)) as {
            state: AiIdentityState;
            failure_reason: AiIdentityFailureReason | null;
            count: string;
        }[];
        const counts = emptyCounts();
        const reasons = new Map<AiIdentityFailureReason, number>();
        groups.forEach((row) => {
            const count = Number(row.count);
            counts[row.state] += count;
            counts.total += count;
            if (
                row.state === AiIdentityState.FAILED &&
                row.failure_reason !== null
            ) {
                const reason =
                    (row.failure_reason as string | null) ===
                    'public_key_not_set'
                        ? AiIdentityFailureReason.KEY_OR_USER_REJECTED
                        : row.failure_reason;
                reasons.set(reason, (reasons.get(reason) ?? 0) + count);
            }
        });
        const query = this.filteredQuery(filter);
        if (sort === AiIdentitySort.SEVERITY)
            query
                .orderByRaw(
                    `CASE WHEN ai_identities.failure_reason IN ('wrong_user', 'not_service_agent') THEN 0 ` +
                        `WHEN ai_identities.status = 'failed' THEN 1 WHEN ${stateSql} = 'needs_sign_in' THEN 2 ` +
                        `WHEN ai_identities.status = 'pending' THEN 3 ELSE 4 END ${order}`,
                )
                .orderByRaw('ai_identities.checked_at ASC NULLS FIRST');
        if (sort === AiIdentitySort.LAST_CHECKED)
            query.orderByRaw(`ai_identities.checked_at ${order} NULLS FIRST`);
        if (sort === AiIdentitySort.NAME)
            query
                .orderBy('users.first_name', order)
                .orderBy('users.last_name', order);
        const rows = (await query
            .limit(pageSize)
            .offset((page - 1) * pageSize)) as IdentityRow[];
        return {
            data: rows.map((row) => this.toIdentity(row)),
            pagination: {
                page,
                pageSize,
                totalResults: counts.total,
                totalPageCount: Math.ceil(counts.total / pageSize),
            },
            counts,
            failureGroups: [...reasons]
                .map(([reason, count]) => ({
                    reason,
                    count,
                    ...getAiIdentityFailureGroupCopy(reason),
                }))
                .sort(
                    (a, b) =>
                        b.severity.localeCompare(a.severity) ||
                        b.count - a.count,
                ),
        };
    }
    async preview(aiIdentityAccountUuid: string): Promise<AiIdentity[]> {
        const base = () =>
            this.queryRows().where(
                'ai_identities.ai_identity_account_uuid',
                aiIdentityAccountUuid,
            );
        const [missingLogin, punctuation, longLogin, fallback] =
            await Promise.all([
                base()
                    .whereNull('ai_identities.snowflake_login')
                    .whereNull('ai_identities.twin_name_override')
                    .limit(1),
                base()
                    .whereNull('ai_identities.twin_name_override')
                    .whereRaw('ai_identities.snowflake_login ~ ?', ['[.-]'])
                    .limit(1),
                base()
                    .whereNull('ai_identities.twin_name_override')
                    .whereRaw('length(ai_identities.snowflake_login) > 255')
                    .limit(1),
                base().orderBy('ai_identities.created_at', 'desc').limit(3),
            ]);
        const unique = new Map<string, IdentityRow>();
        [...missingLogin, ...punctuation, ...longLogin, ...fallback].forEach(
            (row: IdentityRow) => unique.set(row.ai_identity_uuid, row),
        );
        return [...unique.values()]
            .slice(0, 3)
            .map((row) => this.toIdentity(row));
    }

    async idsForFilter(
        filter: AiIdentityFilter,
        afterUuid: string | null = null,
        limit = 20,
    ): Promise<string[]> {
        const query = this.filteredQuery(filter)
            .clearSelect()
            .select('ai_identities.ai_identity_uuid');
        if (afterUuid !== null)
            query.where('ai_identities.ai_identity_uuid', '>', afterUuid);
        const rows = (await query
            .orderBy('ai_identities.ai_identity_uuid')
            .limit(limit)) as { ai_identity_uuid: string }[];
        return rows.map((row) => row.ai_identity_uuid);
    }
    async find({
        aiIdentityAccountUuid,
        userUuid,
    }: {
        aiIdentityAccountUuid: string;
        userUuid: string;
    }): Promise<AiIdentity | null> {
        const row = await this.queryRows()
            .where(
                'ai_identities.ai_identity_account_uuid',
                aiIdentityAccountUuid,
            )
            .where('ai_identities.user_uuid', userUuid)
            .first<IdentityRow>();
        return row ? this.toIdentity(row) : null;
    }
    async findByUuid(aiIdentityUuid: string): Promise<AiIdentity | null> {
        const row = await this.queryRows()
            .where('ai_identities.ai_identity_uuid', aiIdentityUuid)
            .first<IdentityRow>();
        return row ? this.toIdentity(row) : null;
    }
    async findWithPrivateKey({
        aiIdentityAccountUuid,
        userUuid,
    }: {
        aiIdentityAccountUuid: string;
        userUuid: string;
    }): Promise<(AiIdentity & { privateKey: string | null }) | null> {
        const row = await this.queryRows(true)
            .where(
                'ai_identities.ai_identity_account_uuid',
                aiIdentityAccountUuid,
            )
            .where('ai_identities.user_uuid', userUuid)
            .first<IdentityRow>();
        return row
            ? {
                  ...this.toIdentity(row),
                  privateKey:
                      row.encrypted_private_key === null
                          ? null
                          : this.args.encryptionUtil.decrypt(
                                row.encrypted_private_key,
                            ),
              }
            : null;
    }
    async findByUuidWithPrivateKey(
        aiIdentityUuid: string,
    ): Promise<(AiIdentity & { privateKey: string | null }) | null> {
        const row = await this.queryRows(true)
            .where('ai_identities.ai_identity_uuid', aiIdentityUuid)
            .first<IdentityRow>();
        return row
            ? {
                  ...this.toIdentity(row),
                  privateKey:
                      row.encrypted_private_key === null
                          ? null
                          : this.args.encryptionUtil.decrypt(
                                row.encrypted_private_key,
                            ),
              }
            : null;
    }
    async upsertForUsers(
        aiIdentityAccountUuid: string,
        userUuids: string[],
    ): Promise<void> {
        if (userUuids.length === 0) return;
        await this.database(AiIdentitiesTableName)
            .insert(
                userUuids.map((userUuid) => ({
                    ai_identity_account_uuid: aiIdentityAccountUuid,
                    user_uuid: userUuid,
                })),
            )
            .onConflict(['ai_identity_account_uuid', 'user_uuid'])
            .ignore();
    }
    async getProjectMemberIds({
        projectUuid,
        organizationUuid,
    }: {
        projectUuid: string;
        organizationUuid: string;
    }): Promise<string[]> {
        const result: { rows: { user_uuid: string }[] } =
            await this.database.raw(usersInProjectSql(), {
                projectUuid,
                organizationUuid,
            });
        if (result.rows.length === 0) return [];
        const activeUsers = await this.database('users')
            .whereIn(
                'user_uuid',
                result.rows.map((row) => row.user_uuid),
            )
            .where('is_active', true)
            .select<{ user_uuid: string }[]>('user_uuid');
        return activeUsers.map((row) => row.user_uuid);
    }
    async setKeys(
        aiIdentityUuid: string,
        { publicKey, privateKey }: { publicKey: string; privateKey: string },
    ): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                public_key: publicKey,
                public_key_fingerprint: `SHA256:${createHash('sha256')
                    .update(Buffer.from(publicKey, 'base64'))
                    .digest('base64')}`,
                encrypted_private_key:
                    this.args.encryptionUtil.encrypt(privateKey),
                status: AiIdentityStatus.PENDING,
                failure_reason: null,
                status_message: null,
                checked_at: null,
                updated_at: new Date(),
            });
        const identity = await this.findByUuid(aiIdentityUuid);
        if (!identity) throw new Error('AI identity not found');
        return identity;
    }
    async setSnowflakeLogin(
        organizationUuid: string,
        userUuid: string,
        login: string,
    ): Promise<void> {
        const accountUuids = this.database('ai_identity_accounts')
            .where('organization_uuid', organizationUuid)
            .select('ai_identity_account_uuid');
        await this.database(AiIdentitiesTableName)
            .where('user_uuid', userUuid)
            .whereIn('ai_identity_account_uuid', accountUuids)
            .update({
                snowflake_login: login,
                status: AiIdentityStatus.PENDING,
                failure_reason: null,
                status_message: null,
                checked_at: null,
                updated_at: new Date(),
            });
    }
    async setTwinNameOverride(
        aiIdentityUuid: string,
        twinNameOverride: string | null,
    ): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                twin_name_override: twinNameOverride,
                status: AiIdentityStatus.PENDING,
                failure_reason: null,
                status_message: null,
                checked_at: null,
                updated_at: new Date(),
            });
        const identity = await this.findByUuid(aiIdentityUuid);
        if (!identity) throw new Error('AI identity not found');
        return identity;
    }
    async updateStatus(
        aiIdentityUuid: string,
        {
            status,
            failureReason,
            statusMessage,
        }: {
            status: AiIdentityStatus;
            failureReason: AiIdentityFailureReason | null;
            statusMessage: string | null;
        },
    ): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                status,
                failure_reason: failureReason,
                status_message: statusMessage,
                checked_at: new Date(),
                updated_at: new Date(),
            });
        const identity = await this.findByUuid(aiIdentityUuid);
        if (!identity) throw new Error('AI identity not found');
        return identity;
    }
    async deleteForUser(
        userUuid: string,
        database: Knex = this.database,
    ): Promise<number> {
        return database(AiIdentitiesTableName)
            .where('user_uuid', userUuid)
            .delete();
    }

    async getProvisioningMode(
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityCreationMode> {
        const row = await this.database('ai_identity_accounts')
            .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
            .first('creation_mode');
        if (!row) throw new Error('AI identity account not found');
        return row.creation_mode;
    }

    async withProvisioningLock<T>(
        aiIdentityAccountUuid: string,
        run: () => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (trx) => {
            await trx.raw(
                "SELECT pg_advisory_xact_lock(hashtext('ai_identity_provisioning'), hashtext(?))",
                [aiIdentityAccountUuid],
            );
            return run();
        });
    }

    async setProvisioningMode(
        aiIdentityAccountUuid: string,
        mode: AiIdentityCreationMode,
    ): Promise<void> {
        await this.database('ai_identity_accounts')
            .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
            .update({ creation_mode: mode, updated_at: new Date() });
    }

    async getProvisioner(aiIdentityAccountUuid: string): Promise<{
        aiIdentityAccountUuid: string;
        userName: string;
        roleName: string;
        publicKey: string;
        publicKeyFingerprint: string;
        privateKey: string;
        status: AiIdentityProvisionerStatus;
        statusMessage: string | null;
        checkedAt: Date | null;
        firstRunApprovedAt: Date | null;
        firstRunApprovedByName: string | null;
        findings: AiIdentityProvisionerFinding[];
        ungrantedSchemas: AiIdentityUngrantedSchemas[];
    } | null> {
        const row = await this.database(
            'ai_identity_provisioners as provisioner',
        )
            .leftJoin(
                'users as approver',
                'approver.user_uuid',
                'provisioner.first_run_approved_by_user_uuid',
            )
            .where(
                'provisioner.ai_identity_account_uuid',
                aiIdentityAccountUuid,
            )
            .select(
                'provisioner.*',
                'approver.first_name',
                'approver.last_name',
            )
            .first();
        if (!row) return null;
        return {
            aiIdentityAccountUuid: row.ai_identity_account_uuid,
            userName: row.user_name,
            roleName: row.role_name,
            publicKey: row.public_key,
            publicKeyFingerprint: row.public_key_fingerprint,
            privateKey: this.args.encryptionUtil.decrypt(
                row.encrypted_private_key,
            ),
            status: row.status,
            statusMessage: row.status_message,
            checkedAt: row.checked_at,
            firstRunApprovedAt: row.first_run_approved_at,
            firstRunApprovedByName: row.first_name
                ? `${row.first_name} ${row.last_name ?? ''}`.trim()
                : null,
            findings: row.findings ?? [],
            ungrantedSchemas: row.ungranted_schemas ?? [],
        };
    }

    async createProvisioner(
        aiIdentityAccountUuid: string,
        userName: string,
        roleName: string,
        keys: { publicKey: string; privateKey: string },
    ): Promise<void> {
        await this.database('ai_identity_provisioners')
            .insert({
                ai_identity_account_uuid: aiIdentityAccountUuid,
                user_name: userName,
                role_name: roleName,
                public_key: keys.publicKey,
                public_key_fingerprint: `SHA256:${createHash('sha256').update(Buffer.from(keys.publicKey, 'base64')).digest('base64')}`,
                encrypted_private_key: this.args.encryptionUtil.encrypt(
                    keys.privateKey,
                ),
            })
            .onConflict('ai_identity_account_uuid')
            .ignore();
    }

    async deleteProvisioner(aiIdentityAccountUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx('ai_identity_accounts')
                .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
                .update({ creation_mode: AiIdentityCreationMode.GUIDED });
            await trx('ai_identity_provisioners')
                .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
                .delete();
        });
    }

    async getCachedCatalogSchemas(
        projectUuid: string,
    ): Promise<{ schemas: string[]; loaded: boolean }> {
        const projectCredentialIds = this.database('warehouse_credentials')
            .join(
                'projects',
                'projects.project_id',
                'warehouse_credentials.project_id',
            )
            .where('projects.project_uuid', projectUuid)
            .select('warehouse_credentials.warehouse_credentials_id');
        const memberSnowflakeCredentialUuids = this.database(
            'user_warehouse_credentials',
        )
            .join(
                'users',
                'users.user_uuid',
                'user_warehouse_credentials.user_uuid',
            )
            .join(
                'organization_memberships',
                'organization_memberships.user_id',
                'users.user_id',
            )
            .join(
                'projects',
                'projects.organization_id',
                'organization_memberships.organization_id',
            )
            .where('projects.project_uuid', projectUuid)
            .where('user_warehouse_credentials.warehouse_type', 'snowflake')
            .select(
                'user_warehouse_credentials.user_warehouse_credentials_uuid',
            );
        const rows: { database: string; schema: string }[] =
            await this.database('warehouse_credentials_available_tables')
                .whereIn(
                    'project_warehouse_credentials_id',
                    projectCredentialIds,
                )
                .orWhereIn(
                    'user_warehouse_credentials_uuid',
                    memberSnowflakeCredentialUuids,
                )
                .distinct('database', 'schema');
        return {
            schemas: rows
                .filter(
                    (row) =>
                        SAFE_SNOWFLAKE_NAME.test(row.database) &&
                        SAFE_SNOWFLAKE_NAME.test(row.schema),
                )
                .map((row) => `${row.database}.${row.schema}`),
            loaded: rows.length > 0,
        };
    }

    async getAiRoles(
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityAiRoleDefinition[]> {
        const rows = await this.database<{
            ai_identity_account_uuid: string;
            ai_identity_ai_role_uuid: string;
            role_name: string;
            warehouse: string;
            schemas: string[];
            schema_rule: unknown;
        }>('ai_identity_ai_roles')
            .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
            .orderBy('role_name');
        return rows.map((row) => ({
            aiIdentityAiRoleUuid: row.ai_identity_ai_role_uuid,
            roleName: row.role_name,
            warehouse: row.warehouse,
            schemas: [],
            schemaRule: normalizeStoredSchemaRule(row.schema_rule, row.schemas),
        }));
    }

    async replaceAiRoles(
        aiIdentityAccountUuid: string,
        roles: Array<
            Pick<
                AiIdentityAiRoleDefinition,
                'roleName' | 'warehouse' | 'schemaRule'
            >
        >,
        actor: {
            organizationUuid: string;
            actorType: AiIdentityEventActorType;
            actorUserUuid: string | null;
        },
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx('ai_identity_accounts')
                .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
                .forUpdate()
                .first();
            const previous = await trx('ai_identity_ai_roles').where({
                ai_identity_account_uuid: aiIdentityAccountUuid,
            });
            const before = new Map(
                previous.map((row) => [
                    row.role_name.toUpperCase(),
                    normalizeStoredSchemaRule(row.schema_rule, row.schemas),
                ]),
            );
            const after = new Map(
                roles.map((role) => [
                    role.roleName.toUpperCase(),
                    role.schemaRule,
                ]),
            );
            const events = [
                ...new Set([...before.keys(), ...after.keys()]),
            ].flatMap((roleName) => {
                const oldRule = before.get(roleName);
                const newRule = after.get(roleName);
                const oldPatterns = new Set(
                    oldRule?.excludePatterns.map((pattern) =>
                        pattern.trim().toUpperCase(),
                    ) ?? [],
                );
                const newPatterns = new Set(
                    newRule?.excludePatterns.map((pattern) =>
                        pattern.trim().toUpperCase(),
                    ) ?? [],
                );
                const added = [...newPatterns]
                    .filter((pattern) => !oldPatterns.has(pattern))
                    .sort();
                const removed = [...oldPatterns]
                    .filter((pattern) => !newPatterns.has(pattern))
                    .sort();
                const databaseChanged =
                    oldRule &&
                    newRule &&
                    oldRule.database.toUpperCase() !==
                        newRule.database.toUpperCase();
                if (
                    oldRule &&
                    newRule &&
                    !databaseChanged &&
                    added.length === 0 &&
                    removed.length === 0
                )
                    return [];
                let action = 'ai_role_exclusions_changed';
                if (!oldRule) action = 'ai_role_created';
                else if (!newRule) action = 'ai_role_deleted';
                const database = databaseChanged
                    ? `${oldRule.database} to ${newRule.database}`
                    : (newRule ?? oldRule)!.database;
                return [
                    {
                        organization_uuid: actor.organizationUuid,
                        ai_identity_account_uuid: aiIdentityAccountUuid,
                        ai_identity_uuid: null,
                        actor_type: actor.actorType,
                        actor_user_uuid: actor.actorUserUuid,
                        action,
                        target_count: 1,
                        status: 'success',
                        detail: `${roleName} · Database: ${database} · Added: ${added.join(', ') || 'none'} · Removed: ${removed.join(', ') || 'none'}`,
                    },
                ];
            });
            await trx('ai_identity_ai_roles')
                .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
                .delete();
            if (roles.length > 0)
                await trx('ai_identity_ai_roles').insert(
                    roles.map((role) => ({
                        ai_identity_account_uuid: aiIdentityAccountUuid,
                        role_name: role.roleName,
                        warehouse: role.warehouse,
                        schemas: JSON.stringify([]),
                        schema_rule: JSON.stringify(role.schemaRule),
                    })),
                );
            if (events.length > 0)
                await trx('ai_identity_events').insert(events);
        });
    }

    async updateProvisioner(
        aiIdentityAccountUuid: string,
        update: {
            status?: AiIdentityProvisionerStatus;
            statusMessage?: string | null;
            findings?: AiIdentityProvisionerFinding[];
            ungrantedSchemas?: AiIdentityUngrantedSchemas[];
            approvedBy?: string;
        },
    ): Promise<void> {
        await this.database('ai_identity_provisioners')
            .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
            .update({
                ...(update.status === undefined
                    ? {}
                    : { status: update.status, checked_at: new Date() }),
                ...(update.statusMessage === undefined
                    ? {}
                    : { status_message: update.statusMessage }),
                ...(update.findings === undefined
                    ? {}
                    : { findings: JSON.stringify(update.findings) }),
                ...(update.ungrantedSchemas === undefined
                    ? {}
                    : {
                          ungranted_schemas: JSON.stringify(
                              update.ungrantedSchemas,
                          ),
                      }),
                ...(update.approvedBy === undefined
                    ? {}
                    : {
                          first_run_approved_at: new Date(),
                          first_run_approved_by_user_uuid: update.approvedBy,
                      }),
                updated_at: new Date(),
            });
    }

    async getRoleMappings(aiIdentityAccountUuid: string): Promise<
        Array<{
            aiIdentityRoleMappingUuid: string;
            groupUuid: string;
            groupName: string;
            aiRole: string;
            priority: number;
        }>
    > {
        const rows = await this.database('ai_identity_role_mappings as mapping')
            .join('groups', 'groups.group_uuid', 'mapping.group_uuid')
            .where('mapping.ai_identity_account_uuid', aiIdentityAccountUuid)
            .select('mapping.*', 'groups.name as group_name')
            .orderBy('mapping.priority');
        return rows.map((row) => ({
            aiIdentityRoleMappingUuid: row.ai_identity_role_mapping_uuid,
            groupUuid: row.group_uuid,
            groupName: row.group_name,
            aiRole: row.ai_role,
            priority: row.priority,
        }));
    }

    async replaceRoleMappings(
        aiIdentityAccountUuid: string,
        mappings: UpdateAiIdentityRoleMapping[],
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx('ai_identity_role_mappings')
                .where({ ai_identity_account_uuid: aiIdentityAccountUuid })
                .delete();
            if (mappings.length > 0)
                await trx('ai_identity_role_mappings').insert(
                    mappings.map((mapping) => ({
                        ai_identity_account_uuid: aiIdentityAccountUuid,
                        group_uuid: mapping.groupUuid,
                        ai_role: mapping.aiRole,
                        priority: mapping.priority,
                    })),
                );
        });
    }

    async getOrganizationGroupUuids(
        organizationUuid: string,
    ): Promise<Set<string>> {
        const rows = await this.database('groups')
            .join(
                'organizations',
                'organizations.organization_id',
                'groups.organization_id',
            )
            .where('organizations.organization_uuid', organizationUuid)
            .pluck('groups.group_uuid');
        return new Set(rows as string[]);
    }

    async getProvisioningIdentities(aiIdentityAccountUuid: string): Promise<
        Array<
            AiIdentity & {
                createdByProvisioner: boolean;
                provisionedRole: string | null;
                provisionedUserName: string | null;
                provisionedPublicKeyFingerprint: string | null;
                groupUuids: string[];
            }
        >
    > {
        const rows = await this.queryRows()
            .where(
                'ai_identities.ai_identity_account_uuid',
                aiIdentityAccountUuid,
            )
            .select(
                'ai_identities.created_by_provisioner',
                'ai_identities.provisioned_role',
                'ai_identities.provisioned_user_name',
                'ai_identities.provisioned_public_key_fingerprint',
            );
        const typedRows = rows as (IdentityRow & {
            created_by_provisioner: boolean;
            provisioned_role: string | null;
            provisioned_user_name: string | null;
            provisioned_public_key_fingerprint: string | null;
        })[];
        if (typedRows.length === 0) return [];
        const memberships = await this.database('group_memberships')
            .join('users', 'users.user_id', 'group_memberships.user_id')
            .whereIn(
                'users.user_uuid',
                typedRows.map((row) => row.user_uuid),
            )
            .select<{ user_uuid: string; group_uuid: string }[]>(
                'users.user_uuid',
                'group_memberships.group_uuid',
            );
        const groupsByUser = new Map<string, string[]>();
        memberships.forEach((membership) =>
            groupsByUser.set(membership.user_uuid, [
                ...(groupsByUser.get(membership.user_uuid) ?? []),
                membership.group_uuid,
            ]),
        );
        return typedRows.map((row) => ({
            ...this.toIdentity(row),
            createdByProvisioner: row.created_by_provisioner,
            provisionedRole: row.provisioned_role,
            provisionedUserName: row.provisioned_user_name,
            provisionedPublicKeyFingerprint:
                row.provisioned_public_key_fingerprint,
            groupUuids: groupsByUser.get(row.user_uuid) ?? [],
        }));
    }

    async markProvisioned(
        aiIdentityUuid: string,
        role: string | null,
        userName: string,
        fingerprint: string | null,
    ): Promise<void> {
        await this.database(AiIdentitiesTableName)
            .where({ ai_identity_uuid: aiIdentityUuid })
            .update({
                created_by_provisioner: true,
                provisioned_role: role,
                provisioned_user_name: userName,
                provisioned_public_key_fingerprint: fingerprint,
                updated_at: new Date(),
            });
    }

    async clearProvisioned(aiIdentityUuid: string): Promise<void> {
        await this.database(AiIdentitiesTableName)
            .where({ ai_identity_uuid: aiIdentityUuid })
            .update({
                created_by_provisioner: false,
                provisioned_role: null,
                provisioned_user_name: null,
                provisioned_public_key_fingerprint: null,
                updated_at: new Date(),
            });
    }

    async markProvisionedKey(
        aiIdentityUuid: string,
        fingerprint: string | null,
    ): Promise<void> {
        await this.database(AiIdentitiesTableName)
            .where({ ai_identity_uuid: aiIdentityUuid })
            .update({
                provisioned_public_key_fingerprint: fingerprint,
                updated_at: new Date(),
            });
    }

    async listProvisioningDrops(
        aiIdentityAccountUuid: string,
    ): Promise<Array<{ uuid: string; userName: string }>> {
        const rows = await this.database(
            'ai_identity_provisioning_drops',
        ).where({ ai_identity_account_uuid: aiIdentityAccountUuid });
        return rows.map((row) => ({
            uuid: row.ai_identity_provisioning_drop_uuid,
            userName: row.user_name,
        }));
    }

    async removeProvisioningDrop(uuid: string): Promise<void> {
        await this.database('ai_identity_provisioning_drops')
            .where({ ai_identity_provisioning_drop_uuid: uuid })
            .delete();
    }

    async findLatestSlackDmEvent({
        organizationUuid,
        userUuid,
        since,
    }: {
        organizationUuid: string;
        userUuid: string;
        since: Date;
    }): Promise<{ aiIdentityEventUuid: string; createdAt: Date } | null> {
        const row = await this.database('ai_identity_events')
            .where({
                organization_uuid: organizationUuid,
                actor_user_uuid: userUuid,
                action: 'slack_dm',
                status: 'success',
            })
            .where('created_at', '>', since)
            .orderBy('created_at', 'desc')
            .first<{ ai_identity_event_uuid: string; created_at: Date }>(
                'ai_identity_event_uuid',
                'created_at',
            );
        return row
            ? {
                  aiIdentityEventUuid: row.ai_identity_event_uuid,
                  createdAt: row.created_at,
              }
            : null;
    }

    async addEvent(event: {
        aiIdentityJobUuid?: string | null;
        organizationUuid: string;
        aiIdentityAccountUuid: string | null;
        aiIdentityUuid: string | null;
        actorType: AiIdentityEventActorType;
        actorUserUuid: string | null;
        action: string;
        targetCount: number;
        status: 'success' | 'error';
        detail: string | null;
    }): Promise<void> {
        await this.database('ai_identity_events').insert({
            organization_uuid: event.organizationUuid,
            ai_identity_account_uuid: event.aiIdentityAccountUuid,
            ai_identity_uuid: event.aiIdentityUuid,
            actor_type: event.actorType,
            actor_user_uuid: event.actorUserUuid,
            action: event.action,
            target_count: event.targetCount,
            status: event.status,
            detail: event.detail,
            ai_identity_job_uuid: event.aiIdentityJobUuid ?? null,
        });
    }
    async listEvents(
        organizationUuid: string,
        page: number,
        pageSize: number,
        aiIdentityUuid: string | null = null,
        includeReads = false,
        exclusionAccountUuid: string | null = null,
    ): Promise<{
        data: AiIdentityEvent[];
        pagination: {
            page: number;
            pageSize: number;
            totalResults: number;
            totalPageCount: number;
        };
    }> {
        const query = this.database('ai_identity_events').where(
            'ai_identity_events.organization_uuid',
            organizationUuid,
        );
        if (exclusionAccountUuid !== null) {
            query
                .where(
                    'ai_identity_events.ai_identity_account_uuid',
                    exclusionAccountUuid,
                )
                .whereIn('ai_identity_events.action', [
                    'ai_role_created',
                    'ai_role_deleted',
                    'ai_role_exclusions_changed',
                ]);
        }
        if (aiIdentityUuid !== null)
            query.where('ai_identity_events.ai_identity_uuid', aiIdentityUuid);
        else {
            query.whereNot('ai_identity_events.action', 'tested');
            query.where((builder) => {
                builder
                    .whereNot('ai_identity_events.actor_type', 'scheduler')
                    .orWhereNotExists(
                        this.database('ai_identity_events as request')
                            .select(this.database.raw('1'))
                            .whereRaw('?? = ??', [
                                'request.organization_uuid',
                                'ai_identity_events.organization_uuid',
                            ])
                            .whereRaw('?? = ??', [
                                'request.ai_identity_job_uuid',
                                'ai_identity_events.ai_identity_job_uuid',
                            ])
                            .whereIn('request.actor_type', ['user', 'api']),
                    );
            });
        }
        if (!includeReads) query.whereNot('ai_identity_events.action', 'list');
        const [{ count }] = await query
            .clone()
            .count<{ count: string }[]>('* as count');
        const rows = await query
            .joinRaw(`LEFT JOIN LATERAL (
                SELECT outcome.status, outcome.target_count, outcome.detail
                FROM ai_identity_events AS outcome
                WHERE outcome.organization_uuid = ai_identity_events.organization_uuid
                  AND outcome.ai_identity_job_uuid = ai_identity_events.ai_identity_job_uuid
                  AND outcome.actor_type = 'scheduler'
                  AND ai_identity_events.action = outcome.action
                ORDER BY outcome.created_at DESC, outcome.ai_identity_event_uuid DESC
                LIMIT 1
            ) AS outcome ON TRUE`)
            .leftJoin('ai_identity_jobs as job', function joinJob() {
                this.on(
                    'job.job_uuid',
                    'ai_identity_events.ai_identity_job_uuid',
                ).andOn(
                    'job.organization_uuid',
                    'ai_identity_events.organization_uuid',
                );
            })
            .leftJoin(
                'users',
                'users.user_uuid',
                'ai_identity_events.actor_user_uuid',
            )
            .select(
                'ai_identity_events.*',
                'users.first_name',
                'users.last_name',
                'outcome.status as outcome_status',
                'outcome.target_count as outcome_target_count',
                'outcome.detail as outcome_detail',
                'job.status as job_status',
            )
            .orderBy('ai_identity_events.created_at', 'desc')
            .orderBy('ai_identity_events.ai_identity_event_uuid', 'desc')
            .limit(pageSize)
            .offset((page - 1) * pageSize);
        const totalResults = Number(count);
        return {
            data: rows.map((row) => ({
                aiIdentityEventUuid: row.ai_identity_event_uuid,
                aiIdentityAccountUuid: row.ai_identity_account_uuid,
                aiIdentityUuid: row.ai_identity_uuid,
                actorType: row.actor_type,
                actorUserUuid: row.actor_user_uuid,
                actorName:
                    row.first_name === null
                        ? null
                        : `${row.first_name} ${row.last_name}`,
                action: row.action,
                targetCount: row.outcome_target_count ?? row.target_count,
                status: row.outcome_status ?? row.status,
                detail:
                    [
                        row.ai_identity_job_uuid
                            ? `Job ${row.ai_identity_job_uuid}${row.job_status ? ` (${row.job_status})` : ''}`
                            : null,
                        row.outcome_detail ?? row.detail,
                    ]
                        .filter(Boolean)
                        .join(' · ') || null,
                createdAt: row.created_at,
            })),
            pagination: {
                page,
                pageSize,
                totalResults,
                totalPageCount: Math.ceil(totalResults / pageSize),
            },
        };
    }
    async createJob({
        organizationUuid,
        aiIdentityAccountUuid,
        kind,
        filter,
        format,
        roleForTwin,
        createdByUserUuid,
    }: {
        organizationUuid: string;
        aiIdentityAccountUuid: string;
        kind: AiIdentityJobKind;
        filter: AiIdentityFilter;
        format: 'json' | 'sql' | 'csv' | null;
        roleForTwin: string | null;
        createdByUserUuid: string | null;
    }): Promise<AiIdentityJob> {
        const [row] = await this.database('ai_identity_jobs')
            .insert({
                organization_uuid: organizationUuid,
                ai_identity_account_uuid: aiIdentityAccountUuid,
                kind,
                filter,
                format,
                role_for_twin: roleForTwin,
                created_by_user_uuid: createdByUserUuid,
            })
            .returning('*');
        return this.toJob(row);
    }
    async getJob(jobUuid: string): Promise<
        | (AiIdentityJob & {
              organizationUuid: string;
              aiIdentityAccountUuid: string;
              filter: AiIdentityFilter;
              format: 'json' | 'sql' | 'csv' | null;
              roleForTwin: string | null;
              createdByUserUuid: string | null;
          })
        | null
    > {
        const row = await this.database('ai_identity_jobs')
            .where('job_uuid', jobUuid)
            .first();
        return row
            ? {
                  ...this.toJob(row),
                  organizationUuid: row.organization_uuid,
                  aiIdentityAccountUuid: row.ai_identity_account_uuid,
                  filter: row.filter,
                  format: row.format,
                  roleForTwin: row.role_for_twin,
                  createdByUserUuid: row.created_by_user_uuid,
              }
            : null;
    }
    async updateJob(
        jobUuid: string,
        update: {
            status?: AiIdentityJobStatus;
            total?: number;
            done?: number;
            fileUrl?: string;
            error?: string;
            skipped?: { email: string; reason: string }[];
        },
    ): Promise<void> {
        await this.database('ai_identity_jobs')
            .where('job_uuid', jobUuid)
            .update({
                ...(update.status === undefined
                    ? {}
                    : { status: update.status }),
                ...(update.total === undefined ? {} : { total: update.total }),
                ...(update.done === undefined ? {} : { done: update.done }),
                ...(update.fileUrl === undefined
                    ? {}
                    : { file_url: update.fileUrl }),
                ...(update.error === undefined ? {} : { error: update.error }),
                ...(update.skipped === undefined
                    ? {}
                    : { skipped: JSON.stringify(update.skipped) }),
                updated_at: new Date(),
            });
    }
    private toJob(row: {
        job_uuid: string;
        kind: AiIdentityJobKind;
        status: AiIdentityJobStatus;
        total: number;
        done: number;
        file_url: string | null;
        error: string | null;
        skipped: { email: string; reason: string }[] | null;
        created_at: Date;
    }): AiIdentityJob {
        return {
            jobUuid: row.job_uuid,
            kind: row.kind,
            status: row.status,
            total: row.total,
            done: row.done,
            fileUrl: row.file_url,
            error: row.error,
            skipped: row.skipped ?? [],
            createdAt: row.created_at,
        };
    }
}
