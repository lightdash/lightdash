import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    type MemberAbility,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getOAuthScopeContext } from '../../auth/oauthScopes/scopedAbility';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { agentExecutionContext } from '../AiAccessService/agentExecutionContext';

export const assertHumanManagedMutation = async ({
    organizationUuid,
    ability,
    oauth,
    database,
    featureFlagModel,
}: {
    organizationUuid: string | null | undefined;
    ability: MemberAbility;
    oauth: boolean;
    database: Knex;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
}): Promise<void> => {
    if (
        !organizationUuid ||
        (!oauth &&
            getOAuthScopeContext(ability) === null &&
            !agentExecutionContext.getStore())
    )
        return;
    const flag = await featureFlagModel.get({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: { organizationUuid },
    });
    if (!flag.enabled) return;
    const policy = await new AgentCapabilityPolicyModel({ database }).get(
        organizationUuid,
    );
    if (policy.mode !== 'managed') return;
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
