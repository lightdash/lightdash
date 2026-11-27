import { subject } from '@casl/ability';
import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertRegisteredAccount,
    assertUnreachable,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    ParameterError,
    type Account,
    type AgentActorSurface,
    type AgentCapabilityCeiling,
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicyOverview,
    type AgentPermissionCheck,
    type AgentProjectCapabilityPolicy,
    type AgentProjectCapabilityPolicySave,
    type AiAccessRefusal,
    type RegisteredAccount,
} from '@lightdash/common';
import { getRequiredAgentCapabilities } from '../../auth/agentPermissions/capabilityMap';
import { HUMAN_ONLY_WHEN_RESTRICTED } from '../../auth/agentPermissions/humanOnlyWhenRestricted';
import { getOAuthScopeContext } from '../../auth/oauthScopes/scopedAbility';
import { type AgentActionLogModel } from '../../models/AgentActionLogModel';
import {
    type AgentCapabilityPolicyModel,
    type AgentEnforcementPolicy,
} from '../../models/AgentCapabilityPolicyModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import { recordAgentRefusal } from '../AiAccessService/logAgentContentWrite';
import { BaseService } from '../BaseService';
import {
    evaluateAgentPermissionOperations,
    type AgentPermissionBulkArgs,
    type AgentPermissionBulkLoaders,
} from './agentPermissionBulkEvaluation';
import {
    agentPermissionChecks,
    permissionBlockers,
    permissionRefusal,
    type AgentPermissionEvaluationContext,
} from './agentPermissionEvaluation';

export interface ResolvedAgentPolicy {
    mode: 'off' | 'unrestricted' | 'restricted';
    capabilities: Set<AgentCapability> | null;
    allowedCapabilities: AgentCapability[] | null;
    allowedGroupUuids: string[] | null;
    version: number;
    /** True when the project's own restrictions replaced the organization's. */
    projectScoped?: boolean;
}

