import { subject } from '@casl/ability';
import {
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_CAPABILITY_SCOPES,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertRegisteredAccount,
    assertUnreachable,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    type Account,
    type AgentActorSurface,
    type AgentCapabilityPolicy,
    type AgentPermissionCheck,
    type AgentSystemRoleMatrix,
    type AiAccessRefusal,
    type AiOrganizationSettings,
    type RegisteredAccount,
    type UUID,
} from '@lightdash/common';
import { getRequiredAgentCapabilities } from '../../auth/agentPermissions/capabilityMap';
import { HUMAN_ONLY_IN_MANAGED } from '../../auth/agentPermissions/humanOnlyInManaged';
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
import {
    agentPermissionChecks,
    permissionBlockers,
    permissionRefusal,
    type AgentPermissionEvaluationContext,
} from './agentPermissionEvaluation';

export interface ResolvedAgentPolicy {
    mode: 'off' | 'legacy' | 'managed';
    capabilities: Set<AgentCapability> | null;
    allowedProjectUuids: string[] | null;
    allowedUserUuids: string[] | null;
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

export { evaluate } from './agentPermissionEvaluation';

export type AgentPermissionOperationKind =
    | 'agent_turn'
    | 'mcp_tool'
    | 'agent_tool'
    | 'tool_effect'
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
    tool_effect: [],
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
        case 'tool_effect':
            return getRequiredAgentCapabilities('tool_effect', key);
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
}

export interface AgentCapabilityCeiling {
    version?: number;
    allowedProjectUuids: UUID[] | null;
    allowedUserUuids?: UUID[] | null;
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
                allowedUserUuids: null,
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
            allowedUserUuids: policy.allowedUserUuids,
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

    private createEvaluation(
        policy: ResolvedAgentPolicy,
        args: AssertOperationArgs,
    ) {
        const requiredCapabilities = requiredCapabilitiesForOperation(
            args.kind,
            args.key,
            args.connectedTool,
        );
        const operation: AgentPermissionEvaluationContext = {
            requiredCapabilities,
            projectUuid: args.projectUuid,
            userUuid: args.account.user.id,
            humanOnly:
                args.kind === 'rest_operation' &&
                HUMAN_ONLY_IN_MANAGED.has(args.key),
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
            warehouseConfirmed: false,
            isOrganizationDiscovery: ORGANIZATION_DISCOVERY_OPERATIONS[
                args.kind
            ].includes(args.key),
        };
        const steps = agentPermissionChecks(policy, operation);
        const checks: AgentPermissionCheck[] = [];
        let settingsPromise: Promise<void> | undefined;
        let confirmationPromise: Promise<void> | undefined;
        const readCheck = async (step: (typeof steps)[number]) => {
            if (step.kind === 'agent_enabled') {
                settingsPromise ??= this.deps
                    .getOrganizationSettings(args.organizationUuid)
                    .then((settings) => {
                        operation.mcpAgentsEnabled =
                            settings?.mcpAgentsEnabled ?? true;
                        operation.mcpContentWritesEnabled =
                            settings?.mcpContentWritesEnabled ?? true;
                    });
                await settingsPromise;
            }
            if (
                step.kind === 'warehouse_confirmation' &&
                requiredCapabilities?.includes(AgentCapability.RawSql) &&
                args.projectUuid !== null
            ) {
                confirmationPromise ??= Promise.all([
                    this.deps.agentWarehouseRestrictionConfirmationModel.get(
                        args.projectUuid,
                    ),
                    this.deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint(
                        args.projectUuid,
                    ),
                ]).then(([confirmation, fingerprint]) => {
                    operation.warehouseConfirmed =
                        confirmation != null &&
                        confirmation.bindingFingerprint === fingerprint;
                    operation.warehouseStale =
                        confirmation != null && !operation.warehouseConfirmed;
                });
                await confirmationPromise;
            }
            const check = step.evaluate();
            checks.push(check);
            return check;
        };
        const readChecks = async (
            stopAtRefusal: boolean,
            options: {
                signal?: AbortSignal;
                skipWarehouseConfirmation?: boolean;
            } = {},
            index = checks.length,
        ): Promise<AgentPermissionCheck | null> => {
            options.signal?.throwIfAborted();
            const step = steps[index];
            if (!step) return null;
            if (
                options.skipWarehouseConfirmation &&
                step.kind === 'warehouse_confirmation'
            )
                return readChecks(stopAtRefusal, options, index + 1);
            const check = await readCheck(step);
            if (stopAtRefusal && check.reason !== null) return check;
            return readChecks(stopAtRefusal, options, index + 1);
        };
        return {
            checks,
            readChecks,
            requiredCapabilities: [...(requiredCapabilities ?? [])],
        };
    }

    async assertOperation(args: AssertOperationArgs): Promise<void> {
        const policy = await this.resolvePolicy(args);
        if (policy.mode !== 'managed') return;
        const evaluation = this.createEvaluation(policy, args);
        const primary = await evaluation.readChecks(true);
        if (!primary) return;
        const error = permissionRefusal(primary, {
            operation: args.key,
            policyVersion: policy.version,
            projectUuid: args.projectUuid,
        });
        const { ability } = args.account.user;
        const hiddenProject =
            args.projectUuid !== null &&
            !ability.can(
                'view',
                subject('Project', {
                    organizationUuid: args.organizationUuid,
                    projectUuid: args.projectUuid,
                }),
            );
        const canManageOrganization = ability.can(
            'manage',
            subject('Organization', {
                organizationUuid: args.organizationUuid,
            }),
        );
        let blockersComplete = !hiddenProject;
        let diagnosticTimeout: ReturnType<typeof setTimeout> | undefined;
        const diagnosticAbort = new AbortController();
        try {
            await Promise.race([
                evaluation.readChecks(false, {
                    signal: diagnosticAbort.signal,
                    skipWarehouseConfirmation: hiddenProject,
                }),
                new Promise<never>((_, reject) => {
                    diagnosticTimeout = setTimeout(() => {
                        diagnosticAbort.abort();
                        reject(
                            new Error('Agent permission diagnostics timed out'),
                        );
                    }, 2000);
                }),
            ]);
        } catch {
            blockersComplete = false;
            this.logger.warn('Failed to collect agent permission blockers', {
                reason: error.refusal.reason,
                operation: args.key,
            });
        } finally {
            clearTimeout(diagnosticTimeout);
        }
        Object.assign(error.refusal, {
            requiredCapabilities: evaluation.requiredCapabilities,
            blockers: permissionBlockers(evaluation.checks)
                .filter(
                    (blocker) =>
                        !hiddenProject ||
                        blocker.checkId !== 'warehouse_confirmation',
                )
                .map((blocker) => {
                    if (blocker.checkId === primary.id) return blocker;
                    if (
                        (hiddenProject &&
                            blocker.settingsUrl?.startsWith(
                                '/generalSettings/projectManagement/',
                            )) ||
                        (!canManageOrganization &&
                            blocker.settingsUrl?.startsWith(
                                '/generalSettings/customRoles/',
                            ))
                    )
                        return {
                            ...blocker,
                            settingsUrl: '/generalSettings/agentIdentity',
                        };
                    return blocker;
                }),
            blockersComplete,
            explanationUrl: '/generalSettings/myAgentConnections',
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

    async resetToLegacy(
        account: Account,
        version: number | undefined,
    ): Promise<AgentCapabilityPolicy> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        const policy =
            await this.deps.agentCapabilityPolicyModel.get(organizationUuid);
        return this.deps.agentCapabilityPolicyModel.save({
            ...policy,
            version,
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
