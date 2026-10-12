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

export const getManagedAgentPolicy = async ({
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
    const policy = await new AgentCapabilityPolicyModel({ database }).get(
        organizationUuid,
    );
    return policy.mode === 'managed' ? policy : null;
};

export const assertHumanManagedMutation = async (
    context: HumanManagedMutationContext,
): Promise<void> => {
    const policy = await getManagedAgentPolicy(context);
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
