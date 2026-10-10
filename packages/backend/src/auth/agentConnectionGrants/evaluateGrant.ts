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
import {
    getGrantOperationContract,
    GRANT_MCP_TOOL_CONTRACTS,
} from './operationContracts';

export const evaluateGrant = ({
    grant,
    kind,
    key,
    projectUuids,
    now,
    deploymentOverrides = null,
    additionalCapabilities = [],
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
    additionalCapabilities?: readonly AgentCapability[];
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
    if (HUMAN_ONLY_IN_MANAGED.has(key))
        return 'This operation requires a person.';
    const contract = kind === 'rest' ? getGrantOperationContract(key) : null;
    if (
        (kind === 'rest' && contract === null) ||
        (kind === 'mcp' &&
            !Object.prototype.hasOwnProperty.call(
                GRANT_MCP_TOOL_CONTRACTS,
                key,
            ))
    )
        return "This agent connection can't use this operation.";
    const required = getRequiredAgentCapabilities(kind, key);
    if (required === null)
        return "This agent connection can't use this operation.";
    const capabilities = [
        ...new Set([
            ...required,
            ...additionalCapabilities,
            ...(contract?.kind === 'content_upload'
                ? [AgentCapability.DeployUpload]
                : []),
        ]),
    ];
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
        return `This agent connection is not approved for ${AGENT_CAPABILITY_DEFINITIONS[missing].name}. Approved: ${allowed}.`;
    }
    if (projectUuids.length === 0 && contract?.kind !== 'org_discovery')
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
