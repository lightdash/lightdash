import {
    AuthTokenPrefix,
    CreateServiceAccount,
    OrganizationMemberRole,
    ServiceAccount,
    ServiceAccountScope,
    ServiceAccountWithToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { DbUser } from '../../database/entities/users';
import { deprecatedHash, hash } from '../../utils/hash';
import {
    DbServiceAccounts,
    ServiceAccountsTableName,
} from '../database/entities/serviceAccounts';

export class ServiceAccountModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static mapDbObjectToServiceAccount(
        data: DbServiceAccounts,
    ): ServiceAccount {
        return {
            uuid: data.service_account_uuid,
            organizationUuid: data.organization_uuid,
            createdAt: data.created_at,
            expiresAt: data.expires_at,
            description: data.description,
            lastUsedAt: data.last_used_at,
            rotatedAt: data.rotated_at,
            createdByUserUuid: data.created_by_user_uuid,
            scopes: data.scopes as ServiceAccountScope[],
        };
    }

    static generateToken(prefix: string = ''): string {
        return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
    }

    async create({
        user,
        data,
        prefix = AuthTokenPrefix.SCIM,
    }: {
        user: SessionUser;
        data: CreateServiceAccount;
        prefix?: string;
    }): Promise<ServiceAccountWithToken> {
        const token = ServiceAccountModel.generateToken(prefix);
        return this.save(user, data, token);
    }

    // Maps the SA's scopes to an org-membership role for the DB row on
    // `organization_memberships`. The role is ornamental at v1 — runtime
    // CASL still comes from `applyServiceAccountAbilities` via the SA auth
    // middleware.
    //
    // The semantic mapping (`org:edit -> editor`, `org:read -> viewer`)
    // reads better in admin UIs than collapsing everything to `member`,
    // and gives a safer-degradation outcome if v2 ever makes the role
    // load-bearing prematurely: "I can't do X" beats "I can't do
    // anything". `scim:manage` is mapped to `member` (explicit exception)
    // since SCIM stays on the scope-derived runtime path even at v2.
    //
    // Must stay in lockstep with `roleForScopes` in the backfill migration.
    // The middleware's `getRoleForScopes` intentionally diverges (it
    // computes the role for the spoofed admin SessionUser at runtime,
    // which stays unchanged in v1).
    static getRoleForScopes(
        scopes: ServiceAccountScope[],
    ): OrganizationMemberRole {
        if (scopes.includes(ServiceAccountScope.ORG_ADMIN)) {
            return OrganizationMemberRole.ADMIN;
        }
        if (scopes.includes(ServiceAccountScope.ORG_EDIT)) {
            return OrganizationMemberRole.EDITOR;
        }
        if (scopes.includes(ServiceAccountScope.ORG_READ)) {
            return OrganizationMemberRole.VIEWER;
        }
        return OrganizationMemberRole.MEMBER;
    }

    async save(
        user: SessionUser | undefined,
        data: CreateServiceAccount,
        token: string,
    ): Promise<ServiceAccountWithToken> {
        const tokenHash = await hash(token);
        const role = ServiceAccountModel.getRoleForScopes(data.scopes);

        return this.database.transaction(async (trx) => {
            // Dedicated user row for this service account. Marked
            // `is_internal = true` so listings/login/SCIM filter it out;
            // `is_active = false` defends-in-depth against any login path.
            //
            // The SA's description is used as the user's first_name so that
            // attribution surfaces ("Created by …") render as a single
            // human-readable string rather than the literal phrase
            // "Service account <description>". UI badge / robot-icon is
            // intended to differentiate the principal type visually; that's
            // a v2 polish item.
            // `last_name` must be NOT NULL, so an empty string is used.
            const [saUser] = await trx<DbUser>('users')
                .insert({
                    first_name: data.description,
                    last_name: '',
                    is_marketing_opted_in: false,
                    is_tracking_anonymized: false,
                    is_setup_complete: true,
                    is_active: false,
                    is_internal: true,
                })
                .returning('*');

            // organization_memberships keys on the integer organization_id, so
            // we need to look it up from the SA's organization_uuid.
            const [org] = await trx('organizations')
                .where('organization_uuid', data.organizationUuid)
                .select('organization_id');
            if (!org) {
                throw new UnexpectedDatabaseError(
                    `Organization ${data.organizationUuid} not found`,
                );
            }

            await trx('organization_memberships').insert({
                user_id: saUser.user_id,
                organization_id: org.organization_id,
                role,
            });

            const [row] = await trx(ServiceAccountsTableName)
                .insert({
                    created_by_user_uuid: user?.userUuid || null,
                    organization_uuid: data.organizationUuid,
                    expires_at: data.expiresAt,
                    description: data.description,
                    token_hash: tokenHash,
                    scopes: data.scopes,
                    service_account_user_uuid: saUser.user_uuid,
                })
                .returning('*');
            if (row === undefined) {
                throw new UnexpectedDatabaseError(
                    'Could not create service account token',
                );
            }
            return {
                ...ServiceAccountModel.mapDbObjectToServiceAccount(row),
                token,
            };
        });
    }

    // Tombstone semantics: delete the service-account row only. The dedicated
    // user record persists so historical FK references (`created_by_user_uuid`
    // on charts/dashboards/schedulers/audit log etc.) keep JOINing and the UI
    // continues to show "Service account: <description>" for past content.
    // Cascade in the other direction (deleting the user row → drops the SA)
    // is enforced at the FK level for orphan prevention.
    async delete(serviceAccountUuid: string): Promise<void> {
        await this.database(ServiceAccountsTableName)
            .delete()
            .where('service_account_uuid', serviceAccountUuid);
    }

    async updateUsedDate(serviceAccountUuid: string): Promise<void> {
        await this.database(ServiceAccountsTableName)
            .update({
                last_used_at: new Date(),
            })
            .where('service_account_uuid', serviceAccountUuid);
    }

    async rotate({
        serviceAccountUuid,
        rotatedByUserUuid,
        expiresAt,
        prefix = AuthTokenPrefix.SCIM,
    }: {
        serviceAccountUuid: string;
        rotatedByUserUuid: string;
        expiresAt: Date;
        prefix?: string;
    }): Promise<ServiceAccountWithToken> {
        const token = ServiceAccountModel.generateToken(prefix);
        const tokenHash = await hash(token);

        const [row] = await this.database(ServiceAccountsTableName)
            .update({
                rotated_at: new Date(),
                rotated_by_user_uuid: rotatedByUserUuid,
                expires_at: expiresAt,
                token_hash: tokenHash,
            })
            .where('service_account_uuid', serviceAccountUuid)
            .returning('*');
        return {
            ...ServiceAccountModel.mapDbObjectToServiceAccount(row),
            token,
        };
    }

    async getAllForOrganization(
        organizationUuid: string,
        scopes?: ServiceAccountScope[],
    ): Promise<ServiceAccount[]> {
        const query = this.database('service_accounts')
            .select('*')
            .where('organization_uuid', organizationUuid);
        if (scopes) {
            // scopes <@ ? returns true only if the database's scopes array is a full subset of elements from the provided scopes array
            void query.whereRaw('scopes <@ ?', [scopes]);
        }
        const rows = await query;
        return rows.map(ServiceAccountModel.mapDbObjectToServiceAccount);
    }

    async getTokenbyUuid(
        serviceAccountUuid: string,
    ): Promise<ServiceAccount | undefined> {
        const [row] = await this.database('service_accounts')
            .select('*')
            .where('service_account_uuid', serviceAccountUuid);
        return row && ServiceAccountModel.mapDbObjectToServiceAccount(row);
    }

    async getByToken(token: string): Promise<ServiceAccount> {
        const hashedToken = await hash(token);
        const [row] = await this.database('service_accounts')
            .select('*')
            .where('token_hash', hashedToken)
            .orWhere('token_hash', deprecatedHash(token)); // Adding old sha256 hash for backwards compatibility
        const mappedRow = ServiceAccountModel.mapDbObjectToServiceAccount(row);
        return mappedRow;
    }
}