export interface AgentPolicyEvaluation {
    requiredCapabilities: readonly AgentCapability[] | null;
    projectUuid: string | null;
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
    | 'capability'
    | 'mcp_tool'
    | 'agent_tool'
    | 'tool_effect'
    | 'rest_operation'
    | 'connected_mcp_tool';

const requiredCapabilitiesForOperation = (
    kind: AgentPermissionOperationKind,
    key: string,
    connectedTool: ConnectedAgentTool | undefined,
): readonly AgentCapability[] | null => {
    switch (kind) {
        case 'capability':
            return Object.values(AgentCapability).filter(
                (capability) => capability === key,
            ).length === 1
                ? [key as AgentCapability]
                : null;
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
    areGroupsAvailable: (organizationUuid: string) => Promise<boolean>;
    groupsModel: Pick<GroupsModel, 'findUserInGroups'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    agentCapabilityPolicyModel: Pick<
        AgentCapabilityPolicyModel,
        | 'get'
        | 'getForEnforcement'
        | 'save'
        | 'getProjectPolicies'
        | 'saveProjectPolicy'
        | 'deleteProjectPolicy'
    >;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    agentActionLogModel: Pick<AgentActionLogModel, 'insert'>;
}

type ImmutableAgentEnforcementPolicy = {
    readonly version: number;
    readonly allowedCapabilities: readonly AgentCapability[] | null;
    readonly storedAllowedGroupUuids: readonly string[] | null;
    readonly hasExistingAllowedGroup: boolean | null;
};

type ProjectCapabilityLimits = ReadonlyMap<
    string,
    readonly AgentCapability[] | null
>;

// A project's own restrictions replace the organization's for that project.
const applyProjectPolicy = (
    policy: AgentCapabilityPolicy,
    projectLimit: readonly AgentCapability[] | null | undefined,
): AgentCapabilityPolicy & { projectScoped: boolean } =>
    projectLimit === undefined
        ? { ...policy, projectScoped: false }
        : {
              ...policy,
              allowedCapabilities:
                  projectLimit === null ? null : [...projectLimit],
              projectScoped: true,
          };

const toProjectLimits = (
    policies: AgentProjectCapabilityPolicy[],
): ProjectCapabilityLimits =>
    new Map(
        policies.map((policy) => [
            policy.projectUuid,
            policy.allowedCapabilities === null
                ? null
                : Object.freeze([...policy.allowedCapabilities]),
        ]),
    );

class AgentPermissionRequestHandle {
    private readonly memberships = new Map<string, Promise<boolean>>();

    constructor(
        readonly organizationUuid: string,
        readonly policy: ImmutableAgentEnforcementPolicy | null,
        readonly projectLimits: ProjectCapabilityLimits,
        private readonly findGroupMembership: (
            userUuid: string,
            groupUuids: string[],
        ) => Promise<boolean>,
    ) {
        Object.freeze(this);
    }

    get enforcementMode(): 'off' | 'admission' | 'restricted' {
        if (this.policy === null) return 'off';
        if (this.policy.allowedCapabilities !== null) return 'restricted';
        // A project that restricts agents needs the full check even when the
        // organization itself has no restrictions.
        if ([...this.projectLimits.values()].some((limit) => limit !== null))
            return 'restricted';
        return this.policy.storedAllowedGroupUuids === null
            ? 'off'
            : 'admission';
    }

    readGroupMembership(userUuid: string): Promise<boolean> {
        if (
            !this.policy?.hasExistingAllowedGroup ||
            !this.policy.storedAllowedGroupUuids?.length
        )
            return Promise.resolve(false);
        const existing = this.memberships.get(userUuid);
        if (existing) return existing;
        const membership = this.findGroupMembership(userUuid, [
            ...this.policy.storedAllowedGroupUuids,
        ]);
        this.memberships.set(userUuid, membership);
        return membership;
    }
}

export type AgentPermissionRequest = AgentPermissionRequestHandle;

interface AgentPermissionEvaluation {
    checks: AgentPermissionCheck[];
    readChecks(
        stopAtRefusal: boolean,
        options?: { signal?: AbortSignal },
        index?: number,
    ): Promise<AgentPermissionCheck | null>;
    requiredCapabilities: AgentCapability[];
}

const freezePolicy = (
    policy: AgentEnforcementPolicy,
): ImmutableAgentEnforcementPolicy =>
    Object.freeze({
        ...policy,
        allowedCapabilities:
            policy.allowedCapabilities === null
                ? null
                : Object.freeze([...policy.allowedCapabilities]),
        storedAllowedGroupUuids:
            policy.storedAllowedGroupUuids === null
                ? null
                : Object.freeze([...policy.storedAllowedGroupUuids]),
    });

const projectEnforcementPolicy = (
    policy: ImmutableAgentEnforcementPolicy,
): AgentCapabilityPolicy => {
    const allowedGroupUuids = policy.hasExistingAllowedGroup
        ? [...(policy.storedAllowedGroupUuids ?? [])]
        : [];
    return {
        version: policy.version,
        allowedCapabilities:
            policy.allowedCapabilities === null
                ? null
                : [...policy.allowedCapabilities],
        allowedGroupUuids:
            policy.storedAllowedGroupUuids === null ? null : allowedGroupUuids,
    };
};

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

    async loadRequest(
        organizationUuid: string,
    ): Promise<AgentPermissionRequest> {
        const [policy, projectLimits] = (await this.isEnabled(organizationUuid))
            ? await Promise.all([
                  this.deps.agentCapabilityPolicyModel
                      .getForEnforcement(organizationUuid)
                      .then(freezePolicy),
                  this.deps.agentCapabilityPolicyModel
                      .getProjectPolicies(organizationUuid)
                      .then(toProjectLimits),
              ])
            : [null, toProjectLimits([])];
        return new AgentPermissionRequestHandle(
            organizationUuid,
            policy,
            projectLimits,
            async (userUuid, groupUuids) =>
                (
                    await this.deps.groupsModel.findUserInGroups({
                        userUuid,
                        organizationUuid,
                        groupUuids,
                    })
                ).length > 0,
        );
    }

    async isRestricted(organizationUuid: string): Promise<boolean> {
        return (
            (await this.loadRequest(organizationUuid)).enforcementMode ===
            'restricted'
        );
    }

    async getEnforcementMode(
        organizationUuid: string,
    ): Promise<'off' | 'admission' | 'restricted'> {
        return (await this.loadRequest(organizationUuid)).enforcementMode;
    }

    async isEnforced(organizationUuid: string): Promise<boolean> {
        return (
            (await this.loadRequest(organizationUuid)).enforcementMode !== 'off'
        );
    }

    private static assertRequestOrganization(
        request: AgentPermissionRequest,
        organizationUuid: string,
    ): void {
        if (!(request instanceof AgentPermissionRequestHandle))
            throw new ForbiddenError(
                'The permission request was not created by the permission service',
            );
        if (request.organizationUuid !== organizationUuid)
            throw new ForbiddenError(
                'The permission request belongs to a different organization',
            );
    }

    private async resolvePolicyWithRequest({
        request,
        operation,
    }: {
        request: AgentPermissionRequest;
        operation: ResolvePolicyArgs;
    }): Promise<ResolvedAgentPolicy> {
        AgentPermissionService.assertRequestOrganization(
            request,
            operation.organizationUuid,
        );
        if (request.policy === null)
            return {
                mode: 'off',
                capabilities: null,
                allowedCapabilities: null,
                allowedGroupUuids: null,
                version: 0,
            };
        const policy = applyProjectPolicy(
            projectEnforcementPolicy(request.policy),
            operation.projectUuid === null
                ? undefined
                : request.projectLimits.get(operation.projectUuid),
        );
        if (policy.allowedCapabilities === null)
            return {
                ...policy,
                mode: 'unrestricted',
                capabilities: null,
            };
        return this.resolveRestrictedPolicy({ ...operation, policy });
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
                allowedCapabilities: null,
                allowedGroupUuids: null,
                version: 0,
            };
        const [organizationPolicy, projectPolicies] = await Promise.all([
            this.deps.agentCapabilityPolicyModel.get(organizationUuid),
            projectUuid === null
                ? []
                : this.deps.agentCapabilityPolicyModel.getProjectPolicies(
                      organizationUuid,
                  ),
        ]);
        const policy = applyProjectPolicy(
            organizationPolicy,
            projectUuid === null
                ? undefined
                : toProjectLimits(projectPolicies).get(projectUuid),
        );
        if (policy.allowedCapabilities === null)
            return {
                ...policy,
                mode: 'unrestricted',
                capabilities: null,
            };
        return this.resolveRestrictedPolicy({
            account,
            organizationUuid,
            projectUuid,
            policy,
        });
    }

