import { subject } from '@casl/ability';
import useApp from '../../../../providers/App/useApp';

export const useAiAgentPermission = ({
    action,
    projectUuid,
}: {
    action: 'manage' | 'view';
    projectUuid?: string;
}) => {
    const { user } = useApp();
    return user.data?.ability.can(
        action,
        subject('AiAgent', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
};

export const useAiAgentOrgPermission = ({
    action,
}: {
    action: 'manage' | 'view';
}) => {
    const { user } = useApp();
    return user.data?.ability.can(
        action,
        subject('OrganizationAiAgent', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );
};
