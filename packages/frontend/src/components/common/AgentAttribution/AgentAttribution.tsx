import {
    AgentActorSurface,
    assertUnreachable,
    interpolateUiString,
    type AgentIdentityClaim,
    type ChartVersionSummary,
    type UiStringKey,
} from '@lightdash/common';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';

const surfaceKey = (surface: AgentActorSurface): UiStringKey => {
    switch (surface) {
        case AgentActorSurface.MCP:
            return 'agentAttribution.mcp';
        case AgentActorSurface.IN_APP_AGENT:
            return 'agentAttribution.inApp';
        case AgentActorSurface.SLACK_AGENT:
            return 'agentAttribution.slack';
        case AgentActorSurface.CLI:
            return 'agentAttribution.cli';
        case AgentActorSurface.API:
            return 'agentAttribution.api';
        case AgentActorSurface.DATA_APP:
            return 'agentAttribution.dataApp';
        case AgentActorSurface.AI_SUMMARY:
            return 'agentAttribution.aiSummary';
        default:
            return assertUnreachable(surface, 'Unknown agent surface');
    }
};

const AgentAttribution = ({
    claim,
    createdBy,
}: {
    claim: AgentIdentityClaim;
    createdBy: ChartVersionSummary['createdBy'];
}) => {
    const t = useUiStrings();
    const person =
        claim.subject.type === 'service_account'
            ? t('agentAttribution.serviceAccount')
            : createdBy?.userUuid === claim.subject.uuid
              ? `${createdBy.firstName} ${createdBy.lastName}`.trim() ||
                t('agentAttribution.unknownPerson')
              : t('agentAttribution.unknownPerson');
    return (
        <>
            {interpolateUiString(t('agentAttribution.changedBy'), {
                person,
                surface: t(surfaceKey(claim.act.surface)),
            })}
        </>
    );
};

export default AgentAttribution;