    private async resolveRestrictedPolicy({
        account,
        organizationUuid,
        projectUuid,
        policy,
    }: ResolvePolicyArgs & {
        policy: AgentCapabilityPolicy & { projectScoped?: boolean };
    }): Promise<ResolvedAgentPolicy> {
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
        // Agents start from everything the person can do; the policy only
        // narrows it. The person's own permissions are checked separately.
        const capabilities = new Set<AgentCapability>(
            policy.allowedCapabilities ?? Object.values(AgentCapability),
        );
        return {
            mode: 'restricted',
            version: policy.version,
            allowedCapabilities: policy.allowedCapabilities,
            allowedGroupUuids: policy.allowedGroupUuids,
            capabilities,
            projectScoped: policy.projectScoped ?? false,
        };
    }

    async assertActorVerified(args: AssertActorVerifiedArgs): Promise<void> {
        if (args.actorVerified) return;
        const request = await this.loadRequest(args.organizationUuid);
        return this.assertActorVerifiedWithRequest({
            request,
            operation: args,
        });
    }

    async assertActorVerifiedWithRequest({
        request,
        operation: args,
    }: {
        request: AgentPermissionRequest;
        operation: AssertActorVerifiedArgs;
    }): Promise<void> {
        AgentPermissionService.assertRequestOrganization(
            request,
            args.organizationUuid,
        );
        if (args.actorVerified) return;
        if (request.enforcementMode === 'off' || request.policy === null)
            return;
        const { policy } = request;
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
        request: AgentPermissionRequest,
    ): AgentPermissionEvaluation {
        const requiredCapabilities =
            policy.mode === 'restricted'
                ? requiredCapabilitiesForOperation(
                      args.kind,
                      args.key,
                      args.connectedTool,
                  )
                : [];
        const operation: AgentPermissionEvaluationContext = {
            requiredCapabilities,
            projectUuid: args.projectUuid,
            userUuid: args.account.user.id,
            humanOnly:
                args.kind === 'rest_operation' &&
                HUMAN_ONLY_WHEN_RESTRICTED.has(args.key),
        };
        const steps = agentPermissionChecks(policy, operation);
        const checks: AgentPermissionCheck[] = [];
        let membershipPromise: Promise<void> | undefined;
        const readCheck = async (step: (typeof steps)[number]) => {
            if (
                step.kind === 'agent_admission' &&
                policy.allowedGroupUuids !== null
            ) {
                if (policy.allowedGroupUuids.length === 0)
                    operation.groupMember = false;
                else {
                    membershipPromise ??= request
                        .readGroupMembership(args.account.user.id)
                        .then((member) => {
                            operation.groupMember = member;
                        });
                    await membershipPromise;
                }
            }
            const check = step.evaluate();
            checks.push(check);
            return check;
        };
        const readChecks = async (
            stopAtRefusal: boolean,
            options: {
                signal?: AbortSignal;
            } = {},
            index = checks.length,
        ): Promise<AgentPermissionCheck | null> => {
            options.signal?.throwIfAborted();
            const step = steps[index];
            if (!step) return null;
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

    async evaluateOperations(
        args: AgentPermissionBulkArgs,
        loaders: AgentPermissionBulkLoaders,
    ): Promise<(AgentPermissionCheck | null)[]> {
        // The bulk loaders must be the models the single check reads from.
        if (!Object.is(loaders.projectModel, this.deps.projectModel))
            throw new Error(
                'Bulk agent permission loaders must be the models this service uses.',
            );
        return evaluateAgentPermissionOperations(
            this.deps,
            loaders,
            args,
            await this.loadRequest(args.organizationUuid),
            (deps) => {
                const reader = new AgentPermissionService(deps);
                return async (operation, request) => {
                    const policy = await reader.resolvePolicyWithRequest({
                        request,
                        operation,
                    });
                    return reader
                        .createEvaluation(policy, operation, request)
                        .readChecks(true);
                };
            },
        );
    }

    async assertOperation(args: AssertOperationArgs): Promise<void> {
        const request = await this.loadRequest(args.organizationUuid);
        return this.assertOperationWithRequest({ request, operation: args });
    }

    async assertOperationWithRequest({
        request,
        operation: args,
    }: {
        request: AgentPermissionRequest;
        operation: AssertOperationArgs;
    }): Promise<void> {
        const policy = await this.resolvePolicyWithRequest({
            request,
            operation: args,
        });
        if (
            policy.mode === 'off' ||
            (policy.mode === 'unrestricted' &&
                policy.allowedGroupUuids === null)
        )
            return;
        const evaluation = this.createEvaluation(policy, args, request);
        const primary = await evaluation.readChecks(true);
        if (!primary) return;
        const error = permissionRefusal(primary, {
            operation: args.key,
            policyVersion: policy.version,
            projectUuid: args.projectUuid,
        });
        if (policy.mode === 'unrestricted') {
            Object.assign(error.refusal, {
                requiredCapabilities: [],
                blockers: permissionBlockers(evaluation.checks),
                blockersComplete: true,
                explanationUrl: '/generalSettings/myAgentConnections',
            });
            await this.recordRefusal(args, error);
            throw error;
        }
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
        let blockersComplete = !hiddenProject;
        let diagnosticTimeout: ReturnType<typeof setTimeout> | undefined;
        const diagnosticAbort = new AbortController();
        try {
            await Promise.race([
                evaluation.readChecks(false, {
                    signal: diagnosticAbort.signal,
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
                        blocker.checkId === primary.id ||
                        !blocker.checkId.startsWith('capability:'),
                )
                .map((blocker) => {
                    if (blocker.checkId === primary.id) return blocker;
                    if (
                        hiddenProject &&
                        blocker.settingsUrl?.startsWith(
                            '/generalSettings/projectManagement/',
                        )
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

    async getPolicy(account: Account): Promise<AgentCapabilityPolicyOverview> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        return {
            ...(await this.deps.agentCapabilityPolicyModel.get(
                organizationUuid,
            )),
            groupsAvailable:
                await this.deps.areGroupsAvailable(organizationUuid),
        };
    }

    async saveCeiling(
        account: Account,
        ceiling: AgentCapabilityCeiling,
    ): Promise<AgentCapabilityPolicy> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        AgentPermissionService.validateVersion(ceiling.version);
        if (
            ceiling.allowedCapabilities !== undefined &&
            ceiling.allowedCapabilities !== null &&
            (!Array.isArray(ceiling.allowedCapabilities) ||
                ceiling.allowedCapabilities.some(
                    (capability) =>
                        !Object.values(AgentCapability).includes(capability),
                ))
        )
            throw new ParameterError(
                'Provide a valid capability list, or null for no restrictions',
            );
        if (
            ceiling.allowedGroupUuids !== undefined &&
            ceiling.allowedGroupUuids !== null &&
            !(await this.deps.areGroupsAvailable(organizationUuid))
        )
            throw new ParameterError(
                'Groups are not available for this organization.',
            );
        return this.deps.agentCapabilityPolicyModel.save({
            version: ceiling.version,
            allowedCapabilities: ceiling.allowedCapabilities,
            allowedGroupUuids: ceiling.allowedGroupUuids,
            organizationUuid,
            updatedByUserUuid: account.user.id,
        });
    }

    async getProjectPolicies(
        account: Account,
    ): Promise<AgentProjectCapabilityPolicy[]> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        return this.deps.agentCapabilityPolicyModel.getProjectPolicies(
            organizationUuid,
        );
    }

    private async assertProjectInOrganization(
        projectUuid: string,
        organizationUuid: string,
    ): Promise<void> {
        const project = await this.deps.projectModel.getSummary(projectUuid);
        if (project.organizationUuid !== organizationUuid)
            throw new ForbiddenError(
                'The project does not belong to this organization',
            );
    }

    async saveProjectPolicy(
        account: Account,
        projectUuid: string,
        body: AgentProjectCapabilityPolicySave,
    ): Promise<AgentProjectCapabilityPolicy> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        await this.assertProjectInOrganization(projectUuid, organizationUuid);
        const allowed = body?.allowedCapabilities;
        if (
            allowed !== null &&
            (!Array.isArray(allowed) ||
                allowed.some(
                    (capability) =>
                        !Object.values(AgentCapability).includes(capability),
                ))
        )
            throw new ParameterError(
                'Provide a valid capability list, or null for no restrictions',
            );
        return this.deps.agentCapabilityPolicyModel.saveProjectPolicy({
            projectUuid,
            allowedCapabilities:
                allowed === null
                    ? null
                    : Object.values(AgentCapability).filter((capability) =>
                          allowed.includes(capability),
                      ),
            updatedByUserUuid: account.user.id,
        });
    }

    async deleteProjectPolicy(
        account: Account,
        projectUuid: string,
    ): Promise<void> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        await this.assertProjectInOrganization(projectUuid, organizationUuid);
        await this.deps.agentCapabilityPolicyModel.deleteProjectPolicy(
            projectUuid,
        );
    }

    private static validateVersion(version: number | undefined): void {
        if (
            version !== undefined &&
            (!Number.isInteger(version) || version < 0)
        )
            throw new ParameterError(
                'Provide a non-negative integer policy version',
            );
    }

    async resetPolicy(
        account: Account,
        version: number | undefined,
    ): Promise<AgentCapabilityPolicy> {
        const organizationUuid = await this.assertPolicyAdmin(account);
        AgentPermissionService.validateVersion(version);
        return this.deps.agentCapabilityPolicyModel.save({
            allowedCapabilities: null,
            allowedGroupUuids: undefined,
            version,
            organizationUuid,
            updatedByUserUuid: account.user.id,
        });
    }
}
