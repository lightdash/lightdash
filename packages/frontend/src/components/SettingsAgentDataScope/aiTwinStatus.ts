import {
    AiIdentityStatus,
    assertUnreachable,
    type AiIdentity,
    type SnowflakeAiBoundaryCheck,
} from '@lightdash/common';
import type { GuideStepStatus } from './snowflakeAiBoundaryStatus';

export const aiIdentityStatusColor = (status: AiIdentityStatus): string => {
    switch (status) {
        case AiIdentityStatus.PENDING:
            return 'yellow';
        case AiIdentityStatus.READY:
            return 'green';
        case AiIdentityStatus.FAILED:
            return 'red';
        default:
            return assertUnreachable(status, 'Unknown AI identity status');
    }
};
export const aiTwinFixStep = (
    id: SnowflakeAiBoundaryCheck['id'],
): SnowflakeAiBoundaryCheck['fixStep'] => {
    switch (id) {
        case 'masked_column':
            return 3;
        case 'agent_active':
            return 5;
        case 'result_scan_blocked':
        case 'secondary_roles_blocked':
            return 4;
        default:
            return assertUnreachable(id, 'Unknown boundary check');
    }
};
export const aiTwinCheckStatus = (
    identities: AiIdentity[],
    missingCount: number,
): GuideStepStatus => {
    if (identities.some(({ status }) => status === AiIdentityStatus.FAILED))
        return 'failed';
    if (missingCount > 0 || identities.length === 0) return 'to do';
    return identities.every(({ status }) => status === AiIdentityStatus.READY)
        ? 'done'
        : 'to do';
};
