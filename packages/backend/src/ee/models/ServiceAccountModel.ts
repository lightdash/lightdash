import {
    AuthTokenPrefix,
    CreateServiceAccount,
    OrganizationMemberRole,
    ParameterError,
    ServiceAccount,
    ServiceAccountScope,
    ServiceAccountWithToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import { RolesTableName } from '../../database/entities/roles';
import { DbUser } from '../../database/entities/users';
import { deprecatedHash, hash } from '../../utils/hash';
import {
    DbServiceAccounts,
    ServiceAccountsTableName,
} from '../database/entities/serviceAccounts';

type DbServiceAccountWithRole = DbServiceAccounts & {
    role_uuid: string | null;
    // Joined from `users` via `created_by_user_uuid`. All three are null
    // when the FK is itself null OR when the creator's row has been
    // deleted (the FK is `ON DELETE SET NULL`).
    creator_user_uuid: string | null;
    creator_first_name: string | null;
    creator_last_name: string | null;
};

export class ServiceAccountModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static mapDbObjectToServiceAccount(
        data: DbServiceAccountWithRole,
    ): ServiceAccount {
        if (!data.service_account_user_uuid) {
            // Backfill migration populates this for every existing row, and
            // `ServiceAccountModel.save` always sets it for new rows. A null
            // here means the row predates the backfill and should never reach
            // runtime — fail loudly rather than silently fall back to an
            // admin spoof.
            throw new UnexpectedDatabaseError(
                `Service account ${data.service_account_uuid} is missing service_account_user_uuid`,
            );
        }
        return {
            uuid: data.service_account_uuid,
            organizationUuid: data.organization_uuid,
            createdAt: data.created_at,
            expiresAt: data.expires_at,
            description: data.description,
            lastUsedAt: data.last_used_at,
            rotatedAt: data.rotated_at,
            createdByUserUuid: data.created_by_user_uuid,
            createdBy: data.creator_user_uuid
                ? {
                      userUuid: data.creator_user_uuid,
                      firstName: data.creator_first_name ?? '',
                      lastName: data.creator_last_name ?? '',
                  }
                : null,
            scopes: data.scopes as ServiceAccountScope[],
            userUuid: data.service_account_user_uuid,
            roleUuid: data.role_uuid ?? null,
        };
    }

    /**
     * Returns the SELECT shape used by all read paths. Joins
     * `organization_memberships` to surface the SA's optional org-level
     * custom role assignment, and joins `users` a second time on
     * `created_by_user_uuid` so the listing UI can render "Created by …"
     * without a follow-up lookup.
     */
    private serviceAccountSelectQuery() {
        return this.database(ServiceAccountsTableName)
            .leftJoin(
                'users',
                'users.user_uuid',
                `${ServiceAccountsTableName}.service_account_user_uuid`,
            )
            .leftJoin(
                OrganizationMembershipsTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                'users.user_id',
            )
            .leftJoin(
                { creator: 'users' },
                'creator.user_uuid',
                `${ServiceAccountsTableName}.created_by_user_uuid`,
            )
            .select<DbServiceAccountWithRole[]>(
                `${ServiceAccountsTableName}.*`,
                `${OrganizationMembershipsTableName}.role_uuid`,
                { creator_user_uuid: 'creator.user_uuid' },
                { creator_first_name: 'creator.first_name' },
                { creator_last_name: 'creator.last_name' },
            );
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
    // middleware path in `UserModel.generateUserAbilityBuilder`.
    //
    // The semantic mapping (`org:edit -> editor`, `org:read -> viewer`)
    // reads better in admin UIs than collapsing everything to `member`,
    // and gives a safer-degradation outcome if v2 ever makes the role
    // load-bearing prematurely: "I can't do X" beats "I can't do
    // anything". `scim:manage` is mapped to `member` (explicit exception)
    // since SCIM stays on the scope-derived runtime path even at v2.
    //
    // Must stay in lockstep with `roleForScopes` in the backfill migration.
    static getRoleForScopes(
        scopes: ServiceAccountScope[],
    ): OrganizationMemberRole {
        // Prefer explicit `system:*` scopes — they map 1:1 to the org role
        // tier and let admin-UI listings show "Admin/Developer/..." rather
        // than collapsing everything onto the legacy three-bucket scheme.
        if (scopes.includes(ServiceAccountScope.SYSTEM_ADMIN)) {
            return OrganizationMemberRole.ADMIN;
        }
        if (scopes.includes(ServiceAccountScope.SYSTEM_DEVELOPER)) {
            return OrganizationMemberRole.DEVELOPER;
        }
        if (scopes.includes(ServiceAccountScope.SYSTEM_EDITOR)) {
            return OrganizationMemberRole.EDITOR;
        }
        if (scopes.includes(ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER)) {
            return OrganizationMemberRole.INTERACTIVE_VIEWER;
        }
        if (scopes.includes(ServiceAccountScope.SYSTEM_VIEWER)) {
            return OrganizationMemberRole.VIEWER;
        }
        // Legacy coarse scopes
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
        // Permission shape: exactly one of `scopes` (legacy preset) or
        // `roleUuid` (custom org role) must drive runtime CASL. Sending both
        // is rejected so we always have one source of truth.
        const hasScopes = !!data.scopes && data.scopes.length > 0;
        const hasRoleUuid = !!data.roleUuid;
        if (hasScopes && hasRoleUuid) {
            throw new ParameterError(
                'Specify either scopes or roleUuid, not both',
            );
        }
        if (!hasScopes && !hasRoleUuid) {
            throw new ParameterError(
                'A service account must have either scopes or a roleUuid',
            );
        }

        const tokenHash = await hash(token);
        const scopes = data.scopes ?? [];
        // Ornamental org-membership role: only consulted by admin-UI listings.
        // For custom-role-driven SAs, default to MEMBER (least privilege at
        // the FK level); for legacy-scope SAs, derive from the broadest scope.
        const role = hasRoleUuid
            ? OrganizationMemberRole.MEMBER
            : ServiceAccountModel.getRoleForScopes(scopes);

        return this.database.transaction(async (trx) => {
            // If a custom role was provided, validate it belongs to the SA's
            // organization (defence against cross-org role assignment).
            if (data.roleUuid) {
                const [roleRow] = await trx(RolesTableName)
                    .where('role_uuid', data.roleUuid)
                    .andWhere('organization_uuid', data.organizationUuid)
                    .select('role_uuid');
                if (!roleRow) {
                    throw new ParameterError(
                        `Role ${data.roleUuid} not found in this organization`,
                    );
                }
            }

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

            await trx(OrganizationMembershipsTableName).insert({
                user_id: saUser.user_id,
                organization_id: org.organization_id,
                role,
                role_uuid: data.roleUuid ?? null,
            });

            const [row] = await trx(ServiceAccountsTableName)
                .insert({
                    created_by_user_uuid: user?.userUuid || null,
                    organization_uuid: data.organizationUuid,
                    expires_at: data.expiresAt,
                    description: data.description,
                    token_hash: tokenHash,
                    scopes,
                    service_account_user_uuid: saUser.user_uuid,
                })
                .returning('*');
            if (row === undefined) {
                throw new UnexpectedDatabaseError(
                    'Could not create service account token',
                );
            }
            // Hydrate the creator triple from the calling user — the
            // INSERT…RETURNING above doesn't carry it (no JOIN on the
            // write path). For SAs minted without a SessionUser (e.g.
            // first-run setup token), all three fields stay null.
            return {
                ...ServiceAccountModel.mapDbObjectToServiceAccount({
                    ...row,
                    role_uuid: data.roleUuid ?? null,
                    creator_user_uuid: user?.userUuid ?? null,
                    creator_first_name: user?.firstName ?? null,
                    creator_last_name: user?.lastName ?? null,
                }),
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

        await this.database(ServiceAccountsTableName)
            .update({
                rotated_at: new Date(),
                rotated_by_user_uuid: rotatedByUserUuid,
                expires_at: expiresAt,
                token_hash: tokenHash,
            })
            .where('service_account_uuid', serviceAccountUuid);
        const [row] = await this.serviceAccountSelectQuery().where(
            `${ServiceAccountsTableName}.service_account_uuid`,
            serviceAccountUuid,
        );
        return {
            ...ServiceAccountModel.mapDbObjectToServiceAccount(row),
            token,
        };
    }

    async getAllForOrganization(
        organizationUuid: string,
        scopes?: ServiceAccountScope[],
    ): Promise<ServiceAccount[]> {
        const query = this.serviceAccountSelectQuery().where(
            `${ServiceAccountsTableName}.organization_uuid`,
            organizationUuid,
        );
        if (scopes) {
            // scopes <@ ? returns true only if the database's scopes array is a full subset of elements from the provided scopes array
            void query.whereRaw(`${ServiceAccountsTableName}.scopes <@ ?`, [
                scopes,
            ]);
        }
        const rows = await query;
        return rows.map(ServiceAccountModel.mapDbObjectToServiceAccount);
    }

    async getTokenbyUuid(
        serviceAccountUuid: string,
    ): Promise<ServiceAccount | undefined> {
        const [row] = await this.serviceAccountSelectQuery().where(
            `${ServiceAccountsTableName}.service_account_uuid`,
            serviceAccountUuid,
        );
        return row && ServiceAccountModel.mapDbObjectToServiceAccount(row);
    }

    async getByToken(token: string): Promise<ServiceAccount> {
        const hashedToken = await hash(token);
        const [row] = await this.serviceAccountSelectQuery()
            .where(`${ServiceAccountsTableName}.token_hash`, hashedToken)
            .orWhere(
                `${ServiceAccountsTableName}.token_hash`,
                deprecatedHash(token),
            ); // Adding old sha256 hash for backwards compatibility
        const mappedRow = ServiceAccountModel.mapDbObjectToServiceAccount(row);
        return mappedRow;
    }
}
