import { subject } from '@casl/ability';
import useApp from '../../../../providers/App/useApp';

export const useAiAgentPermission = ({
    action,
}: {
    action: 'manage' | 'view';
}) => {
    const { user } = useApp();
    return user.data?.ability.can(
        action,
        subject('AiAgent', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );
};
