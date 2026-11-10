import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    type AgentCapabilityPolicy,
    type MemberAbility,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getOAuthScopeContext } from '../../auth/oauthScopes/scopedAbility';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { agentExecutionContext } from '../AiAccessService/agentExecutionContext';

interface HumanManagedMutationContext {
    organizationUuid: string | null | undefined;
    ability: MemberAbility;
    oauth: boolean;
    database: Knex;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
}

const getAgentPolicyForMutation = async ({
    organizationUuid,
    ability,
    oauth,
    database,
    featureFlagModel,
}: HumanManagedMutationContext): Promise<AgentCapabilityPolicy | null> => {
    if (
        !organizationUuid ||
        (!oauth &&
            getOAuthScopeContext(ability) === null &&
            !agentExecutionContext.getStore())
    )
        return null;
    const flag = await featureFlagModel.get({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: { organizationUuid },
    });
    if (!flag.enabled) return null;
    return new AgentCapabilityPolicyModel({ database }).get(organizationUuid);
};

export const getManagedAgentPolicy = async (
    context: HumanManagedMutationContext,
): Promise<AgentCapabilityPolicy | null> => {
    const policy = await getAgentPolicyForMutation(context);
    return policy?.mode === 'managed' ? policy : null;
};

const assertHumanPolicyMutation = (
    policy: AgentCapabilityPolicy | null,
): void => {
    if (!policy) return;
    throw new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        {
            message:
                'Only a person can change agent grants or identity settings.',
            capability: AgentCapability.Administration,
            settingsUrl: '/generalSettings/agentIdentity',
            policyLayer: 'organization_setting',
            policyVersion: policy.version,
        },
    );
};

export const assertHumanManagedMutation = async (
    context: HumanManagedMutationContext,
): Promise<void> => {
    const policy = await getManagedAgentPolicy(context);
    assertHumanPolicyMutation(policy);
};

export const assertHumanAgentPolicyMutation = async (
    context: HumanManagedMutationContext,
): Promise<void> => {
    const policy = await getAgentPolicyForMutation(context);
    assertHumanPolicyMutation(policy);
};
