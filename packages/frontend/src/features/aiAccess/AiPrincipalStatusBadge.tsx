import {
    AiPrincipalFailureReason,
    AiPrincipalStatus,
    type AiPrincipal,
} from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
const labels: Record<AiPrincipalFailureReason, string> = {
    [AiPrincipalFailureReason.CREDENTIAL_REJECTED]: 'Credential rejected',
    [AiPrincipalFailureReason.WRONG_PRINCIPAL]: 'Wrong principal',
    [AiPrincipalFailureReason.NOT_AGENT_SESSION]: 'Not an agent session',
    [AiPrincipalFailureReason.NO_RESTRICTED_SESSION_SCOPE]:
        'No restricted session scope',
    [AiPrincipalFailureReason.NOT_GROUP_MEMBER]: 'Not a group member',
    [AiPrincipalFailureReason.RESULT_CACHE_ON]: 'Result cache is on',
    [AiPrincipalFailureReason.PROCEDURE_MISSING]: 'Procedure missing',
    [AiPrincipalFailureReason.WAREHOUSE_ACCESS]: 'Warehouse access',
    [AiPrincipalFailureReason.DISABLED_OR_LOCKED]: 'Disabled or locked',
    [AiPrincipalFailureReason.NETWORK_POLICY]: 'Network policy',
    [AiPrincipalFailureReason.BROKER_FAILED]: 'Broker failed',
    [AiPrincipalFailureReason.UNKNOWN]: 'Check failed',
};
export const AiPrincipalStatusBadge = ({
    principal,
}: {
    principal: AiPrincipal;
}) => (
    <Tooltip
        disabled={!principal.statusMessage}
        label={principal.statusMessage}
        multiline
        maw={400}
    >
        <Badge
            style={{ textTransform: 'none', maxWidth: 'none' }}
            color={
                principal.status === AiPrincipalStatus.READY
                    ? 'green'
                    : principal.status === AiPrincipalStatus.FAILED
                      ? 'red'
                      : 'gray'
            }
        >
            {principal.status === AiPrincipalStatus.FAILED
                ? `Failed: ${principal.failureReason ? labels[principal.failureReason] : 'Check failed'}`
                : principal.status === AiPrincipalStatus.READY
                  ? 'Ready'
                  : 'Pending'}
        </Badge>
    </Tooltip>
);
