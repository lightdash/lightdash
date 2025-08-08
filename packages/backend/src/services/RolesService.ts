import { subject } from '@casl/ability';
import {
    Account,
    AddScopeToRole,
    AlreadyExistsError,
    assertIsAccountWithOrg,
    CreateRole,
    ForbiddenError,
    NotFoundError,
    RemoveScopesFromRole,
    Role,
    RoleWithScopes,
    Scope,
    UpdateRole,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { RolesModel } from '../models/RolesModel';
import { ScopedRolesModel } from '../models/ScopedRolesModel';
import { ScopesModel } from '../models/ScopesModel';
import { BaseService } from './BaseService';

type RolesServiceArguments = {
    analytics: LightdashAnalytics;
    rolesModel: RolesModel;
    scopesModel: ScopesModel;
    scopedRolesModel: ScopedRolesModel;
};

export class RolesService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly rolesModel: RolesModel;

    private readonly scopesModel: ScopesModel;

    private readonly scopedRolesModel: ScopedRolesModel;

    constructor(args: RolesServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.rolesModel = args.rolesModel;
        this.scopesModel = args.scopesModel;
        this.scopedRolesModel = args.scopedRolesModel;
    }

    async listRolesByOrganization(
        account: Account,
        organizationUuid: string,
    ): Promise<Role[]> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles in this organization',
            );
        }

        return this.rolesModel.listByOrg(organizationUuid);
    }

    async getRoleWithScopes(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
    ): Promise<RoleWithScopes> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'view',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles in this organization',
            );
        }

        const role = await this.scopedRolesModel.getScopedRole(roleUuid);
        if (!role) {
            throw new NotFoundError(`Role not found`);
        }

        if (role.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Role not found`);
        }

        return role;
    }

    async createRole(
        account: Account,
        organizationUuid: string,
        createRole: CreateRole,
    ): Promise<Role> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles in this organization',
            );
        }

        const existingRole = await this.rolesModel.findRoleByNameAndOrg(
            createRole.name,
            organizationUuid,
        );

        if (existingRole) {
            throw new AlreadyExistsError(
                `Role with name "${createRole.name}" already exists`,
            );
        }

        const role = await this.rolesModel.create({
            name: createRole.name,
            description: createRole.description || null,
            organization_uuid: organizationUuid,
            created_by: account.user.id,
        });

        this.analytics.track({
            userId: account.user.id,
            event: 'role.created',
            properties: {
                organizationId: organizationUuid,
                roleId: role.roleUuid,
                roleName: role.name,
            },
        });

        return role;
    }

    async updateRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        updateRole: UpdateRole,
    ): Promise<Role> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles in this organization',
            );
        }

        const existingRole = await this.rolesModel.getByUuid(roleUuid);
        if (existingRole.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Role not found`);
        }

        // If name is being updated, check for duplicates
        if (updateRole.name && updateRole.name !== existingRole.name) {
            const duplicateRole = await this.rolesModel.findRoleByNameAndOrg(
                updateRole.name,
                organizationUuid,
            );

            if (duplicateRole) {
                throw new AlreadyExistsError(
                    `Role with name "${updateRole.name}" already exists`,
                );
            }
        }

        const role = await this.rolesModel.update(roleUuid, {
            name: updateRole.name,
            description: updateRole.description,
        });

        this.analytics.track({
            userId: account.user.id,
            event: 'role.updated',
            properties: {
                organizationId: organizationUuid,
                roleId: role.roleUuid,
                roleName: role.name,
            },
        });

        return role;
    }

    async deleteRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
    ): Promise<void> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles in this organization',
            );
        }

        const existingRole = await this.rolesModel.getByUuid(roleUuid);
        if (existingRole.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Role not found`);
        }

        await this.scopedRolesModel.removeAllScopesFromRole(roleUuid);
        await this.rolesModel.delete(roleUuid);

        this.analytics.track({
            userId: account.user.id,
            event: 'role.deleted',
            properties: {
                organizationId: organizationUuid,
                roleId: roleUuid,
                roleName: existingRole.name,
            },
        });
    }

    private async assertValidScopesToAdd(
        roleUuid: string,
        scopeUuids: string[],
    ): Promise<Scope[]> {
        const scopes = await this.scopesModel.list(scopeUuids);
        if (scopes.length !== scopeUuids.length) {
            const foundScopeUuids = scopes.map((s) => s.scopeUuid);
            const missingScopeUuids = scopeUuids.filter(
                (uuid) => !foundScopeUuids.includes(uuid),
            );
            throw new NotFoundError(
                `Scopes not found: ${missingScopeUuids.join(', ')}`,
            );
        }

        // Check for existing relationships to detect duplicates
        const existing = await this.scopedRolesModel.getScopedRole(roleUuid);
        const existingScopeUuids = existing.scopes.map((s) => s.scopeUuid);
        const duplicateScopeUuids = scopeUuids.filter((uuid) =>
            existingScopeUuids.includes(uuid),
        );

        if (duplicateScopeUuids.length > 0) {
            throw new AlreadyExistsError(
                `Scopes already assigned to role: ${duplicateScopeUuids.join(
                    ', ',
                )}`,
            );
        }

        return scopes;
    }

    async addScopesToRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        addScope: AddScopeToRole,
    ): Promise<Scope[]> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles',
            );
        }

        const existingRole = await this.rolesModel.getByUuid(roleUuid);
        if (existingRole.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Role not found`);
        }

        const scopes = await this.assertValidScopesToAdd(
            roleUuid,
            addScope.scopeUuids,
        );

        // Add scopes to role using batch insert
        await this.scopedRolesModel.addScopesToRole(
            roleUuid,
            addScope.scopeUuids,
            account.user.id,
        );

        this.analytics.track({
            userId: account.user.id,
            event: 'role.scopes_added',
            properties: {
                organizationId: organizationUuid,
                roleId: roleUuid,
                scopesNames: scopes.map((s) => s.name),
            },
        });

        return scopes;
    }

    async removeScopesFromRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        removeScopes: RemoveScopesFromRole,
    ): Promise<void> {
        assertIsAccountWithOrg(account);

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage roles in this organization',
            );
        }

        const existingRole = await this.rolesModel.getByUuid(roleUuid);
        if (existingRole.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Role not found`);
        }

        const scopes = await this.scopesModel.list(removeScopes.scopeUuids);
        await this.scopedRolesModel.removeScopesFromRole(
            roleUuid,
            removeScopes.scopeUuids,
        );

        this.analytics.track({
            userId: account.user.id,
            event: 'role.scopes_removed',
            properties: {
                organizationId: organizationUuid,
                roleId: roleUuid,
                scopesNames: scopes.map((s) => s.name),
            },
        });
    }

    async getAllScopes(account: Account): Promise<Scope[]> {
        assertIsAccountWithOrg(account);

        return this.scopesModel.list();
    }
}
