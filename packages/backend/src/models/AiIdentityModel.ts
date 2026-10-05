import {
    AI_IDENTITY_STALE_PENDING_DAYS,
    AiIdentity,
    AiIdentityAccount,
    AiIdentityEvent,
    AiIdentityEventActorType,
    AiIdentityFailureReason,
    AiIdentityFilter,
    AiIdentityJob,
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityListResult,
    AiIdentitySort,
    AiIdentityState,
    AiIdentityStateCounts,
    AiIdentityStatus,
    DEFAULT_AI_TWIN_NAME_TEMPLATE,
    getAiIdentityFailureGroupCopy,
    resolveAiTwinName,
} from '@lightdash/common';
import { Knex } from 'knex';
import { createHash } from 'node:crypto';
import {
    AiIdentitiesTableName,
    DbAiIdentity,
} from '../database/entities/aiIdentities';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { usersInProjectSql } from './AnalyticsModelSql';

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
    last_full_check_at: Date | null;
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

    private toAccount(
        row: AccountRow,
        counts: AiIdentityStateCounts,
    ): AiIdentityAccount {
        return {
            aiIdentityAccountUuid: row.ai_identity_account_uuid,
            snowflakeAccount: row.snowflake_account,
            twinNameTemplate: row.twin_name_template,
            lastFullCheckAt: row.last_full_check_at,
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
                  ...this.toAccount(
                      row,
                      await this.counts(aiIdentityAccountUuid),
                  ),
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
                ...this.toAccount(
                    row,
                    await this.counts(row.ai_identity_account_uuid),
                ),
                organizationUuid: row.organization_uuid,
            })),
        );
    }
    async updateAccountTemplate(
        aiIdentityAccountUuid: string,
        twinNameTemplate: string | null,
    ): Promise<AiIdentityAccount> {
        await this.database.transaction(async (trx) => {
            await trx('ai_identity_accounts')
                .where('ai_identity_account_uuid', aiIdentityAccountUuid)
                .update({
                    twin_name_template: twinNameTemplate,
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
            failureReason: row.failure_reason,
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
        if (filter.states.length)
            query.whereRaw(
                `${stateSql} IN (${filter.states.map(() => '?').join(', ')})`,
                filter.states,
            );
        if (filter.reasons.length)
            query.whereIn('ai_identities.failure_reason', filter.reasons);
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
            )
                reasons.set(
                    row.failure_reason,
                    (reasons.get(row.failure_reason) ?? 0) + count,
                );
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
        });
    }
    async listEvents(
        organizationUuid: string,
        page: number,
        pageSize: number,
        aiIdentityUuid: string | null = null,
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
        if (aiIdentityUuid !== null)
            query.where('ai_identity_events.ai_identity_uuid', aiIdentityUuid);
        const [{ count }] = await query
            .clone()
            .count<{ count: string }[]>('* as count');
        const rows = await query
            .leftJoin(
                'users',
                'users.user_uuid',
                'ai_identity_events.actor_user_uuid',
            )
            .select(
                'ai_identity_events.*',
                'users.first_name',
                'users.last_name',
            )
            .orderBy('ai_identity_events.created_at', 'desc')
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
                targetCount: row.target_count,
                status: row.status,
                detail: row.detail,
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
            createdAt: row.created_at,
        };
    }
}
