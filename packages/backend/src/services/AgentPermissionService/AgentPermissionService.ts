import { subject } from '@casl/ability';
import {
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_CAPABILITY_SCOPES,
    AGENT_PILOT_CAPABILITIES,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertRegisteredAccount,
    assertUnreachable,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    getProjectAgentIdentitySettingsPath,
    OrganizationMemberRole,
    ParameterError,
    type Account,
    type AgentActorSurface,
    type AgentCapabilityPolicy,
    type AgentSystemRoleMatrix,
    type AiAccessRefusal,
    type AiOrganizationSettings,
    type RegisteredAccount,
    type UUID,
} from '@lightdash/common';
import { getRequiredAgentCapabilities } from '../../auth/agentPermissions/capabilityMap';
import { getOAuthScopeContext } from '../../auth/oauthScopes/scopedAbility';
import { type AgentActionLogModel } from '../../models/AgentActionLogModel';
import { type AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { type AgentWarehouseRestrictionConfirmationModel } from '../../models/AgentWarehouseRestrictionConfirmationModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import { recordAgentRefusal } from '../AiAccessService/logAgentContentWrite';
import { BaseService } from '../BaseService';

export interface ResolvedAgentPolicy {
    mode: 'off' | 'legacy' | 'managed';
    capabilities: Set<AgentCapability> | null;
    allowedProjectUuids: string[] | null;
    version: number;
    editableCustomRoleUuid: string | null;
}

export interface AgentPolicyEvaluation {
    requiredCapabilities: readonly AgentCapability[] | null;
    projectUuid: string | null;
    mcpAgentsEnabled: boolean;
    mcpContentWritesEnabled: boolean;
    warehouseConfirmed: boolean;
    isOrganizationDiscovery: boolean;
}

export interface AgentPolicyDenial {
    reason: AiAccessRefusalReason;
    capability: AgentCapability | null;
    policyLayer: NonNullable<AiAccessRefusal['policyLayer']>;
    settingsUrl: string | null;
}

export const evaluate = (
    policy: ResolvedAgentPolicy,
    operation: AgentPolicyEvaluation,
): AgentPolicyDenial | null => {
    if (policy.mode !== 'managed') return null;
    const deny = (
        reason: AiAccessRefusalReason,
        policyLayer: AgentPolicyDenial['policyLayer'],
        capability: AgentCapability | null = null,
        settingsUrl: string | null = '/generalSettings/agentIdentity',
    ): AgentPolicyDenial => ({ reason, policyLayer, capability, settingsUrl });
    if (!operation.mcpAgentsEnabled)
        return deny(
            AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
            'organization_setting',
        );
    if (operation.requiredCapabilities === null)
        return deny(
            AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
            'unmapped',
            null,
            null,
        );
    if (
        policy.allowedProjectUuids !== null &&
        (operation.projectUuid === null
            ? !operation.isOrganizationDiscovery ||
              operation.requiredCapabilities.some(
                  (capability) => capability !== AgentCapability.ReadDiscover,
              )
            : !policy.allowedProjectUuids.includes(operation.projectUuid))
    ) {
        return deny(
            AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            'project_scope',
        );
    }
    const missing = operation.requiredCapabilities.find(
        (capability) => !policy.capabilities?.has(capability),
    );
    if (missing)
        return deny(
            AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            'org_ceiling',
            missing,
            policy.editableCustomRoleUuid
                ? `/generalSettings/customRoles/${policy.editableCustomRoleUuid}`
                : '/generalSettings/agentIdentity',
        );
    if (
        operation.requiredCapabilities.includes(AgentCapability.ContentWrite) &&
        !operation.mcpContentWritesEnabled
    ) {
        return deny(
            AiAccessRefusalReason.AGENT_SETTING_DENIED,
            'organization_setting',
            AgentCapability.ContentWrite,
        );
    }
    if (
        operation.requiredCapabilities.includes(AgentCapability.RawSql) &&
        !operation.warehouseConfirmed
    ) {
        return deny(
            AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
            'warehouse_identity',
            AgentCapability.RawSql,
            operation.projectUuid === null
                ? '/generalSettings/agentIdentity'
                : getProjectAgentIdentitySettingsPath(operation.projectUuid),
        );
    }
    return null;
};

export type AgentPermissionOperationKind =
    | 'agent_turn'
    | 'mcp_tool'
    | 'agent_tool'
    | 'rest_operation'
    | 'connected_mcp_tool';

const ORGANIZATION_DISCOVERY_OPERATIONS: Record<
    AgentPermissionOperationKind,
    readonly string[]
> = {
    mcp_tool: [
        'connect_agent',
        'get_lightdash_version',
        'list_projects',
        'get_context',
        'get_current_project',
    ],
    agent_tool: ['listProjects'],
    agent_turn: [],
    connected_mcp_tool: [],
    rest_operation: [
        'UserController.getAccount',
        'UserController.getAuthenticatedUser',
        'UserController.getEmailVerificationStatus',
        'UserController.getOrganizationsUserCanJoin',
        'UserController.getPersonalAccessTokens',
        'UserController.getUserLearnProgress',
        'UserController.getUserOnboarding',
        'OrganizationController.getOrganization',
        'OrganizationController.getProjects',
        'OrganizationController.getColorPalettes',
        'OrganizationController.getImpersonationSettings',
        'OrganizationController.getLearnAccess',
        'OrganizationController.getOrganizationBrand',
        'OrganizationController.getOrganizationMemberByEmail',
        'OrganizationController.getOrganizationMemberByUuid',
        'OrganizationController.getOrganizationMembers',
        'OrganizationController.listGroupsInOrganization',
        'organizationRouter GET /access',
        'organizationRouter GET /onboardingStatus',
        'organizationRouter.getOnboarding',
        'organizationRouter.getOrganizationAccess',
        'apiV1Router GET /health',
    ],
};

const requiredCapabilitiesForOperation = (
    kind: AgentPermissionOperationKind,
    key: string,
    connectedTool: ConnectedAgentTool | undefined,
): readonly AgentCapability[] | null => {
    switch (kind) {
        case 'agent_turn':
            return key === 'agent_turn' ? [] : null;
        case 'mcp_tool':
            return getRequiredAgentCapabilities('mcp', key);
        case 'agent_tool':
            return getRequiredAgentCapabilities('agent', key);
        case 'rest_operation':
            return getRequiredAgentCapabilities('rest', key);
        case 'connected_mcp_tool':
            return connectedTool?.serverUuid &&
                connectedTool.enabledToolNames?.includes(connectedTool.toolName)
                ? [AgentCapability.ExternalTools]
                : null;
        default:
            return assertUnreachable(kind, 'Unknown agent operation kind');
    }
};

interface ResolvePolicyArgs {
    account: RegisteredAccount;
    organizationUuid: string;
    projectUuid: string | null;
}

export interface ConnectedAgentTool {
    serverUuid: string;
    toolName: string;
    enabledToolNames: readonly string[] | null;
}

interface AssertOperationArgs extends ResolvePolicyArgs {
    connectedTool?: ConnectedAgentTool;
    kind: AgentPermissionOperationKind;
    key: string;
    surface: AgentActorSurface;
}

interface AssertActorVerifiedArgs extends AssertOperationArgs {
    actorVerified: boolean;
}

export interface AgentPermissionResource {
    type: 'dashboard' | 'saved_chart' | 'space' | 'query';
    uuid: string;
}

interface Dependencies {
    resolveResourceProjectUuid: (
        resource: AgentPermissionResource,
    ) => Promise<string | null>;
    isCustomRolesLicensed: () => boolean;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    agentCapabilityPolicyModel: Pick<
        AgentCapabilityPolicyModel,
        'get' | 'save'
    >;
    agentWarehouseRestrictionConfirmationModel: Pick<
        AgentWarehouseRestrictionConfirmationModel,
        'get' | 'upsert' | 'delete' | 'getCurrentBindingFingerprint'
    >;
    userModel: Pick<UserModel, 'getAgentRoleAssignments'>;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    getOrganizationSettings: (
        organizationUuid: string,
    ) => Promise<Pick<
        AiOrganizationSettings,
        'mcpAgentsEnabled' | 'mcpContentWritesEnabled'
    > | null>;
    agentActionLogModel: Pick<AgentActionLogModel, 'insert'>;
}

export interface AgentCapabilityPolicyOverview extends AgentCapabilityPolicy {
    defaults: AgentSystemRoleMatrix;
    pilotPreset: {
        description: string;
        systemRoleMatrix: AgentSystemRoleMatrix;
    };
}

export interface AgentCapabilityCeiling {
    allowedProjectUuids: UUID[] | null;
    systemRoleMatrix: AgentSystemRoleMatrix;
}

export const agentSystemRoleMatrix = (
    capabilities: readonly AgentCapability[],
): AgentSystemRoleMatrix => ({
    member: [...capabilities],
    viewer: [...capabilities],
    interactive_viewer: [...capabilities],
    editor: [...capabilities],
    developer: [...capabilities],
    admin: [...capabilities],
});

export class AgentPermissionService extends BaseService {
    constructor(private readonly deps: Dependencies) {
        super();
    }

    async resolveResourceProjectUuid(
        resource: AgentPermissionResource,
    ): Promise<string | null> {
        return this.deps.resolveResourceProjectUuid(resource);
    }

    async isEnabled(organizationUuid: string): Promise<boolean> {
        return (
            await this.deps.featureFlagModel.get({
                user: { organizationUuid },
                featureFlagId: FeatureFlags.AgentIdentity,
            })
        ).enabled;
    }

    async isManaged(organizationUuid: string): Promise<boolean> {
        if (!(await this.isEnabled(organizationUuid))) return false;
        return (
            (await this.deps.agentCapabilityPolicyModel.get(organizationUuid))
                .mode === 'managed'
        );
    }

    async resolvePolicy({
        account,
        organizationUuid,
        projectUuid,
    }: ResolvePolicyArgs): Promise<ResolvedAgentPolicy> {
        if (!(await this.isEnabled(organizationUuid)))
            return {
                mode: 'off',
                capabilities: null,
                allowedProjectUuids: null,
                version: 0,
                editableCustomRoleUuid: null,
            };
        const policy =
            await this.deps.agentCapabilityPolicyModel.get(organizationUuid);
        if (policy.mode === 'legacy')
            return {
                ...policy,
                capabilities: null,
                editableCustomRoleUuid: null,
            };
        if (account.organization.organizationUuid !== organizationUuid)
            throw new ForbiddenError(
                'Your account does not belong to this organization',
            );
        if (projectUuid !== null) {
            const project =
                await this.deps.projectModel.getSummary(projectUuid);
            if (project.organizationUuid !== organizationUuid)
                throw new ForbiddenError(
                    'The project does not belong to this organization',
                );
        }
        const assignments = await this.deps.userModel.getAgentRoleAssignments(
            account.user.id,
            organizationUuid,
            projectUuid,
        );
        const capabilities = new Set<AgentCapability>();
        assignments.systemRoles.forEach((role) =>
            policy.systemRoleMatrix[role].forEach((capability) =>
                capabilities.add(capability),
            ),
        );
        assignments.customRoles.forEach(({ scopes }) =>
            Object.values(AgentCapability).forEach((capability) => {
                if (scopes.includes(AGENT_CAPABILITY_SCOPES[capability]))
                    capabilities.add(capability);
            }),
        );
        const canEditRoles =
            this.deps.isCustomRolesLicensed() &&
            this.createAuditedAbility(account).can(
                'manage',
                subject('Organization', { organizationUuid }),
            );
        return {
            mode: 'managed',
            version: policy.version,
            allowedProjectUuids: policy.allowedProjectUuids,
            capabilities,
            editableCustomRoleUuid: canEditRoles
                ? (assignments.customRoles[0]?.roleUuid ?? null)
                : null,
        };
    }

    async assertActorVerified(args: AssertActorVerifiedArgs): Promise<void> {
        if (
            args.actorVerified ||
            !(await this.isEnabled(args.organizationUuid))
        )
            return;
        const policy = await this.deps.agentCapabilityPolicyModel.get(
            args.organizationUuid,
        );
        if (policy.mode !== 'managed') return;
        const error = new AiAccessRefusedError(
            AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
            {
                policyLayer: 'organization_setting',
                operation: args.key,
                policyVersion: policy.version,
                projectUuid: args.projectUuid,
            },
        );
        await this.recordRefusal(args, error);
        throw error;
    }

    async assertOperation(args: AssertOperationArgs): Promise<void> {
        const policy = await this.resolvePolicy(args);
        if (policy.mode !== 'managed') return;
        const requiredCapabilities = requiredCapabilitiesForOperation(
            args.kind,
            args.key,
            args.connectedTool,
        );
        const settings = await this.deps.getOrganizationSettings(
            args.organizationUuid,
        );
        const operation: AgentPolicyEvaluation = {
            requiredCapabilities,
            projectUuid: args.projectUuid,
            mcpAgentsEnabled: settings?.mcpAgentsEnabled ?? true,
            mcpContentWritesEnabled: settings?.mcpContentWritesEnabled ?? true,
            warehouseConfirmed: false,
            isOrganizationDiscovery: ORGANIZATION_DISCOVERY_OPERATIONS[
                args.kind
            ].includes(args.key),
        };
        let denial = evaluate(policy, operation);
        if (
            denial?.reason ===
                AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED &&
            args.projectUuid !== null
        ) {
            const [confirmation, fingerprint] = await Promise.all([
                this.deps.agentWarehouseRestrictionConfirmationModel.get(
                    args.projectUuid,
                ),
                this.deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint(
                    args.projectUuid,
                ),
            ]);
            operation.warehouseConfirmed =
                confirmation?.bindingFingerprint === fingerprint;
            denial = evaluate(policy, operation);
        }
        if (!denial) return;
        const error = new AiAccessRefusedError(denial.reason, {
            ...denial,
            ...(denial.reason === AiAccessRefusalReason.AGENT_CAPABILITY_DENIED
                ? {
                      message: `Your roles do not allow the ${denial.capability} agent capability. Ask an admin to update your agent permissions.`,
                  }
                : {}),
            operation: args.key,
            policyVersion: policy.version,
            projectUuid: args.projectUuid,
        });
        await this.recordRefusal(args, error);
        throw error;
    }

    private async recordRefusal(
        args: AssertOperationArgs,
        error: AiAccessRefusedError,
    ): Promise<void> {
        try {
            const activeContext = agentExecutionContext.getStore();
            const context =
                activeContext?.agentIdentityEnabled &&
                activeContext.writerUuid === args.account.user.id &&
                activeContext.organizationUuid === args.organizationUuid
                    ? activeContext
                    : createAgentExecutionContext({
                          account: args.account,
                          surface: args.surface,
                          clientId: null,
                          agentUuid: null,
                          agentIdentityEnabled: true,
                      });
            await agentExecutionContext.run(context, () =>
                recordAgentRefusal({
                    model: this.deps.agentActionLogModel,
                    userUuid: args.account.user.id,
                    organizationUuid: args.organizationUuid,
                    projectUuid: args.projectUuid,
                    objectType: 'agent_operation',
                    objectId: args.key,
                    action: args.kind,
                    policyLayer: error.refusal.policyLayer ?? 'org_ceiling',
                    reasonCode: error.refusal.reason,
                    capability: error.refusal.capability ?? null,
                    policyVersion: error.refusal.policyVersion,
                    error,
                }),
            );
        } catch {
            this.logger.warn('Failed to record agent permission refusal', {
                reason: error.refusal.reason,
                operation: args.key,
            });
        }
    }

    private async assertHuman(account: Account): Promise<string> {
        assertRegisteredAccount(account);
        if (
            (account.authentication.type !== 'session' &&
                account.authentication.type !== 'pat') ||
            getOAuthScopeContext(account.user.ability) !== null ||
            agentExecutionContext.getStore()
        ) {
            throw new ForbiddenError(
                'Only a person can manage agent permissions',
            );
        }
        const { organizationUuid } = account.organization;
        if (!organizationUuid)
            throw new ForbiddenError('An organization is required');
        if (!(await this.isEnabled(organizationUuid)))
            throw new FeatureNotEnabledError(FeatureFlags.AgentIdentity);
        return organizationUuid;
    }

    private async assertPolicyAdmin(account: Account): Promise<string> {
        const organizationUuid = await this.assertHuman(account);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        )
            throw new ForbiddenError(
                'Only an organization admin can manage agent permissions',
            );
        return organizationUuid;
    }

    private async assertProjectAdmin(
        account: Account,
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid = await this.assertHuman(account);
        const project = await this.deps.projectModel.getSummary(projectUuid);
        if (
            project.organizationUuid !== organizationUuid ||
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Only a project admin can confirm warehouse restrictions',
            );
        }
        return organizationUuid;
    }

    private async validateProjects(
        organizationUuid: string,
        projectUuids: string[] | null,
    ): Promise<void> {
        await Promise.all(
            (projectUuids ?? []).map(async (projectUuid) => {
                if (
                    (await this.deps.projectModel.getSummary(projectUuid))
                        .organizationUuid !== organizationUuid
                )
                    throw new ParameterError(
                        'All allowed projects must belong to this organization',
                    );
            }),
        );
    }

    async getPolicy(account: Account): Promise<AgentCapabilityPolicyOverview> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        return {
            ...(await this.deps.agentCapabilityPolicyModel.get(
                organizationUuid,
            )),
            defaults: agentSystemRoleMatrix(AGENT_CAPABILITY_DEFAULTS),
            pilotPreset: {
                description:
                    'Allow discovery, semantic queries and exports for the selected projects. Custom roles keep their existing scopes.',
                systemRoleMatrix: agentSystemRoleMatrix(
                    AGENT_PILOT_CAPABILITIES,
                ),
            },
        };
    }

    async saveCeiling(
        account: Account,
        ceiling: AgentCapabilityCeiling,
    ): Promise<AgentCapabilityPolicy> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        await this.validateProjects(
            organizationUuid,
            ceiling.allowedProjectUuids,
        );
        const roles = Object.values(OrganizationMemberRole);
        if (
            Object.keys(ceiling.systemRoleMatrix).length !== roles.length ||
            roles.some(
                (role) =>
                    !Array.isArray(ceiling.systemRoleMatrix[role]) ||
                    ceiling.systemRoleMatrix[role].some(
                        (capability) =>
                            !Object.values(AgentCapability).includes(
                                capability,
                            ),
                    ),
            )
        ) {
            throw new ParameterError(
                'Provide the capability list for every system role',
            );
        }
        return this.deps.agentCapabilityPolicyModel.save({
            ...ceiling,
            organizationUuid,
            mode: 'managed',
            updatedByUserUuid: account.user.id,
        });
    }

    async applyPilotPreset(
        account: Account,
        allowedProjectUuids: string[] | null,
    ): Promise<AgentCapabilityPolicy> {
        return this.saveCeiling(account, {
            allowedProjectUuids,
            systemRoleMatrix: agentSystemRoleMatrix(AGENT_PILOT_CAPABILITIES),
        });
    }

    async resetToLegacy(account: Account): Promise<AgentCapabilityPolicy> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        const policy =
            await this.deps.agentCapabilityPolicyModel.get(organizationUuid);
        return this.deps.agentCapabilityPolicyModel.save({
            ...policy,
            organizationUuid,
            mode: 'legacy',
            updatedByUserUuid: account.user.id,
        });
    }

    async getWarehouseConfirmation(account: Account, projectUuid: string) {
        await this.assertProjectAdmin(account, projectUuid);
        const [confirmation, fingerprint] = await Promise.all([
            this.deps.agentWarehouseRestrictionConfirmationModel.get(
                projectUuid,
            ),
            this.deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint(
                projectUuid,
            ),
        ]);
        return {
            confirmation,
            confirmed: confirmation?.bindingFingerprint === fingerprint,
        };
    }

    async confirmWarehouse(account: Account, projectUuid: string) {
        await this.assertProjectAdmin(account, projectUuid);
        return this.deps.agentWarehouseRestrictionConfirmationModel.upsert({
            projectUuid,
            bindingFingerprint:
                await this.deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint(
                    projectUuid,
                ),
            confirmedByUserUuid: account.user.id,
        });
    }

    async deleteWarehouseConfirmation(
        account: Account,
        projectUuid: string,
    ): Promise<void> {
        await this.assertProjectAdmin(account, projectUuid);
        await this.deps.agentWarehouseRestrictionConfirmationModel.delete(
            projectUuid,
        );
    }
}
