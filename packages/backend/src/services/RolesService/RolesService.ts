import { Ability, subject } from '@casl/ability';
import {
    Account,
    AddScopesToRole,
    ApiCustomRoleAsCodeUpsertResponse,
    ApiUserAsCodeUpsertResponse,
    assertRegisteredAccount,
    CreateRole,
    CustomRoleAsCode,
    ForbiddenError,
    getAllScopeMap,
    InviteLinkPurpose,
    isOrganizationMemberRole,
    isScopeAssignableAtLevel,
    isSystemRole,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    PromotionAction,
    Role,
    RoleAssignee,
    RoleAssignment,
    RoleLevel,
    RoleWithScopes,
    UpdateRole,
    UpdateRoleAssignmentRequest,
    UpsertUserRoleAssignmentRequest,
    UserAsCode,
    UserAsCodeInvitationStatus,
    UserAsCodeLifecycleStatus,
    UserAsCodeRole,
    validateEmail,
} from '@lightdash/common';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import { DatabaseError } from 'pg';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { GroupsModel } from '../../models/GroupsModel';
import { InviteLinkModel } from '../../models/InviteLinkModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import { wrapSentryTransaction } from '../../utils';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import { BaseService } from '../BaseService';

type RolesServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    rolesModel: RolesModel;
    userModel: UserModel;
    organizationModel: OrganizationModel;
    groupsModel: GroupsModel;
    projectModel: ProjectModel;
    emailClient: EmailClient;
    adminNotificationService: AdminNotificationService;
    inviteLinkModel: InviteLinkModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
};

