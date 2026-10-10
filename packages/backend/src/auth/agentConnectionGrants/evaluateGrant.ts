import {
    AGENT_CAPABILITY_DEFINITIONS,
    AGENT_CONNECTION_GRANT_CONTRACT_VERSION,
    AgentCapability,
    ForbiddenError,
    type Account,
    type OAuthAgentConnectionGrant,
} from '@lightdash/common';
import {
    getRequiredAgentCapabilities,
    type AgentCapabilityOperationKind,
} from '../agentPermissions/capabilityMap';
import { HUMAN_ONLY_IN_MANAGED } from '../agentPermissions/humanOnlyInManaged';

const ORG_DISCOVERY_OPERATIONS: ReadonlySet<string> = new Set([
    'UserController.getAuthenticatedUser',
    'OrganizationController.getOrganization',
    'apiV1Router GET /health',
]);

const RESOURCE_CREATION_OPERATIONS: ReadonlySet<string> = new Set([
    'ProjectController.createPreview',
    'organizationRouter POST /projects/precompiled',
]);

export const evaluateGrant = ({
    grant,
    kind,
    key,
    projectUuids,
    now,
    deploymentOverrides = null,
}: {
    grant: Pick<
        OAuthAgentConnectionGrant,
        | 'approvedCapabilities'
        | 'approvedProjectUuids'
        | 'resourceConstraints'
        | 'grantContractVersion'
        | 'expiresAt'
    >;
    kind: AgentCapabilityOperationKind;
    key: string;
    projectUuids: readonly string[];
    now: Date;
    deploymentOverrides?: { target?: unknown; sourceUuid?: unknown } | null;
}): string | null => {
    if (
        grant.grantContractVersion !==
            AGENT_CONNECTION_GRANT_CONTRACT_VERSION ||
        grant.resourceConstraints.version !== 1
    )
        return 'This agent connection has an unsupported grant contract.';
    if (grant.expiresAt.getTime() <= now.getTime())
        return 'This agent connection has expired.';
    const required = getRequiredAgentCapabilities(kind, key);
    if (required === null)
        return "This agent connection can't use this operation.";
    if (kind === 'mcp' && key === 'list_projects')
        return "This agent connection can't list organization projects.";
    if (HUMAN_ONLY_IN_MANAGED.has(key))
        return 'This operation requires a person.';
    if (RESOURCE_CREATION_OPERATIONS.has(key))
        return "This agent connection can't create projects or previews.";
    if (
        kind === 'rest' &&
        /^(Organization|UserController|organizationRouter|apiV1Router)/.test(
            key,
        ) &&
        !ORG_DISCOVERY_OPERATIONS.has(key)
    )
        return "This agent connection can't use this organization operation.";
    const upload =
        kind === 'rest' &&
        /^ProjectCoderController\.(legacyUpsert|upsert|pullContentAsCodeFromGit)/.test(
            key,
        );
    const capabilities = upload
        ? [...new Set([...required, AgentCapability.DeployUpload])]
        : required;
    const missing = capabilities.find(
        (capability) => !grant.approvedCapabilities.includes(capability),
    );
    if (missing) {
        const allowed =
            grant.approvedCapabilities
                .map(
                    (capability) =>
                        AGENT_CAPABILITY_DEFINITIONS[capability].name,
                )
                .join(', ') || 'none';
        return `This agent connection can't ${AGENT_CAPABILITY_DEFINITIONS[missing].name}. Allowed: ${allowed}.`;
    }
    if (
        projectUuids.length === 0 &&
        !(kind === 'rest' && ORG_DISCOVERY_OPERATIONS.has(key))
    )
        return "This agent connection can't use an unresolved project.";
    if (projectUuids.some((uuid) => !grant.approvedProjectUuids.includes(uuid)))
        return "This agent connection can't use this project.";
    if (
        deploymentOverrides &&
        (deploymentOverrides.target != null ||
            deploymentOverrides.sourceUuid != null)
    )
        return "This agent connection can't override a deployment target or source.";
    return null;
};

export const assertAgentConnectionGrantOperation = (
    account: Account | undefined,
    operation: Omit<Parameters<typeof evaluateGrant>[0], 'grant' | 'now'>,
): void => {
    if (
        account?.authentication.type !== 'oauth' ||
        !account.authentication.agentConnectionGrant
    )
        return;
    const refusal = evaluateGrant({
        ...operation,
        now: new Date(),
        grant: account.authentication.agentConnectionGrant,
    });
    if (refusal !== null) throw new ForbiddenError(refusal);
};