export class RolesService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly rolesModel: RolesModel;

    private readonly userModel: UserModel;

    private readonly organizationModel: OrganizationModel;

    private readonly groupsModel: GroupsModel;

    private readonly projectModel: ProjectModel;

    private readonly emailClient: EmailClient;

    private readonly adminNotificationService: AdminNotificationService;

    private readonly inviteLinkModel: InviteLinkModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    constructor({
        lightdashConfig,
        analytics,
        rolesModel,
        userModel,
        organizationModel,
        groupsModel,
        projectModel,
        emailClient,
        adminNotificationService,
        inviteLinkModel,
        organizationMemberProfileModel,
    }: RolesServiceArguments) {
        super({ serviceName: 'RolesService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.rolesModel = rolesModel;
        this.userModel = userModel;
        this.organizationModel = organizationModel;
        this.groupsModel = groupsModel;
        this.projectModel = projectModel;
        this.emailClient = emailClient;
        this.adminNotificationService = adminNotificationService;
        this.inviteLinkModel = inviteLinkModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
    }

    /**
     * Validate that org admins or project developers/admins have access to view roles in the organization
     * @param account
     * @param organizationUuid
     * @private
     */
    private async validateRolesViewAccess(
        account: Account,
        organizationUuid: string,
    ) {
        const auditedAbility = this.createAuditedAbility(account);
        // if user is admin of organization, they can see roles
        if (
            auditedAbility.can(
                'manage',
                subject('Organization', {
                    organizationUuid,
                }),
            )
        ) {
            return;
        }

        // get all projects in organization
        const projects = await wrapSentryTransaction(
            'RolesService.validateRolesViewAccess.getAllByOrganizationUuid',
            { organizationUuid },
            async () =>
                this.projectModel.getAllByOrganizationUuid(organizationUuid),
        );

        const canManageSomeProjects = projects.some((project) =>
            auditedAbility.can(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid: project.projectUuid,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.name,
                    },
                }),
            ),
        );

        if (!canManageSomeProjects) {
            throw new ForbiddenError();
        }
    }

    private static validateOrganizationAccess(
        account: Account,
        auditedAbility: CaslAuditWrapper<Ability>,
        organizationUuid?: string,
    ): void {
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        if (account.organization?.organizationUuid !== organizationUuid) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this organization',
            );
        }
    }

    private static validateRoleOwnership(
        account: Account,
        auditedAbility: CaslAuditWrapper<Ability>,
        role: Role,
    ): void {
        if (isSystemRole(role.roleUuid) && role.ownerType === 'system') {
            return;
        }

        if (account.organization?.organizationUuid !== role.organizationUuid) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: role.organizationUuid,
                    metadata: {
                        roleUuid: role.roleUuid,
                        roleName: role.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async validateProjectAccess(
        account: Account,
        projectUuid?: string,
    ) {
        if (projectUuid) {
            const project = await this.projectModel.getSummary(projectUuid);
            const auditedAbility = this.createAuditedAbility(account);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('Project', {
                        organizationUuid: project.organizationUuid,
                        projectUuid,
                        metadata: {
                            projectUuid,
                            projectName: project.name,
                        },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    'You do not have permission to manage this project',
                );
            }
        }
    }

    private static validateRoleName(name: string): void {
        if (!name) {
            throw new ParameterError('Role name is required');
        }
        if (name.trim().length === 0) {
            throw new ParameterError('Role name cannot be empty');
        }
        if (name.length > 255) {
            throw new ParameterError(
                'Role name must be 255 characters or less',
            );
        }
    }

    private static validateCustomRoleAsCode(role: CustomRoleAsCode): void {
        const expectedKeys = [
            'version',
            'name',
            'description',
            'level',
            'scopes',
        ];
        const unknownKeys = Object.keys(role).filter(
            (key) => !expectedKeys.includes(key),
        );
        if (unknownKeys.length > 0) {
            throw new ParameterError(
                `Unknown custom role fields: ${unknownKeys.sort().join(', ')}`,
            );
        }
        if (role.version !== 1) {
            throw new ParameterError(
                `Unsupported custom role as-code version ${role.version}`,
            );
        }
        RolesService.validateRoleName(role.name);
        if (role.description !== null && typeof role.description !== 'string') {
            throw new ParameterError(
                'Custom role description must be a string or null',
            );
        }
        if (role.level !== 'project' && role.level !== 'organization') {
            throw new ParameterError(
                'Custom role level must be "project" or "organization"',
            );
        }
        if (
            !Array.isArray(role.scopes) ||
            !role.scopes.every(
                (scope) => typeof scope === 'string' && scope.length > 0,
            )
        ) {
            throw new ParameterError(
                'Custom role scopes must be a list of non-empty strings',
            );
        }
        const duplicateScopes = role.scopes.filter(
            (scope, index) => role.scopes.indexOf(scope) !== index,
        );
        if (duplicateScopes.length > 0) {
            throw new ParameterError(
                `Duplicate custom role scopes: ${[...new Set(duplicateScopes)]
                    .sort()
                    .join(', ')}`,
            );
        }
        const scopeMap = getAllScopeMap({ isEnterprise: true });
        const unknownScopes = role.scopes.filter(
            (scope) => !Object.prototype.hasOwnProperty.call(scopeMap, scope),
        );
        if (unknownScopes.length > 0) {
            throw new ParameterError(
                `Unknown custom role scopes: ${unknownScopes.sort().join(', ')}`,
            );
        }
    }

    private static validateScopesLevel(
        scopeNames: string[],
        level: RoleLevel,
    ): void {
        const invalidScopeNames = scopeNames.filter(
            (scopeName) => !isScopeAssignableAtLevel(scopeName, level),
        );

        if (invalidScopeNames.length > 0) {
            throw new ParameterError(
                `Scopes are not assignable at ${level} level: ${invalidScopeNames.join(
                    ', ',
                )}`,
            );
        }
    }

    private static validateCustomRoleLevel(
        role: Pick<Role, 'name' | 'level'>,
        level: RoleLevel,
    ): void {
        if (role.level !== level) {
            throw new ParameterError(
                `Custom role "${role.name}" can only be assigned at ${role.level} level`,
            );
        }
    }

    async getRolesByOrganizationUuid(
        account: Account,
        organizationUuid: string,
        loadScopes?: boolean,
        roleTypeFilter?: string,
    ): Promise<Role[] | RoleWithScopes[]> {
        await this.validateRolesViewAccess(account, organizationUuid);

        if (loadScopes) {
            const auditedAbility = this.createAuditedAbility(account);
            RolesService.validateOrganizationAccess(
                account,
                auditedAbility,
                organizationUuid,
            );
            return this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
                roleTypeFilter,
            );
        }

        return this.rolesModel.getRolesByOrganizationUuid(
            organizationUuid,
            roleTypeFilter,
        );
    }

    async getCustomRolesAsCode(
        account: Account,
        organizationUuid: string,
    ): Promise<CustomRoleAsCode[]> {
        const roles = (await this.getRolesByOrganizationUuid(
            account,
            organizationUuid,
            true,
            'user',
        )) as RoleWithScopes[];

        return roles.map((role) => ({
            version: 1,
            name: role.name,
            description: role.description,
            level: role.level,
            scopes: [...role.scopes].sort(),
        }));
    }

    async upsertCustomRoleAsCode(
        account: Account,
        organizationUuid: string,
        desiredRole: CustomRoleAsCode,
    ): Promise<ApiCustomRoleAsCodeUpsertResponse['results']> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            organizationUuid,
        );
        RolesService.validateCustomRoleAsCode(desiredRole);

        const existingRoles =
            await this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
                'user',
            );
        const existingRole = existingRoles.find(
            (role) => role.name === desiredRole.name,
        );

        if (!existingRole) {
            RolesService.validateScopesLevel(
                desiredRole.scopes,
                desiredRole.level,
            );
            await this.createRole(account, organizationUuid, {
                name: desiredRole.name,
                description: desiredRole.description ?? undefined,
                level: desiredRole.level,
                scopes: desiredRole.scopes,
            });
            return { action: PromotionAction.CREATE };
        }

        if (existingRole.level !== desiredRole.level) {
            throw new ParameterError(
                `Cannot change custom role "${desiredRole.name}" level from ${existingRole.level} to ${desiredRole.level}. Create a new role instead.`,
            );
        }

        const existingScopes = new Set(existingRole.scopes);
        const desiredScopes = new Set(desiredRole.scopes);
        const scopesToAdd = desiredRole.scopes.filter(
            (scope) => !existingScopes.has(scope),
        );
        const scopesToRemove = existingRole.scopes
            .filter((scope) => !desiredScopes.has(scope))
            .sort();
        const descriptionChanged =
            existingRole.description !== desiredRole.description;

        RolesService.validateScopesLevel(scopesToAdd, desiredRole.level);

        if (
            scopesToAdd.length === 0 &&
            scopesToRemove.length === 0 &&
            !descriptionChanged
        ) {
            return { action: PromotionAction.NO_CHANGES };
        }

        await this.updateRole(
            account,
            organizationUuid,
            existingRole.roleUuid,
            {
                ...(descriptionChanged
                    ? { description: desiredRole.description }
                    : {}),
                scopes: {
                    add: scopesToAdd,
                    remove: scopesToRemove,
                },
            },
        );
        return { action: PromotionAction.UPDATE };
    }

    private static validateUserAsCode(desiredUser: UserAsCode): UserAsCode {
        if (
            typeof desiredUser !== 'object' ||
            desiredUser === null ||
            Array.isArray(desiredUser)
        ) {
            throw new ParameterError('User as code must be an object');
        }

        const expectedKeys = ['version', 'email', 'disabled', 'role'];
        const unknownKeys = Object.keys(desiredUser).filter(
            (key) => !expectedKeys.includes(key),
        );
        if (unknownKeys.length > 0) {
            throw new ParameterError(
                `Unknown user fields: ${unknownKeys.sort().join(', ')}`,
            );
        }
        if (desiredUser.version !== 1) {
            throw new ParameterError(
                `Unsupported user as-code version ${desiredUser.version}`,
            );
        }
        if (
            typeof desiredUser.email !== 'string' ||
            !validateEmail(desiredUser.email)
        ) {
            throw new ParameterError(`Invalid email: ${desiredUser.email}`);
        }
        if (typeof desiredUser.disabled !== 'boolean') {
            throw new ParameterError('User disabled must be a boolean');
        }
        if (
            typeof desiredUser.role !== 'object' ||
            desiredUser.role === null ||
            Array.isArray(desiredUser.role)
        ) {
            throw new ParameterError('User role must be an object');
        }
        const unknownRoleKeys = Object.keys(desiredUser.role).filter(
            (key) => !['type', 'name'].includes(key),
        );
        if (unknownRoleKeys.length > 0) {
            throw new ParameterError(
                `Unknown user role fields: ${unknownRoleKeys.sort().join(', ')}`,
            );
        }
        if (
            desiredUser.role.type !== 'system' &&
            desiredUser.role.type !== 'custom'
        ) {
            throw new ParameterError(
                'User role type must be "system" or "custom"',
            );
        }
        if (
            typeof desiredUser.role.name !== 'string' ||
            desiredUser.role.name.trim().length === 0
        ) {
            throw new ParameterError('User role name cannot be empty');
        }
        if (
            desiredUser.role.type === 'system' &&
            !isOrganizationMemberRole(desiredUser.role.name)
        ) {
            throw new ParameterError(
                `Invalid system organization role: ${desiredUser.role.name}`,
            );
        }

        return {
            ...desiredUser,
            email: desiredUser.email.toLowerCase(),
        };
    }

    private static validateUsersAsCodeAccess(
        account: Account,
        auditedAbility: CaslAuditWrapper<Ability>,
        organizationUuid: string,
        action: 'view' | 'manage',
    ): void {
        assertRegisteredAccount(account);
        if (account.organization.organizationUuid !== organizationUuid) {
            throw new ForbiddenError();
        }
        if (
            auditedAbility.cannot(
                action,
                subject('OrganizationMemberProfile', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async resolveUserAsCodeRole(
        organizationUuid: string,
        role: UserAsCodeRole,
    ): Promise<string> {
        if (role.type === 'system') {
            return role.name;
        }

        const matchingRoles = (
            await this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
                'user',
            )
        ).filter(
            (candidate) =>
                candidate.name === role.name &&
                candidate.level === 'organization',
        );

        if (matchingRoles.length === 0) {
            throw new ParameterError(
                `Organization custom role "${role.name}" not found`,
            );
        }
        if (matchingRoles.length > 1) {
            throw new ParameterError(
                `Multiple organization custom roles named "${role.name}" found`,
            );
        }
        if (matchingRoles[0].scopes.length === 0) {
            throw new ParameterError(
                `Organization custom role "${role.name}" must have at least one scope`,
            );
        }

        return matchingRoles[0].roleUuid;
    }

    async getUsersAsCode(
        account: Account,
        organizationUuid: string,
    ): Promise<UserAsCode[]> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateUsersAsCodeAccess(
            account,
            auditedAbility,
            organizationUuid,
            'view',
        );

        const [members, customRoles] = await Promise.all([
            this.organizationMemberProfileModel.getAllOrganizationMembers(
                organizationUuid,
            ),
            this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
                'user',
            ),
        ]);
        const customRoleNames = new Map(
            customRoles
                .filter((role) => role.level === 'organization')
                .map((role) => [role.roleUuid, role.name]),
        );

        return members.map((member) => {
            let role: UserAsCodeRole;
            if (member.roleUuid) {
                const roleName = customRoleNames.get(member.roleUuid);
                if (!roleName) {
                    throw new ParameterError(
                        `Organization custom role ${member.roleUuid} assigned to ${member.email} was not found`,
                    );
                }
                role = { type: 'custom', name: roleName };
            } else {
                role = { type: 'system', name: member.role };
            }

            return {
                version: 1,
                email: member.email.toLowerCase(),
                disabled: !member.isActive,
                role,
            };
        });
    }

    private async validateUsableAdminChange(
        organizationUuid: string,
        existingUser: Awaited<ReturnType<UserModel['findUserByEmail']>>,
        desiredRoleId: string,
        disabled: boolean,
    ): Promise<void> {
        if (
            !existingUser ||
            existingUser.role !== OrganizationMemberRole.ADMIN ||
            !existingUser.isActive ||
            existingUser.isPending ||
            (desiredRoleId === OrganizationMemberRole.ADMIN && !disabled)
        ) {
            return;
        }

        const usableAdmins = (
            await this.organizationMemberProfileModel.getOrganizationAdmins(
                organizationUuid,
            )
        ).filter((admin) => admin.isActive && !admin.isPending);
        if (
            usableAdmins.length === 1 &&
            usableAdmins[0].userUuid === existingUser.userUuid
        ) {
            throw new ParameterError(
                'Organization must have at least one enabled authenticated admin',
            );
        }
    }

    private async getUserAsCodeInvitationStatus({
        account,
        organizationUuid,
        userUuid,
        desiredUser,
        sendInvite,
    }: {
        account: Account;
        organizationUuid: string;
        userUuid: string;
        desiredUser: UserAsCode;
        sendInvite: boolean;
    }): Promise<UserAsCodeInvitationStatus> {
        if (!sendInvite) {
            return UserAsCodeInvitationStatus.NOT_REQUESTED;
        }
        if (desiredUser.disabled) {
            return UserAsCodeInvitationStatus.SKIPPED_DISABLED;
        }

        const user = await this.userModel.getUserDetailsByUuid(userUuid);
        if (!user.isPending) {
            return UserAsCodeInvitationStatus.SKIPPED_AUTHENTICATED;
        }
        if (await this.inviteLinkModel.hasValidInviteLink(userUuid)) {
            return UserAsCodeInvitationStatus.SKIPPED_VALID_INVITE;
        }

        assertRegisteredAccount(account);
        const inviteCode = nanoid(30);
        const inviteLink = await this.inviteLinkModel.upsert(
            inviteCode,
            new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            organizationUuid,
            userUuid,
            InviteLinkPurpose.Member,
        );
        try {
            await this.emailClient.sendInviteEmail(
                {
                    firstName: account.user.firstName,
                    lastName: account.user.lastName,
                    organizationName: account.organization.name,
                },
                inviteLink,
            );
        } catch (error) {
            await this.inviteLinkModel.deleteByCode(inviteCode);
            throw error;
        }

        this.analytics.track({
            userId: account.user.userUuid,
            event: 'invite_link.created',
        });
        return UserAsCodeInvitationStatus.SENT;
    }

    async upsertUserAsCode(
        account: Account,
        organizationUuid: string,
        desiredUserInput: UserAsCode,
        sendInvite: boolean = false,
    ): Promise<ApiUserAsCodeUpsertResponse['results']> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateUsersAsCodeAccess(
            account,
            auditedAbility,
            organizationUuid,
            'manage',
        );
        if (
            sendInvite &&
            auditedAbility.cannot(
                'create',
                subject('InviteLink', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        assertRegisteredAccount(account);
        const desiredUser = RolesService.validateUserAsCode(desiredUserInput);
        const desiredRoleId = await this.resolveUserAsCodeRole(
            organizationUuid,
            desiredUser.role,
        );
        const existingUser = await this.userModel.findUserByEmail(
            desiredUser.email,
        );

        if (
            existingUser?.organizationUuid &&
            existingUser.organizationUuid !== organizationUuid
        ) {
            throw new ParameterError(
                'Email is already used by a user in another organization',
            );
        }
        const existingRoleId = existingUser
            ? (existingUser.roleUuid ?? existingUser.role)
            : undefined;
        const disabledChanged = existingUser
            ? existingUser.isActive === desiredUser.disabled
            : false;
        const roleChanged = existingRoleId !== desiredRoleId;

        if (
            existingUser?.userUuid === account.user.userUuid &&
            (disabledChanged || roleChanged)
        ) {
            throw new ForbiddenError(
                'Upload cannot change the authenticated user role or disabled state',
            );
        }

        await this.validateUsableAdminChange(
            organizationUuid,
            existingUser,
            desiredRoleId,
            desiredUser.disabled,
        );

        let userUuid: string;
        let action: ApiUserAsCodeUpsertResponse['results']['action'];
        if (!existingUser) {
            const createdUser = await this.userModel.createPendingUser(
                organizationUuid,
                {
                    email: desiredUser.email,
                    firstName: '',
                    lastName: '',
                    role: OrganizationMemberRole.MEMBER,
                },
                !desiredUser.disabled,
            );
            userUuid = createdUser.userUuid;
            action = PromotionAction.CREATE;
        } else if (!existingUser.organizationUuid) {
            await this.userModel.joinOrg(
                existingUser.userUuid,
                organizationUuid,
                OrganizationMemberRole.MEMBER,
                undefined,
            );
            if (disabledChanged) {
                await this.userModel.updateUser(
                    existingUser.userUuid,
                    existingUser.email,
                    { isActive: !desiredUser.disabled },
                );
            }
            userUuid = existingUser.userUuid;
            action = PromotionAction.CREATE;
        } else {
            userUuid = existingUser.userUuid;
            action =
                roleChanged || disabledChanged
                    ? PromotionAction.UPDATE
                    : PromotionAction.NO_CHANGES;
        }

        if (roleChanged || action === PromotionAction.CREATE) {
            const user = await this.userModel.getUserDetailsByUuid(userUuid);
            await this.applyOrganizationUserRoleAssignment(
                account,
                organizationUuid,
                user,
                desiredRoleId,
            );
        }
        if (
            existingUser?.organizationUuid === organizationUuid &&
            disabledChanged
        ) {
            await this.userModel.updateUser(userUuid, existingUser.email, {
                isActive: !desiredUser.disabled,
            });
        }

        const currentUser = await this.userModel.getUserDetailsByUuid(userUuid);
        const lifecycle = currentUser.isPending
            ? UserAsCodeLifecycleStatus.AWAITING_AUTHENTICATION
            : UserAsCodeLifecycleStatus.READY;
        const invitation = await this.getUserAsCodeInvitationStatus({
            account,
            organizationUuid,
            userUuid,
            desiredUser,
            sendInvite,
        });

        return { action, lifecycle, invitation };
    }

    async createRole(
        account: Account,
        organizationUuid: string,
        createRoleData: CreateRole,
    ): Promise<Role> {
        const { scopes, name, description, level = 'project' } = createRoleData;
        if (isSystemRole(name)) {
            throw new ParameterError(
                `Cannot create role with name "${name}", this is reserved for system roles`,
            );
        }

        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            organizationUuid,
        );
        RolesService.validateRoleName(name);

        const role = await this.rolesModel.db.transaction(
            async (tx: Knex.Transaction) => {
                const createdRole = await this.rolesModel.createRole(
                    organizationUuid,
                    {
                        name,
                        description: description ?? null,
                        level,
                        created_by: account.user?.id,
                    },
                    tx,
                );

                if (scopes && scopes.length > 0) {
                    await this.addScopesToRole(
                        account,
                        createdRole.roleUuid,
                        { scopeNames: scopes },
                        { tx, role: createdRole },
                    );
                }
                return createdRole;
            },
        );

        this.analytics.track({
            event: 'role.created',
            userId: account.user?.id,
            properties: {
                roleUuid: role.roleUuid,
                roleName: role.name,
                organizationUuid,
                scopes,
            },
        });

        return role;
    }

    async updateRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        updateRoleData: UpdateRole,
    ): Promise<Role> {
        const { scopes, name, description } = updateRoleData;

        if (isSystemRole(roleUuid)) {
            throw new ParameterError(`Cannot update system role "${roleUuid}"`);
        }

        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateRoleOwnership(account, auditedAbility, role);

        if (name) {
            RolesService.validateRoleName(name);
        }

        await this.rolesModel.db.transaction(async (tx: Knex.Transaction) => {
            if (name !== undefined || description !== undefined) {
                await this.rolesModel.updateRole(
                    roleUuid,
                    {
                        ...(name !== undefined ? { name } : {}),
                        ...(description !== undefined ? { description } : {}),
                    },
                    tx,
                );
            }

            if (scopes && scopes.add.length > 0) {
                await this.addScopesToRole(
                    account,
                    roleUuid,
                    { scopeNames: scopes.add },
                    { tx, role },
                );
            }
            if (scopes && scopes.remove.length > 0) {
                await this.removeScopesFromRole(
                    account,
                    organizationUuid,
                    roleUuid,
                    scopes.remove,
                    tx,
                );
            }
        });
        const updatedRole =
            await this.rolesModel.getRoleWithScopesByUuid(roleUuid);

        // We track add/remove scope analytics in their respective methods
        this.analytics.track({
            event: 'role.updated',
            userId: account.user?.id,
            properties: {
                roleUuid: updatedRole.roleUuid,
                roleName: updatedRole.name,
                organizationUuid,
            },
        });

        return updatedRole;
    }

    async getRoleByUuid(
        account: Account,
        roleUuid: string,
    ): Promise<RoleWithScopes> {
        const role = await this.rolesModel.getRoleWithScopesByUuid(roleUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateRoleOwnership(account, auditedAbility, role);

        return role;
    }

    // =====================================
    // UNIFIED ORGANIZATION ROLE ASSIGNMENTS
    // =====================================

    /*
    At the organization level, we support system roles and organization-level
    custom roles.
    */
    async getOrganizationRoleAssignments(
        account: Account,
        orgUuid: string,
    ): Promise<RoleAssignment[]> {
        await this.validateRolesViewAccess(account, orgUuid);

        // Get organization role assignments from model
        const userAssignments =
            await this.rolesModel.getOrganizationRoleAssignments(orgUuid);

        // Note: Groups don't have organization-level role assignments
        // Groups only have project-level and space-level access

        return userAssignments;
    }

    /**
     * Assign a system role or an organization-level custom role to a user at
     * the organization level.
     */
    private async applyOrganizationUserRoleAssignment(
        account: Account,
        orgUuid: string,
        user: Awaited<ReturnType<UserModel['getUserDetailsByUuid']>>,
        roleId: string,
    ): Promise<RoleAssignment> {
        const previousRole = user.role;
        const isCustomRole =
            roleId !== OrganizationMemberRole.MEMBER && !isSystemRole(roleId);

        let roleName = roleId;
        let ownerType: Role['ownerType'] = 'system';

        if (isCustomRole) {
            const role = await this.rolesModel.getRoleWithScopesByUuid(roleId);
            if (role.organizationUuid !== orgUuid) {
                throw new ForbiddenError();
            }
            RolesService.validateCustomRoleLevel(role, 'organization');

            if (role.scopes.length === 0) {
                throw new ParameterError(
                    'Custom role must have at least one scope',
                );
            }

            roleName = role.name;
            ownerType = 'user';
        }

        await this.rolesModel.upsertOrganizationUserRoleAssignment(
            orgUuid,
            user.userUuid,
            roleId,
        );

        this.analytics.track({
            event: 'organization_role.assigned_to_user',
            userId: account.user?.id,
            properties: {
                organizationUuid: orgUuid,
                userUuid: user.userUuid,
                roleId,
                isSystemRole: !isCustomRole,
            },
        });

        if (!isCustomRole) {
            this.adminNotificationService
                .notifyOrgAdminRoleChange(
                    account,
                    user.userUuid,
                    orgUuid,
                    previousRole,
                    roleId as OrganizationMemberRole,
                )
                .catch((err) => {
                    this.logger.error(
                        'Failed to send org admin role change notification',
                        { error: err },
                    );
                });
        }

        return {
            roleId,
            roleName,
            ownerType,
            assigneeType: 'user',
            assigneeId: user.userUuid,
            assigneeName: `${user.firstName} ${user.lastName}`,
            organizationId: orgUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async upsertOrganizationUserRoleAssignment(
        account: Account,
        orgUuid: string,
        userUuid: string,
        request: { roleId: string },
    ): Promise<RoleAssignment> {
        const { roleId } = request;

        // Validate organization access
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            orgUuid,
        );

        const user = await this.userModel.getUserDetailsByUuid(userUuid);
        if (user.role === OrganizationMemberRole.ADMIN) {
            // If user is currently an admin, we need to check if there are more admins
            // because every org should have at least one admin
            const adminUuids =
                await this.rolesModel.getOrganizationAdmins(orgUuid);
            if (adminUuids.length === 1) {
                throw new ParameterError(
                    'Organization must have at least one admin',
                );
            }
        }

        return this.applyOrganizationUserRoleAssignment(
            account,
            orgUuid,
            user,
            roleId,
        );
    }

    // =====================================
    // UNIFIED PROJECT ROLE ASSIGNMENTS
    // =====================================

    async getProjectRoleAssignments(
        account: Account,
        projectId: string,
    ): Promise<RoleAssignment[]> {
        await this.validateProjectAccess(account, projectId);

        // Get existing project access data
        const projectAccess = await this.getProjectAccess(account, projectId);

        const assignments: RoleAssignment[] = [];

        // Convert user access to unified format
        for (const userAccess of projectAccess.users) {
            assignments.push({
                roleId: userAccess.roleUuid,
                roleName: userAccess.roleName,
                ownerType: isSystemRole(userAccess.roleUuid)
                    ? 'system'
                    : 'user',
                assigneeType: 'user',
                assigneeId: userAccess.userUuid,
                assigneeName: `${userAccess.firstName} ${userAccess.lastName}`,
                projectId: userAccess.projectUuid,
                createdAt: new Date(), // TODO: Get actual dates from DB
                updatedAt: new Date(),
            });
        }

        // Convert group access to unified format
        for (const groupAccess of projectAccess.groups) {
            assignments.push({
                roleId: groupAccess.roleUuid, // This might be role name for legacy
                roleName: groupAccess.roleName,
                ownerType: isSystemRole(groupAccess.roleUuid)
                    ? 'system'
                    : 'user',
                assigneeType: 'group',
                assigneeId: groupAccess.groupUuid,
                assigneeName: groupAccess.groupName,
                projectId: groupAccess.projectUuid,
                createdAt: new Date(), // TODO: Get actual dates from DB
                updatedAt: new Date(),
            });
        }
        return assignments;
    }

    async updateProjectRoleAssignment(
        account: Account,
        projectId: string,
        assigneeId: string,
        assigneeType: 'user' | 'group',
        request: UpdateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        if (assigneeType === 'user') {
            return this.upsertProjectUserRoleAssignment(
                account,
                projectId,
                assigneeId,
                request,
            );
        }

        if (assigneeType === 'group') {
            return this.updateProjectGroupRoleAssignment(
                account,
                projectId,
                assigneeId,
                request,
            );
        }

        throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
    }

    private async updateProjectGroupRoleAssignment(
        account: Account,
        projectId: string,
        groupId: string,
        request: UpdateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        // Redirect to the new upsert method for consistency
        return this.upsertProjectGroupRoleAssignment(
            account,
            projectId,
            groupId,
            request,
        );
    }

    async deleteProjectRoleAssignment(
        account: Account,
        projectId: string,
        assigneeId: string,
        assigneeType: 'user' | 'group',
    ): Promise<void> {
        if (assigneeType === 'user') {
            await this.removeUserProjectAccess(account, projectId, assigneeId);
        } else if (assigneeType === 'group') {
            await this.unassignRoleFromGroup(account, assigneeId, projectId);
        } else {
            throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
        }
    }

    // =====================================
    // SEPARATE PROJECT ROLE ASSIGNMENTS
    // =====================================

    async upsertProjectUserRoleAssignment(
        account: Account,
        projectUuid: string,
        userUuid: string,
        request: UpsertUserRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId } = request;
        const project = await this.projectModel.getSummary(projectUuid);

        await this.validateProjectAccess(account, projectUuid);
        const role = await this.rolesModel.getRoleWithScopesByUuid(roleId);

        const userProjectRole =
            await this.rolesModel.getProjectAccessByUserUuid(
                userUuid,
                projectUuid,
            );

        if (isSystemRole(roleId)) {
            await this.rolesModel.upsertSystemRoleProjectAccess(
                projectUuid,
                userUuid,
                roleId,
            );
        } else {
            if (role.scopes.length === 0) {
                throw new ParameterError(
                    'Custom role must have at least one scope',
                );
            }

            RolesService.validateCustomRoleLevel(role, 'project');

            await this.rolesModel.upsertCustomRoleProjectAccess(
                projectUuid,
                userUuid,
                roleId,
            );
        }
        const user = await this.userModel.getUserDetailsByUuid(userUuid);

        // If the user is added to the project for the first time, send an invitation email
        const userEmail = user.email;
        const sendInvitationEmail =
            userProjectRole.length === 0 && request.sendEmail && userEmail;
        if (sendInvitationEmail) {
            this.logger.debug(
                `Sending email to ${userEmail} for project ${project.name} with role ${role.name}`,
            );
            const projectUrl = new URL(
                `/projects/${projectUuid}/home`,
                this.lightdashConfig.siteUrl,
            ).href;
            const data = isSystemRole(roleId)
                ? {
                      email: userEmail,
                      role: roleId,
                      sendEmail: true,
                  }
                : {
                      email: userEmail,
                      customRoleName: role.name,
                  };
            await this.emailClient.sendProjectAccessEmail(
                user,
                data,
                project.name,
                projectUrl,
            );
        }

        this.analytics.track({
            event: isSystemRole(roleId)
                ? 'project_access.upserted_system_role'
                : 'project_access.upserted_custom_role',
            userId: account.user?.id,
            properties: {
                projectUuid,
                userUuid,
                roleId,
                isSystemRole: isSystemRole(roleId),
            },
        });

        const previousProjectRole = userProjectRole[0]?.role ?? null;
        const newProjectRole = isSystemRole(roleId) ? roleId : null;
        this.adminNotificationService
            .notifyProjectAdminRoleChange({
                account,
                targetUserUuid: userUuid,
                projectUuid,
                organizationUuid: project.organizationUuid,
                previousRole: previousProjectRole,
                newRole: newProjectRole,
            })
            .catch((err) => {
                this.logger.error(
                    'Failed to send project admin role change notification',
                    { error: err },
                );
            });

        return {
            roleId,
            roleName: role.name,
            ownerType: 'user',
            assigneeType: 'user',
            assigneeId: userUuid,
            assigneeName: `${user.firstName} ${user.lastName}`,
            projectId: projectUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async upsertProjectGroupRoleAssignment(
        account: Account,
        projectUuid: string,
        groupUuid: string,
        request: UpsertUserRoleAssignmentRequest, // Reusing the same request type
    ): Promise<RoleAssignment> {
        const { roleId } = request;
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);
        const role = await this.rolesModel.getRoleWithScopesByUuid(roleId);

        if (isSystemRole(roleId)) {
            await this.rolesModel.upsertSystemRoleGroupAccess(
                groupUuid,
                projectUuid,
                roleId,
            );
        } else {
            if (role.scopes.length === 0) {
                throw new ParameterError(
                    'Custom role must have at least one scope',
                );
            }

            RolesService.validateCustomRoleLevel(role, 'project');

            await this.rolesModel.upsertCustomRoleGroupAccess(
                groupUuid,
                projectUuid,
                roleId,
            );
        }

        this.analytics.track({
            event: isSystemRole(roleId)
                ? 'project_group_access.upserted_system_role'
                : 'project_group_access.upserted_custom_role',
            userId: account.user?.id,
            properties: {
                projectUuid,
                groupUuid,
                roleId,
                isSystemRole: isSystemRole(roleId),
            },
        });

        const group = await this.groupsModel.getGroup(groupUuid);
        return {
            roleId,
            roleName: role.name,
            ownerType: 'user',
            assigneeType: 'group',
            assigneeId: groupUuid,
            assigneeName: group.name,
            projectId: projectUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async getRoleAssignees(
        account: Account,
        roleUuid: string,
    ): Promise<RoleAssignee[]> {
        if (isSystemRole(roleUuid)) {
            return [];
        }
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateRoleOwnership(account, auditedAbility, role);

        return this.rolesModel.getRoleAssignees(roleUuid);
    }

    async deleteRole(account: Account, roleUuid: string): Promise<void> {
        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot remove system roles');
        }
        try {
            const role = await this.rolesModel.getRoleByUuid(roleUuid);
            const auditedAbility = this.createAuditedAbility(account);
            RolesService.validateRoleOwnership(account, auditedAbility, role);

            await this.rolesModel.deleteRole(roleUuid);

            this.analytics.track({
                event: 'role.deleted',
                userId: account.user?.id,
                properties: {
                    roleUuid,
                    roleName: role.name,
                    organizationUuid: role.organizationUuid,
                },
            });
        } catch (error) {
            const foreignKeyViolation = '23503';
            if (
                error instanceof DatabaseError &&
                error.code === foreignKeyViolation
            ) {
                this.logger.error('Role deletion blocked by FK constraint', {
                    roleUuid,
                    detail: error.detail,
                    constraint: error.constraint,
                    table: error.table,
                });
                throw new ParameterError('Role cannot be deleted if assigned');
            }

            throw error;
        }
    }

    async unassignRoleFromUser(
        account: Account,
        userUuid: string,
        organizationUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.unassignCustomRoleFromUser(userUuid, projectUuid);

        this.analytics.track({
            event: 'role.unassigned_from_user',
            userId: account.user?.id,
            properties: {
                targetUserUuid: userUuid,
                organizationUuid,
                projectUuid,
            },
        });
    }

    async assignRoleToGroup(
        account: Account,
        groupUuid: string,
        roleUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateRoleOwnership(account, auditedAbility, role);
        RolesService.validateCustomRoleLevel(role, 'project');
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.assignRoleToGroup(
            groupUuid,
            roleUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.assigned_to_group',
            userId: account.user?.id,
            properties: {
                roleUuid,
                groupUuid,
                organizationUuid: role.organizationUuid,
                projectUuid,
            },
        });
    }

    async unassignRoleFromGroup(
        account: Account,
        groupUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            account.organization?.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.unassignRoleFromGroup(groupUuid, projectUuid);

        this.analytics.track({
            event: 'role.unassigned_from_group',
            userId: account.user?.id,
            properties: {
                groupUuid,
                projectUuid,
            },
        });
    }

    private async getProjectAccess(account: Account, projectUuid: string) {
        await this.validateProjectAccess(account, projectUuid);

        const userAccess = await this.rolesModel.getProjectAccess(projectUuid);

        const groupAccess =
            await this.rolesModel.getGroupProjectAccess(projectUuid);

        return {
            users: userAccess,
            groups: groupAccess,
        };
    }

    async removeUserProjectAccess(
        account: Account,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.removeUserProjectAccess(userUuid, projectUuid);

        this.analytics.track({
            event: 'project_access.removed',
            userId: account.user?.id,
            properties: {
                projectUuid,
                userUuid,
            },
        });
    }

    async addScopesToRole(
        account: Account,
        roleUuid: string,
        scopeData: AddScopesToRole,
        { tx, role }: { tx?: Knex.Transaction; role?: Role } = {},
    ): Promise<void> {
        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot add scopes to system roles');
        }

        const foundRole =
            role || (await this.rolesModel.getRoleByUuid(roleUuid));
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateRoleOwnership(account, auditedAbility, foundRole);
        RolesService.validateScopesLevel(scopeData.scopeNames, foundRole.level);

        await this.rolesModel.addScopesToRole(
            roleUuid,
            scopeData.scopeNames,
            account.user?.id,
            tx,
        );

        this.analytics.track({
            event: 'role.scopes_added',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeNames: scopeData.scopeNames,
                organizationUuid: foundRole.organizationUuid,
            },
        });
    }

    /** @deprecated Only used by the deprecated remove-scope endpoint; use updateRole with scopes.remove instead. */
    async removeScopeFromRole(
        account: Account,
        roleUuid: string,
        scopeName: string,
    ): Promise<void> {
        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot remove scopes from system roles');
        }

        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateRoleOwnership(account, auditedAbility, role);

        await this.rolesModel.removeScopeFromRole(roleUuid, scopeName);

        this.analytics.track({
            event: 'role.scope_removed',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeName,
                organizationUuid: role.organizationUuid,
            },
        });
    }

    async removeScopesFromRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        scopeNames: string[],
        tx?: Knex.Transaction,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            organizationUuid,
        );

        if (scopeNames.filter(Boolean).length === 0) {
            throw new ParameterError('scopeNames are required');
        }

        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot remove scopes from system roles');
        }

        await this.rolesModel.removeScopesFromRole(roleUuid, scopeNames, tx);

        this.analytics.track({
            event: 'role.scopes_removed',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeNames,
                organizationUuid,
            },
        });
    }

    async duplicateRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        duplicateRoleData: CreateRole,
    ): Promise<RoleWithScopes> {
        const auditedAbility = this.createAuditedAbility(account);
        RolesService.validateOrganizationAccess(
            account,
            auditedAbility,
            organizationUuid,
        );

        const { name, description } = duplicateRoleData;
        RolesService.validateRoleName(name);

        const sourceRole =
            await this.rolesModel.getRoleWithScopesByUuid(roleUuid);
        if (!sourceRole) {
            throw new NotFoundError(`Role to duplicate: ${roleUuid} not found`);
        }
        RolesService.validateRoleOwnership(account, auditedAbility, sourceRole);

        const copyOfRoleName = `Copy of: ${sourceRole.name}`;
        const newDescription =
            description || sourceRole.description || copyOfRoleName;
        const scopeNames = sourceRole.scopes.filter((scopeName) =>
            isScopeAssignableAtLevel(scopeName, sourceRole.level),
        );
        const newRole = await this.rolesModel.db.transaction(
            async (tx: Knex.Transaction) => {
                const role = await this.rolesModel.createRole(
                    organizationUuid,
                    {
                        name,
                        description: newDescription,
                        level: sourceRole.level,
                        created_by: account.user?.id,
                    },
                    tx,
                );

                if (scopeNames.length > 0) {
                    await this.addScopesToRole(
                        account,
                        role.roleUuid,
                        { scopeNames },
                        { tx, role },
                    );
                }
                return role;
            },
        );

        this.analytics.track({
            event: 'role.duplicated',
            userId: account.user?.id,
            properties: {
                sourceRoleUuid: roleUuid,
                newRoleUuid: newRole.roleUuid,
                newRoleName: newRole.name,
                isSourceSystemRole: isSystemRole(roleUuid),
                organizationUuid,
                scopeCount: scopeNames.length,
            },
        });

        return {
            ...newRole,
            scopes: scopeNames,
        };
    }
}
